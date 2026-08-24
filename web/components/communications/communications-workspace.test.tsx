import { http, HttpResponse } from 'msw'
import { describe, expect, it, vi } from 'vitest'
import OrganizationContextProvider from '@/components/organizations/organization-context-provider'
import { ApiEndpoints } from '@/config/api'
import { API_BASE_URL, mockOrganizationContext, mockOrganizationGroups } from '@/test/fixtures'
import { server } from '@/test/msw/server'
import { renderWithProviders, screen } from '@/test/render'
import CommunicationsWorkspace from './communications-workspace'

const navigation = vi.hoisted(() => ({ query: 'view=unread&conversation=conversation-1' }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(navigation.query),
}))

const organizationId = mockOrganizationContext.organization.id
const group = mockOrganizationGroups[0]
const url = (path: string) => `${API_BASE_URL}${path}`

describe('CommunicationsWorkspace', () => {
  it('shows a chronological group thread with honest attribution and sender-safe identity', async () => {
    const senderContext = {
      ...mockOrganizationContext,
      capabilities: ['groups:read', 'group-messages:send'],
      roleLabel: 'Group sender',
    }
    const list = {
      view: 'unread',
      items: [{
        id: 'conversation-1',
        contact: { displayName: 'Synthetic Contact', number: '***0123' },
        lastActivityAt: '2026-08-23T12:01:00.000Z',
        lastEntry: {
          id: 'entry-in', direction: 'INBOUND', kind: 'MESSAGE', message: 'Yes', eventAt: '2026-08-23T12:01:00.000Z', group: { id: group.id, displayName: group.displayName }, author: 'Contact', attribution: { state: 'LIKELY', method: 'RECENT_SEND', reason: 'Most recent group message within 72 hours', candidateGroupIds: [], manuallyAssigned: false }, version: 1,
        },
        unreadCount: 1,
        groupIds: [group.id],
        workState: { assigneeMembershipId: null, resolved: false, resolvedBy: null, resolvedAt: null, version: 1 },
      }],
      nextCursor: null,
      counts: { unread: 1 },
    }
    server.use(
      http.get(url(ApiEndpoints.organizations.currentContext()), () => HttpResponse.json({ data: senderContext })),
      http.get(url(ApiEndpoints.organizations.groupCommunications(organizationId, group.id)), () => HttpResponse.json({ data: list })),
      http.get(url(ApiEndpoints.organizations.conversation(organizationId, 'conversation-1')), () => HttpResponse.json({ data: {
        id: 'conversation-1',
        contact: { displayName: 'Synthetic Contact', number: '***0123' },
        entries: [
          { id: 'entry-out', direction: 'OUTBOUND', kind: 'MESSAGE', message: `${group.joinCode}: Can you attend?`, status: 'delivered', eventAt: '2026-08-23T12:00:00.000Z', group: { id: group.id, displayName: group.displayName }, author: 'Approved operator', attribution: { state: 'CONFIRMED', method: 'TRANSPORT_REPLY', reason: 'Persisted group delivery link', candidateGroupIds: [], manuallyAssigned: false }, version: 1 },
          { id: 'entry-in', direction: 'INBOUND', kind: 'MESSAGE', message: 'Yes', status: 'received', eventAt: '2026-08-23T12:01:00.000Z', group: { id: group.id, displayName: group.displayName }, author: 'Contact', attribution: { state: 'LIKELY', method: 'RECENT_SEND', reason: 'Most recent group message within 72 hours', candidateGroupIds: [], manuallyAssigned: false }, version: 1 },
        ],
        workState: { assigneeMembershipId: null, resolved: false, resolvedBy: null, resolvedAt: null, version: 1 },
      } })),
    )

    renderWithProviders(<OrganizationContextProvider enabled><CommunicationsWorkspace groupId={group.id} embedded /></OrganizationContextProvider>)

    expect((await screen.findAllByText('Synthetic Contact')).length).toBeGreaterThan(0)
    expect(screen.getAllByText('***0123').length).toBeGreaterThan(0)
    expect(screen.getByText(`${group.joinCode}: Can you attend?`)).toBeInTheDocument()
    expect(screen.getAllByText('Yes').length).toBeGreaterThan(0)
    expect(screen.getByText('LIKELY')).toBeInTheDocument()
    expect(screen.getByText(/Most recent group message within 72 hours/)).toBeInTheDocument()
    expect(screen.getByLabelText('Reply to Synthetic Contact directly')).toBeInTheDocument()
    expect(screen.queryByText('+12085550123')).not.toBeInTheDocument()
  })
})
