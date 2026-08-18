import { http, HttpResponse } from 'msw'
import { describe, expect, it, vi } from 'vitest'
import { ApiEndpoints } from '@/config/api'
import {
  API_BASE_URL,
  mockOrganizationContext,
  mockOrganizationGroups,
  mockRosterMembers,
} from '@/test/fixtures'
import { server } from '@/test/msw/server'
import { renderWithProviders, screen, userEvent } from '@/test/render'
import OrganizationContextProvider from '@/components/organizations/organization-context-provider'
import GroupWorkspace from './group-workspace'

const organizationId = mockOrganizationContext.organization.id
const group = mockOrganizationGroups[0]
const url = (path: string) => `${API_BASE_URL}${path}`

describe('GroupWorkspace group messaging', () => {
  it('invalidates edited previews and confirms the server-authoritative message', async () => {
    const confirm = vi.fn()
    server.use(
      http.get(url(ApiEndpoints.organizations.group(organizationId, group.id)), () =>
        HttpResponse.json({ data: group }),
      ),
      http.get(url(ApiEndpoints.organizations.roster(organizationId, group.id)), () =>
        HttpResponse.json({ data: mockRosterMembers }),
      ),
      http.get(url(ApiEndpoints.organizations.operators(organizationId)), () =>
        HttpResponse.json({ data: group.owners }),
      ),
      http.get(url(ApiEndpoints.organizations.receivingNumbers(organizationId)), () =>
        HttpResponse.json({
          data: [
            {
              id: group.receivingNumberId,
              number: group.receivingNumber,
              displayNumber: group.displayNumber,
            },
          ],
        }),
      ),
      http.post(
        url(ApiEndpoints.organizations.groupMessagePreview(organizationId, group.id)),
        async ({ request }) => {
          const body = (await request.json()) as { body: string }
          return HttpResponse.json({
            data: {
              id: 'preview-1',
              group: { id: group.id, displayName: group.displayName },
              body: body.body,
              message: `${group.displayName}: ${body.body}`,
              deviceId: 'device-1',
              candidateCount: 2,
              eligibleCount: 1,
              excludedCount: 1,
              reasonCounts: { ORGANIZATION_SUPPRESSION: 1 },
              excluded: [
                {
                  displayName: 'Synthetic Excluded',
                  maskedNumber: '***0199',
                  reason: 'ORGANIZATION_SUPPRESSION',
                  explanation: 'This number has opted out of organization messaging.',
                },
              ],
              segmentsPerRecipient: 1,
              totalSegments: 1,
              remainingCapacity: {
                minuteSegments: 9,
                dailySegments: 199,
                rolling30DaySegments: 1999,
              },
              capacityAvailable: true,
              canConfirm: true,
              expiresAt: new Date(Date.now() + 60_000).toISOString(),
            },
          })
        },
      ),
      http.post(
        url(ApiEndpoints.organizations.groupMessageConfirm(organizationId, group.id, 'preview-1')),
        async ({ request }) => {
          confirm(request.headers.get('x-request-id'))
          return HttpResponse.json({
            data: {
              id: 'send-1',
              status: 'QUEUED',
              groupName: group.displayName,
              message: `${group.displayName}: Updated body`,
              candidateCount: 2,
              counts: { QUEUED: 1, EXCLUDED: 1 },
              recipients: [
                { displayName: 'Jordan Lee', maskedNumber: '***0123', status: 'QUEUED' },
                { displayName: 'Synthetic Excluded', maskedNumber: '***0199', status: 'EXCLUDED' },
              ],
              createdAt: new Date().toISOString(),
            },
          })
        },
      ),
    )

    const user = userEvent.setup()
    renderWithProviders(
      <OrganizationContextProvider enabled>
        <GroupWorkspace groupId={group.id} />
      </OrganizationContextProvider>,
    )

    await user.click(await screen.findByRole('button', { name: 'Send message' }))
    expect(screen.getByLabelText('Required prefix')).toHaveValue(`${group.displayName}:`)
    const message = screen.getByLabelText('Message')
    await user.type(message, 'Original body')
    await user.click(screen.getByRole('button', { name: 'Preview recipients' }))
    expect(await screen.findByText(`${group.displayName}: Original body`)).toBeInTheDocument()
    expect(screen.getByText('Synthetic Excluded · ***0199')).toBeInTheDocument()

    await user.clear(message)
    await user.type(message, 'Updated body')
    expect(screen.queryByText(`${group.displayName}: Original body`)).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Preview recipients' }))
    await user.click(await screen.findByRole('button', { name: 'Confirm send to 1' }))

    expect(await screen.findByText('Group send queued')).toBeInTheDocument()
    expect(confirm).toHaveBeenCalledWith(expect.stringMatching(/\S+/))
  })

  it('edits contact details and records missing consent as separate actions', async () => {
    const member = mockRosterMembers[0]
    const rename = vi.fn()
    const recordConsent = vi.fn()
    let consentStatus: 'MISSING' | 'ACTIVE' = 'MISSING'
    server.use(
      http.get(url(ApiEndpoints.organizations.group(organizationId, group.id)), () =>
        HttpResponse.json({ data: group }),
      ),
      http.get(url(ApiEndpoints.organizations.roster(organizationId, group.id)), () =>
        HttpResponse.json({ data: mockRosterMembers }),
      ),
      http.get(url(ApiEndpoints.organizations.operators(organizationId)), () =>
        HttpResponse.json({ data: group.owners }),
      ),
      http.get(url(ApiEndpoints.organizations.receivingNumbers(organizationId)), () =>
        HttpResponse.json({ data: [] }),
      ),
      http.get(
        url(
          ApiEndpoints.organizations.contactDetails(
            organizationId,
            group.id,
            member.contactId,
          ),
        ),
        () =>
          HttpResponse.json({
            data: {
              contactId: member.contactId,
              displayName: member.displayName,
              displayNumber: member.displayNumber,
              consentStatus,
              ...(consentStatus === 'ACTIVE'
                ? {
                    consentSource: 'OPERATOR_AFFIRMATION',
                    consentedAt: '2026-08-18T12:00:00.000Z',
                  }
                : {}),
            },
          }),
      ),
      http.patch(
        url(
          ApiEndpoints.organizations.contactName(
            organizationId,
            group.id,
            member.contactId,
          ),
        ),
        async ({ request }) => {
          rename(await request.json())
          return HttpResponse.json({ data: member })
        },
      ),
      http.post(
        url(
          ApiEndpoints.organizations.contactConsent(
            organizationId,
            group.id,
            member.contactId,
          ),
        ),
        async ({ request }) => {
          recordConsent(await request.json())
          consentStatus = 'ACTIVE'
          return HttpResponse.json({
            data: {
              contactId: member.contactId,
              displayName: member.displayName,
              displayNumber: member.displayNumber,
              consentStatus,
              consentSource: 'OPERATOR_AFFIRMATION',
              consentedAt: '2026-08-18T12:00:00.000Z',
            },
          })
        },
      ),
    )

    const user = userEvent.setup()
    renderWithProviders(
      <OrganizationContextProvider enabled>
        <GroupWorkspace groupId={group.id} />
      </OrganizationContextProvider>,
    )

    await user.click(await screen.findByRole('button', { name: 'Edit details' }))
    expect(await screen.findByText('Missing')).toBeInTheDocument()
    expect(screen.getByLabelText('Mobile number')).toHaveValue(
      member.displayNumber,
    )
    expect(screen.getByLabelText('Mobile number')).toHaveAttribute('readonly')

    const displayName = screen.getByLabelText('Display name')
    await user.clear(displayName)
    await user.type(displayName, 'Jordan Updated')
    await user.click(screen.getByRole('button', { name: 'Save name' }))
    expect(await screen.findByText('Name updated.')).toBeInTheDocument()
    expect(rename).toHaveBeenCalledWith({ displayName: 'Jordan Updated' })
    expect(recordConsent).not.toHaveBeenCalled()

    const affirmation = screen.getByRole('checkbox', {
      name: /asked to receive messages or provided this number/i,
    })
    await user.click(affirmation)
    await user.type(screen.getByLabelText('Consent method note (optional)'), 'Asked in person')
    await user.click(screen.getByRole('button', { name: 'Record consent' }))
    expect(recordConsent).toHaveBeenCalledWith({
      affirmed: true,
      methodNote: 'Asked in person',
    })
    expect(await screen.findByText('Source: Operator affirmation')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Record consent' })).not.toBeInTheDocument()
  })
})
