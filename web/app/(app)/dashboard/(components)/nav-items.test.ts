import { describe, expect, it } from 'vitest'
import {
  isNavItemActive,
  navItems,
  visibleNavItems,
  visibleMobileNavItems,
} from './nav-items'

const activeContext = {
  state: 'ACTIVE' as const,
  organization: { id: 'org-1', displayName: 'Boise Church of Christ' },
  membership: { id: 'membership-1', status: 'ACTIVE' as const },
  capabilities: ['organization:profile:manage' as const],
  roleLabel: 'Organization administrator',
}

describe('isNavItemActive', () => {
  it('matches the dashboard home exactly', () => {
    expect(isNavItemActive({ href: '/dashboard' }, '/dashboard')).toBe(true)
    expect(
      isNavItemActive({ href: '/dashboard' }, '/dashboard/messaging'),
    ).toBe(false)
  })

  it('matches section subroutes by prefix', () => {
    const messaging = { href: '/dashboard/messaging' }
    expect(isNavItemActive(messaging, '/dashboard/messaging')).toBe(true)
    expect(isNavItemActive(messaging, '/dashboard/messaging/bulk')).toBe(true)
    expect(isNavItemActive(messaging, '/dashboard/messaging/api-guide')).toBe(
      true,
    )
  })

  it('does not match sibling routes that share a name prefix', () => {
    expect(
      isNavItemActive({ href: '/dashboard/message' }, '/dashboard/messaging'),
    ).toBe(false)
  })

  it('keeps Account active across the section while linking to billing', () => {
    const account = navItems.find((item) => item.label === 'Account')
    // Direct link skips the /dashboard/account redirect stub.
    expect(account?.href).toBe('/dashboard/account/billing')
    expect(isNavItemActive(account!, '/dashboard/account/billing')).toBe(true)
    expect(isNavItemActive(account!, '/dashboard/account/profile')).toBe(true)
    expect(isNavItemActive(account!, '/dashboard/account/security')).toBe(true)
    expect(isNavItemActive(account!, '/dashboard/account')).toBe(true)
    expect(isNavItemActive(account!, '/dashboard/community')).toBe(false)
  })

  it('shows Organizations only to a tentative ADMIN session and never as a fifth mobile tab', () => {
    expect(visibleNavItems('REGULAR').map((item) => item.label)).not.toContain(
      'Organizations',
    )
    expect(visibleNavItems('ADMIN').map((item) => item.label)).toContain(
      'Organizations',
    )
    expect(
      visibleMobileNavItems('ADMIN').map((item) => item.label),
    ).not.toContain('Organizations')
    expect(visibleMobileNavItems('ADMIN')).toHaveLength(4)
  })

  it('shows the active profile only from a fresh server capability', () => {
    expect(
      visibleNavItems('REGULAR', activeContext).map((item) => item.href),
    ).toContain('/dashboard/admin/organizations/org-1')
    expect(
      visibleNavItems('ADMIN', {
        ...activeContext,
        capabilities: [],
      }).map((item) => item.label),
    ).not.toContain('Organization profile')
    expect(
      visibleNavItems('ADMIN', {
        state: 'NO_ACCESS',
        organization: null,
        membership: null,
        capabilities: [],
        roleLabel: null,
      }).map((item) => item.label),
    ).not.toContain('Organization profile')
  })
})
