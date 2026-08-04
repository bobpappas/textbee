import {
  LayoutDashboard,
  MessageSquareText,
  Webhook,
  Users,
  UserCircle,
  Building2,
  UsersRound,
  type LucideIcon,
} from 'lucide-react'
import type { OrganizationContext } from '@/lib/api'
import { GROUPS_READ, ORGANIZATION_PROFILE_MANAGE } from '@/lib/api'

export type NavItem = {
  href: string
  label: string
  icon: LucideIcon
  // Active-state prefix when it differs from href (Account links straight to
  // billing so the click skips the /dashboard/account redirect stub, but must
  // stay highlighted on every account tab).
  match?: string
  // The mobile tab bar caps at 4 items (375px width); items marked
  // mobileHidden appear only in the desktop sidebar and the command palette.
  mobileHidden?: boolean
  requiredRole?: 'ADMIN'
  requiredCapability?: typeof ORGANIZATION_PROFILE_MANAGE | typeof GROUPS_READ
}

// Primary dashboard navigation, shared by the desktop sidebar, the mobile tab
// bar, and the command palette so they never drift out of sync.
export const navItems: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/dashboard/messaging', label: 'Messaging', icon: MessageSquareText },
  {
    href: '/dashboard/webhooks',
    label: 'Webhooks',
    icon: Webhook,
    mobileHidden: true,
  },
  { href: '/dashboard/community', label: 'Community', icon: Users },
  {
    href: '/dashboard/account/billing',
    label: 'Account',
    icon: UserCircle,
    match: '/dashboard/account',
  },
  {
    href: '/dashboard/admin/organizations',
    label: 'Organizations',
    icon: Building2,
    mobileHidden: true,
    requiredRole: 'ADMIN',
  },
]

export function visibleNavItems(role?: string, context?: OrganizationContext) {
  const groupNavigation: NavItem[] =
    context?.state === 'ACTIVE' && context.capabilities.includes(GROUPS_READ)
      ? [
          {
            href: '/dashboard/groups',
            label: 'My Groups',
            icon: UsersRound,
            requiredCapability: GROUPS_READ,
          },
        ]
      : []
  const organizationProfile: NavItem[] =
    context?.state === 'ACTIVE' &&
    context.capabilities.includes(ORGANIZATION_PROFILE_MANAGE)
      ? [
          {
            href: `/dashboard/admin/organizations/${context.organization.id}`,
            label: 'Organization profile',
            icon: Building2,
            mobileHidden: true,
            requiredCapability: ORGANIZATION_PROFILE_MANAGE,
          },
        ]
      : []
  return [...navItems, ...groupNavigation, ...organizationProfile].filter(
    (item) =>
      (!item.requiredRole || item.requiredRole === role) &&
      (!item.requiredCapability ||
        (context?.state === 'ACTIVE' &&
          context.capabilities.includes(item.requiredCapability))),
  )
}

export function visibleMobileNavItems(
  role?: string,
  context?: OrganizationContext,
) {
  const items = visibleNavItems(role, context).filter(
    (item) => !item.mobileHidden,
  )
  return items.some((item) => item.label === 'My Groups')
    ? items.filter((item) => item.label !== 'Community').slice(0, 4)
    : items.slice(0, 4)
}

// /dashboard must match exactly; deeper routes match by prefix so nested pages
// keep their parent highlighted.
export function isNavItemActive(
  item: Pick<NavItem, 'href' | 'match'>,
  pathname: string,
): boolean {
  const prefix = item.match ?? item.href
  return prefix === '/dashboard'
    ? pathname === prefix
    : pathname === prefix || pathname.startsWith(`${prefix}/`)
}
