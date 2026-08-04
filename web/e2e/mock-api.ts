import type { Page, Route } from '@playwright/test'
import {
  mockApiKeys,
  mockBillingPlans,
  mockDevices,
  mockMessages,
  mockStats,
  mockSubscription,
  mockUser,
  mockWebhookNotifications,
  mockWebhooks,
  mockOrganizationContext,
  mockOrganizationGroups,
  mockRosterMembers,
} from '../test/fixtures'

const json = (route: Route, body: unknown, status = 200) =>
  route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  })

// Intercept EVERY call to the backend (`/api/v1/**`) and serve fixtures. Because
// the app is pointed at a backend host that nothing listens on, this guarantees
// no request ever reaches a real backend during e2e.
export type MockApiOverrides = {
  /** Serve a different subscription payload, e.g. the free-user shape. */
  subscription?: unknown
  /** Fail POST /billing/checkout with this message, to exercise the error state. */
  checkoutError?: string
  organizationsForbidden?: boolean
  organizationContext?: unknown
  organizationContexts?: unknown[]
  organizationContextDelayMs?: number
  organizationProfileForbidden?: boolean
  groups?: any[]
  rosterMembers?: any[]
  groupAccessDenied?: boolean
}

export async function mockApi(page: Page, overrides: MockApiOverrides = {}) {
  const organizations: any[] = []
  const groups: any[] = structuredClone(overrides.groups ?? mockOrganizationGroups)
  const rosterMembers: any[] = structuredClone(overrides.rosterMembers ?? mockRosterMembers)
  let contextRequestCount = 0
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname.replace('/api/v1', '')
    const method = route.request().method()

    if (path === '/organizations/current-context') {
      if (overrides.organizationContextDelayMs) {
        await new Promise((resolve) =>
          setTimeout(resolve, overrides.organizationContextDelayMs),
        )
      }
      const sequence = overrides.organizationContexts
      const sequenced = sequence?.length
        ? sequence[Math.min(contextRequestCount++, sequence.length - 1)]
        : undefined
      const created = organizations[0]
      const context =
        sequenced ??
        overrides.organizationContext ??
        (created
          ? {
              ...mockOrganizationContext,
              organization: {
                id: created.id,
                displayName: created.displayName,
              },
            }
          : {
              state: 'NO_ACCESS',
              organization: null,
              membership: null,
              capabilities: [],
              roleLabel: null,
            })
      return json(route, { data: context })
    }

    const receivingNumbersMatch = path.match(/^\/organizations\/([^/]+)\/receiving-numbers$/)
    if (receivingNumbersMatch) {
      return json(route, {
        data: [{ id: 'deployment-default', number: '+12085550100', displayNumber: '(208) 555-0100' }],
      })
    }

    const operatorsMatch = path.match(/^\/organizations\/([^/]+)\/operators$/)
    if (operatorsMatch) {
      return json(route, {
        data: [
          { membershipId: '64b7c42f18f0c31f8c9fd301', displayName: 'Alex Rivera' },
          { membershipId: '64b7c42f18f0c31f8c9fd302', displayName: 'Morgan Chen' },
        ],
      })
    }

    const groupListMatch = path.match(/^\/organizations\/([^/]+)\/groups$/)
    if (groupListMatch) {
      if (overrides.groupAccessDenied) return json(route, { error: 'Group not found' }, 404)
      if (method === 'POST') {
        const input = route.request().postDataJSON()
        const group = {
          id: `64b7c42f18f0c31f8c9fd20${groups.length + 2}`,
          organizationId: groupListMatch[1],
          displayName: input.displayName.trim(),
          status: 'ACTIVE',
          receivingNumberId: input.receivingNumberId,
          receivingNumber: '+12085550100',
          displayNumber: '(208) 555-0100',
          joinCode: input.joinCode.trim().toUpperCase(),
          joinCommand: `JOIN ${input.joinCode.trim().toUpperCase()}`,
          rosterCount: 0,
          owners: [],
        }
        groups.push(group)
        return json(route, { data: group })
      }
      const includeArchived = new URL(route.request().url()).searchParams.get('includeArchived') === 'true'
      return json(route, { data: includeArchived ? groups : groups.filter((group) => group.status === 'ACTIVE') })
    }

    const availabilityMatch = path.match(/^\/organizations\/([^/]+)\/groups\/join-code-availability$/)
    if (availabilityMatch) return json(route, { data: { available: true } })

    const rosterMatch = path.match(/^\/organizations\/([^/]+)\/groups\/([^/]+)\/roster$/)
    if (rosterMatch) {
      if (method === 'POST') {
        const input = route.request().postDataJSON()
        const member = {
          id: `64b7c42f18f0c31f8c9fd40${rosterMembers.length + 2}`,
          contactId: `64b7c42f18f0c31f8c9fd50${rosterMembers.length + 2}`,
          displayName: input.displayName.trim(),
          mobileNumber: '+12085550124',
          displayNumber: '(208) 555-0124',
        }
        rosterMembers.push(member)
        const group = groups.find((item) => item.id === rosterMatch[2])
        if (group) group.rosterCount = rosterMembers.length
        return json(route, { data: member })
      }
      return json(route, { data: rosterMembers })
    }

    const rosterMemberMatch = path.match(/^\/organizations\/([^/]+)\/groups\/([^/]+)\/roster\/([^/]+)$/)
    if (rosterMemberMatch && method === 'DELETE') {
      const index = rosterMembers.findIndex((item) => item.id === rosterMemberMatch[3])
      if (index >= 0) rosterMembers.splice(index, 1)
      return json(route, { data: { removed: true } })
    }

    const ownerMatch = path.match(/^\/organizations\/([^/]+)\/groups\/([^/]+)\/owners\/([^/]+)$/)
    if (ownerMatch) {
      const group = groups.find((item) => item.id === ownerMatch[2])
      if (!group) return json(route, { error: 'Group not found' }, 404)
      if (method === 'POST' && !group.owners.some((owner: any) => owner.membershipId === ownerMatch[3])) {
        group.owners.push({ membershipId: ownerMatch[3], displayName: ownerMatch[3].endsWith('2') ? 'Morgan Chen' : 'Alex Rivera' })
      }
      if (method === 'DELETE') group.owners = group.owners.filter((owner: any) => owner.membershipId !== ownerMatch[3])
      return json(route, { data: group })
    }

    const groupActionMatch = path.match(/^\/organizations\/([^/]+)\/groups\/([^/]+)(?:\/(name|join-settings|archive|reactivate))?$/)
    if (groupActionMatch) {
      if (overrides.groupAccessDenied) return json(route, { error: 'Group not found' }, 404)
      const group = groups.find((item) => item.id === groupActionMatch[2])
      if (!group) return json(route, { error: 'Group not found' }, 404)
      const action = groupActionMatch[3]
      const input = route.request().postDataJSON?.() ?? {}
      if (action === 'name' && method === 'PATCH') group.displayName = input.displayName.trim()
      if (action === 'join-settings' && method === 'PATCH') {
        group.joinCode = input.joinCode.trim().toUpperCase()
        group.joinCommand = `JOIN ${group.joinCode}`
      }
      if (action === 'archive' && method === 'POST') group.status = 'ARCHIVED'
      if (action === 'reactivate' && method === 'POST') group.status = 'ACTIVE'
      return json(route, { data: group })
    }

    if (path === '/platform/organizations') {
      if (overrides.organizationsForbidden) {
        return json(route, { error: 'Forbidden' }, 403)
      }
      if (method === 'POST') {
        const input = route.request().postDataJSON()
        const organization = {
          id: `organization-${organizations.length + 1}`,
          displayName: input.displayName,
          status: 'ACTIVE',
          createdAt: new Date('2026-08-02T12:00:00Z').toISOString(),
          activatedAt: new Date('2026-08-02T12:00:01Z').toISOString(),
          canManageProfile: true,
        }
        organizations.push(organization)
        return json(route, {
          data: {
            organization,
            membership: {
              id: 'membership-1',
              role: 'ORGANIZATION_ADMIN',
              status: 'ACTIVE',
            },
          },
        })
      }
      return json(route, { data: organizations })
    }

    const profileMatch = path.match(/^\/organizations\/([^/]+)\/profile$/)
    if (profileMatch) {
      if (overrides.organizationProfileForbidden) {
        return json(route, { error: 'Organization not found' }, 404)
      }
      const context = overrides.organizationContext as any
      const contextOrganization =
        context?.state === 'ACTIVE' &&
        context.organization?.id === profileMatch[1]
          ? {
              id: context.organization.id,
              displayName: context.organization.displayName,
              status: 'ACTIVE',
              canManageProfile: context.capabilities?.includes(
                'organization:profile:manage',
              ),
            }
          : null
      const organization =
        organizations.find((item) => item.id === profileMatch[1]) ??
        contextOrganization
      if (!organization)
        return json(route, { error: 'Organization not found' }, 404)
      if (method === 'PATCH') {
        organization.displayName = route.request().postDataJSON().displayName
      }
      return json(route, {
        data: {
          ...organization,
          role: 'ORGANIZATION_ADMIN',
          membershipId: 'membership-1',
        },
      })
    }

    // Kept in-origin so following the redirect does not leave the test app.
    if (path === '/billing/checkout') {
      if (overrides.checkoutError) {
        return json(route, { message: overrides.checkoutError }, 400)
      }
      return json(route, { redirectUrl: '/dashboard?polar-checkout-mock=1' })
    }

    if (path === '/auth/who-am-i') return json(route, { data: mockUser })
    if (path === '/billing/current-subscription')
      return json(route, overrides.subscription ?? mockSubscription)
    if (path === '/billing/plans')
      return json(route, { data: mockBillingPlans })
    if (path === '/gateway/devices') return json(route, { data: mockDevices })
    if (path === '/gateway/stats') return json(route, { data: mockStats })
    if (path === '/webhooks') return json(route, { data: mockWebhooks })
    if (path === '/webhooks/notifications')
      return json(route, mockWebhookNotifications)
    if (path === '/auth/api-keys') return json(route, { data: mockApiKeys })
    if (/\/gateway\/devices\/[^/]+\/(messages|get-received-sms)/.test(path))
      return json(route, mockMessages)

    // Any unmapped backend call still gets a benign mocked response so the test
    // cannot fall through to a real backend.
    return json(route, { data: [] })
  })
}
