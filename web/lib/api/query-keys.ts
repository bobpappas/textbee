import type { ApiKeyStatusFilter } from './types'

// Single source of truth for React Query cache keys. Every organization-owned
// family uses the ['organization', immutableId, ...] prefix so one transition
// can cancel and remove all current and future organization data safely.
export const queryKeys = {
  currentUser: ['currentUser'] as const,
  organization: (organizationId: string) =>
    ['organization', organizationId] as const,
  subscription: (organizationId: string) =>
    ['organization', organizationId, 'subscription'] as const,
  stats: (organizationId: string) =>
    ['organization', organizationId, 'stats'] as const,
  devices: (organizationId: string) =>
    ['organization', organizationId, 'devices'] as const,
  webhooks: (organizationId: string) =>
    ['organization', organizationId, 'webhooks'] as const,
  billingPlans: ['billingPlans'] as const,
  apiKeys: (
    organizationId: string,
    status: ApiKeyStatusFilter = 'active',
  ) => ['organization', organizationId, 'apiKeys', status] as const,
  // Prefix covering every apiKeys list regardless of status filter. Use this
  // to invalidate: a new or revoked key changes the active, revoked and all
  // lists at once, and invalidating only apiKeys('active') leaves the other
  // two serving stale data.
  apiKeysAll: (organizationId: string) =>
    ['organization', organizationId, 'apiKeys'] as const,
  deviceMessages: (
    organizationId: string,
    deviceId: string,
    filters?: Record<string, unknown>,
  ) =>
    filters
      ? (['organization', organizationId, 'messages', deviceId, filters] as const)
      : (['organization', organizationId, 'messages', deviceId] as const),
  messageHistory: (organizationId: string) =>
    ['organization', organizationId, 'messages'] as const,
  organizations: ['organizations'] as const,
  organizationContext: ['organizationContext'] as const,
  organizationProfile: (organizationId: string) =>
    ['organization', organizationId, 'profile'] as const,
  groupsAll: (organizationId: string) =>
    ['organization', organizationId, 'groups'] as const,
  groups: (organizationId: string, includeArchived = false) =>
    ['organization', organizationId, 'groups', 'list', includeArchived] as const,
  group: (organizationId: string, groupId: string) =>
    ['organization', organizationId, 'groups', groupId] as const,
  roster: (organizationId: string, groupId: string, search = '') =>
    ['organization', organizationId, 'groups', groupId, 'roster', search] as const,
  contactDetails: (organizationId: string, groupId: string, contactId: string) =>
    ['organization', organizationId, 'groups', groupId, 'contacts', contactId] as const,
  receivingNumbers: (organizationId: string) =>
    ['organization', organizationId, 'groups', 'receiving-numbers'] as const,
  organizationOperators: (organizationId: string) =>
    ['organization', organizationId, 'operators'] as const,
  messagingEligibility: (
    organizationId: string,
    deviceId: string,
    recipients: string[],
  ) =>
    [
      'organization',
      organizationId,
      'messaging-eligibility',
      deviceId,
      recipients,
    ] as const,
  webhookNotifications: (
    organizationId: string,
    filters: {
      eventType: string
      status: string
      deviceId: string
      webhookSubscriptionId: string
      start: string
      end: string
      page: number
      limit: number
    },
  ) =>
    [
      'organization',
      organizationId,
      'webhookNotifications',
      filters,
    ] as const,
}

export const isOrganizationQueryKey = (queryKey: readonly unknown[]) =>
  queryKey[0] === 'organization' && typeof queryKey[1] === 'string'
