import type { ApiKeyStatusFilter } from './types'

// Single source of truth for react-query cache keys. Values intentionally match
// the ad-hoc string keys used across the app before this refactor (e.g.
// ['devices'], ['currentSubscription'], ['apiKeys', 'active']) so migrated and
// not-yet-migrated components still share the same cache entries.
export const queryKeys = {
  currentUser: ['currentUser'] as const,
  subscription: ['currentSubscription'] as const,
  stats: ['stats'] as const,
  devices: ['devices'] as const,
  webhooks: ['webhooks'] as const,
  billingPlans: ['billingPlans'] as const,
  apiKeys: (status: ApiKeyStatusFilter = 'active') =>
    ['apiKeys', status] as const,
  // Prefix covering every apiKeys list regardless of status filter. Use this
  // to invalidate: a new or revoked key changes the active, revoked and all
  // lists at once, and invalidating only apiKeys('active') leaves the other
  // two serving stale data.
  apiKeysAll: ['apiKeys'] as const,
  deviceMessages: (deviceId: string, filters?: Record<string, unknown>) =>
    filters
      ? (['messages', deviceId, filters] as const)
      : (['messages', deviceId] as const),
  organizations: ['organizations'] as const,
  organizationContext: ['organizationContext'] as const,
  organizationProfile: (organizationId: string) =>
    ['organizations', organizationId, 'profile'] as const,
  groupsAll: ['groups'] as const,
  groups: (organizationId: string, includeArchived = false) =>
    ['groups', organizationId, 'list', includeArchived] as const,
  group: (organizationId: string, groupId: string) =>
    ['groups', organizationId, groupId] as const,
  roster: (organizationId: string, groupId: string, search = '') =>
    ['groups', organizationId, groupId, 'roster', search] as const,
  contactDetails: (organizationId: string, groupId: string, contactId: string) =>
    ['groups', organizationId, groupId, 'contacts', contactId] as const,
  receivingNumbers: (organizationId: string) =>
    ['groups', organizationId, 'receiving-numbers'] as const,
  organizationOperators: (organizationId: string) =>
    ['groups', organizationId, 'operators'] as const,
}
