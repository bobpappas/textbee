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

const navigation = vi.hoisted(() => ({ section: 'messages' }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(`section=${navigation.section}`),
}))

const organizationId = mockOrganizationContext.organization.id
const group = mockOrganizationGroups[0]
const url = (path: string) => `${API_BASE_URL}${path}`

describe('GroupWorkspace group messaging', () => {
  it('invalidates edited previews and confirms the server-authoritative message', async () => {
    navigation.section = 'messages'
    const confirm = vi.fn()
    server.use(
      http.get(url(ApiEndpoints.organizations.group(organizationId, group.id)), () =>
        HttpResponse.json({ data: group }),
      ),
      http.get(url(ApiEndpoints.organizations.roster(organizationId, group.id)), () =>
        HttpResponse.json({ data: mockRosterMembers }),
      ),
      http.get(url(ApiEndpoints.organizations.groupCommunications(organizationId, group.id)), () =>
        HttpResponse.json({ data: { view: 'unread', items: [], nextCursor: null, counts: { unread: 0 } } }),
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
              joinCode: group.joinCode,
              body: body.body,
              message: `${group.joinCode}: ${body.body}`,
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
              joinCode: group.joinCode,
              message: `${group.joinCode}: Updated body`,
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
    expect(screen.getByLabelText('Required prefix')).toHaveValue(`${group.joinCode}:`)
    const message = screen.getByLabelText('Message')
    await user.type(message, 'Original body')
    await user.click(screen.getByRole('button', { name: 'Preview recipients' }))
    expect(await screen.findByText(`${group.joinCode}: Original body`)).toBeInTheDocument()
    expect(screen.getByText('Synthetic Excluded · ***0199')).toBeInTheDocument()

    await user.clear(message)
    await user.type(message, 'Updated body')
    expect(screen.queryByText(`${group.joinCode}: Original body`)).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Preview recipients' }))
    await user.click(await screen.findByRole('button', { name: 'Confirm send to 1' }))

    expect(await screen.findByText('Group send queued')).toBeInTheDocument()
    expect(confirm).toHaveBeenCalledWith(expect.stringMatching(/\S+/))
  })

  it('edits contact details and records missing consent as separate actions', async () => {
    navigation.section = 'people'
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

  it('adds a send-ineligible roster member without claiming consent', async () => {
    navigation.section = 'people'
    const addedMember = {
      id: '64b7c42f18f0c31f8c9fd402',
      contactId: '64b7c42f18f0c31f8c9fd502',
      displayName: 'Synthetic New',
      mobileNumber: '+12085550124',
      displayNumber: '(208) 555-0124',
      consentStatus: 'MISSING',
    }
    const addPerson = vi.fn()
    let roster: typeof mockRosterMembers | (typeof addedMember)[] = []
    server.use(
      http.get(url(ApiEndpoints.organizations.group(organizationId, group.id)), () =>
        HttpResponse.json({ data: group }),
      ),
      http.get(url(ApiEndpoints.organizations.roster(organizationId, group.id)), () =>
        HttpResponse.json({ data: roster }),
      ),
      http.get(url(ApiEndpoints.organizations.operators(organizationId)), () =>
        HttpResponse.json({ data: group.owners }),
      ),
      http.get(url(ApiEndpoints.organizations.receivingNumbers(organizationId)), () =>
        HttpResponse.json({ data: [] }),
      ),
      http.post(
        url(ApiEndpoints.organizations.roster(organizationId, group.id)),
        async ({ request }) => {
          addPerson(await request.json())
          roster = [addedMember]
          return HttpResponse.json({ data: addedMember })
        },
      ),
      http.get(
        url(
          ApiEndpoints.organizations.contactDetails(
            organizationId,
            group.id,
            addedMember.contactId,
          ),
        ),
        () => HttpResponse.json({ data: addedMember }),
      ),
    )

    const user = userEvent.setup()
    renderWithProviders(
      <OrganizationContextProvider enabled>
        <GroupWorkspace groupId={group.id} />
      </OrganizationContextProvider>,
    )

    await user.click(await screen.findByRole('button', { name: 'Add person' }))
    expect(
      screen.getByText(/added to the roster but cannot receive messages/i),
    ).toBeInTheDocument()
    expect(screen.getByLabelText(/Consent method note/)).toBeDisabled()
    await user.type(screen.getByLabelText('Display name'), 'Synthetic New')
    await user.type(screen.getByLabelText('US mobile number'), '(208) 555-0124')
    await user.click(screen.getByRole('button', { name: 'Add person' }))

    expect(addPerson).toHaveBeenCalledWith({
      displayName: 'Synthetic New',
      mobileNumber: '(208) 555-0124',
      consentAffirmed: false,
    })
    expect(await screen.findByText('Synthetic New')).toBeInTheDocument()
    expect(screen.getByText('No active group consent')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Edit details' }))
    expect(await screen.findByText('Missing')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Record consent' })).toBeInTheDocument()
  })
})
