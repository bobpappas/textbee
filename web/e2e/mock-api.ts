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
}

export async function mockApi(page: Page, overrides: MockApiOverrides = {}) {
  const organizations: any[] = []
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
