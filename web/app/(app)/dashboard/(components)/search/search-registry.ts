import {
  Activity,
  Code2,
  CreditCard,
  Download,
  Heart,
  History,
  LayoutDashboard,
  LifeBuoy,
  ListChecks,
  Send,
  Shield,
  Upload,
  UserCircle,
  Users,
  Webhook,
  Building2,
  UsersRound,
  type LucideIcon,
} from 'lucide-react'
import { Routes } from '@/config/routes'
import type { OrganizationContext } from '@/lib/api'
import { GROUPS_MANAGE, GROUPS_READ, ORGANIZATION_PROFILE_MANAGE, type OrganizationCapability } from '@/lib/api'

export type SearchGroup =
  | 'Overview'
  | 'Messaging'
  | 'Webhooks'
  | 'Account'
  | 'Resources'
  | 'Administration'

export type SearchEntry = {
  href: string
  label: string
  group: SearchGroup
  icon: LucideIcon
  // Muted secondary line, so a result explains itself.
  description?: string
  // Matched by cmdk in addition to the label. These are the words people
  // actually type ("csv", "invoice", "password"), not the words we chose for
  // the nav, so search works without the user knowing our information
  // architecture.
  keywords: string[]
  external?: boolean
  requiredRole?: 'ADMIN'
  requiredCapability?: OrganizationCapability
}

export const searchEntries: SearchEntry[] = [
  {
    href: '/dashboard/groups',
    label: 'My Groups',
    group: 'Administration',
    icon: UsersRound,
    description: 'Open assigned groups and maintain rosters',
    keywords: ['groups', 'roster', 'contacts', 'members', 'join code'],
    requiredCapability: GROUPS_READ,
  },
  {
    href: '/dashboard/groups/new',
    label: 'Create group',
    group: 'Administration',
    icon: UsersRound,
    description: 'Create a group and select owners',
    keywords: ['create group', 'new group', 'owners', 'join command'],
    requiredCapability: GROUPS_MANAGE,
  },
  {
    href: '/dashboard/admin/organizations',
    label: 'Organizations',
    group: 'Administration',
    icon: Building2,
    description: 'Create and manage organization profiles',
    keywords: ['organizations', 'administration', 'registry', 'church'],
    requiredRole: 'ADMIN',
  },
  {
    href: '/dashboard',
    label: 'Dashboard',
    group: 'Overview',
    icon: LayoutDashboard,
    description: 'Usage, activity and devices',
    keywords: [
      'home',
      'overview',
      'stats',
      'usage',
      'quota',
      'limit',
      'activity',
      'devices',
      'summary',
      'start',
    ],
  },
  {
    href: '/dashboard/messaging',
    label: 'Send SMS',
    group: 'Messaging',
    icon: Send,
    description: 'Compose a message to one or more recipients',
    keywords: [
      'send',
      'sms',
      'message',
      'text',
      'compose',
      'new message',
      'single',
      'write',
      'reply',
    ],
  },
  {
    href: '/dashboard/messaging/bulk',
    label: 'Bulk send',
    group: 'Messaging',
    icon: Upload,
    description: 'Upload a CSV and send from a template',
    keywords: [
      'bulk',
      'csv',
      'import',
      'upload',
      'campaign',
      'mass',
      'batch',
      'many',
      'broadcast',
      'spreadsheet',
      'excel',
      'template',
      'blast',
    ],
  },
  {
    href: '/dashboard/messaging/history',
    label: 'Message history',
    group: 'Messaging',
    icon: History,
    description: 'Sent and received messages',
    keywords: [
      'history',
      'sent',
      'received',
      'inbox',
      'outbox',
      'log',
      'logs',
      'delivery',
      'delivered',
      'failed',
      'status',
      'search messages',
      'conversation',
    ],
  },
  {
    href: '/dashboard/messaging/api-guide',
    label: 'API guide',
    group: 'Messaging',
    icon: Code2,
    description: 'Integrate textbee into your app',
    keywords: [
      'api',
      'docs',
      'documentation',
      'curl',
      'code',
      'integration',
      'rest',
      'endpoint',
      'sdk',
      'example',
      'developer',
      'reference',
    ],
  },
  {
    href: '/dashboard/webhooks',
    label: 'Webhooks',
    group: 'Webhooks',
    icon: Webhook,
    description: 'Get notified at your endpoints on SMS events',
    keywords: [
      'webhook',
      'subscription',
      'endpoint',
      'callback',
      'events',
      'notify',
      'notification',
      'integrate',
      'url',
    ],
  },
  {
    href: '/dashboard/webhooks/deliveries',
    label: 'Webhook deliveries',
    group: 'Webhooks',
    icon: ListChecks,
    description: 'Delivery attempts and failures',
    keywords: [
      'deliveries',
      'delivery',
      'logs',
      'failed',
      'failures',
      'retry',
      'history',
      'payload',
      'attempts',
      'debug',
    ],
  },
  {
    href: '/dashboard/community',
    label: 'Community',
    group: 'Overview',
    icon: Users,
    description: 'Discord, GitHub and socials',
    keywords: [
      'community',
      'discord',
      'github',
      'help',
      'chat',
      'social',
      'forum',
      'twitter',
    ],
  },
  {
    href: '/dashboard/account/billing',
    label: 'Billing & plan',
    group: 'Account',
    icon: CreditCard,
    description: 'Subscription, usage limits and upgrades',
    keywords: [
      'billing',
      'plan',
      'subscription',
      'upgrade',
      'downgrade',
      'pro',
      'free',
      'invoice',
      'receipt',
      'payment',
      'card',
      'price',
      'pricing',
      'quota',
      'limit',
      'cancel',
      'renew',
      'refund',
    ],
  },
  {
    href: '/dashboard/account/profile',
    label: 'Profile',
    group: 'Account',
    icon: UserCircle,
    description: 'Your name, email and avatar',
    keywords: [
      'profile',
      'name',
      'email',
      'avatar',
      'photo',
      'personal',
      'edit account',
      'details',
    ],
  },
  {
    href: '/dashboard/account/security',
    label: 'Security',
    group: 'Account',
    icon: Shield,
    description: 'Password and account deletion',
    keywords: [
      'password',
      'change password',
      'reset password',
      'security',
      'delete account',
      'close account',
      'danger',
      'danger zone',
      '2fa',
      'login',
    ],
  },
  {
    href: '/dashboard/account/support',
    label: 'Support',
    group: 'Account',
    icon: LifeBuoy,
    description: 'Get help from the team',
    keywords: [
      'support',
      'contact',
      'help',
      'ticket',
      'issue',
      'bug',
      'problem',
      'question',
      'email us',
      'feedback',
    ],
  },

  {
    href: Routes.downloadAndroidApp,
    label: 'Android app setup',
    group: 'Resources',
    icon: Download,
    keywords: [
      'apk',
      'install',
      'download',
      'phone',
      'android',
      'app',
      'mobile',
      'device',
      'getting started',
      'setup',
      'tutorial',
      'onboarding',
      'guide',
      'how to',
      'first steps',
    ],
  },
  // External destinations. These open in a new tab rather than routing.
  {
    href: Routes.statusPage,
    label: 'System status',
    group: 'Resources',
    icon: Activity,
    external: true,
    keywords: [
      'status',
      'uptime',
      'incident',
      'down',
      'outage',
      'health',
      'downtime',
    ],
  },
  {
    href: Routes.contribute,
    label: 'Contribute',
    group: 'Resources',
    icon: Heart,
    external: true,
    keywords: [
      'contribute',
      'sponsor',
      'donate',
      'github',
      'open source',
      'support the project',
      'star',
    ],
  },
]

export function visibleSearchEntries(
  role?: string,
  context?: OrganizationContext,
) {
  const organizationProfile: SearchEntry[] =
    context?.state === 'ACTIVE' &&
    context.capabilities.includes(ORGANIZATION_PROFILE_MANAGE)
      ? [
          {
            href: `/dashboard/admin/organizations/${context.organization.id}`,
            label: 'Organization profile',
            group: 'Administration',
            icon: Building2,
            description: context.organization.displayName,
            keywords: ['organization', 'profile', 'church', 'administration'],
          },
        ]
      : []
  return [...searchEntries, ...organizationProfile].filter(
    (entry) =>
      (!entry.requiredRole || entry.requiredRole === role) &&
      (!entry.requiredCapability ||
        (context?.state === 'ACTIVE' &&
          context.capabilities.includes(entry.requiredCapability))),
  )
}

// Rendering order for the palette's group headings.
export const searchGroupOrder: SearchGroup[] = [
  'Administration',
  'Overview',
  'Messaging',
  'Webhooks',
  'Account',
  'Resources',
]
