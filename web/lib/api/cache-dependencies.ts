import type { QueryClient, QueryKey } from '@tanstack/react-query'
import { queryKeys } from './query-keys'

export const cacheDependencies = {
  acceptedSend(organizationId: string, deviceIds: string[] = []): QueryKey[] {
    const historyKeys = deviceIds.length
      ? deviceIds.map((deviceId) =>
          queryKeys.deviceMessages(organizationId, deviceId),
        )
      : [queryKeys.messageHistory(organizationId)]
    return [
      ...historyKeys,
      queryKeys.stats(organizationId),
      queryKeys.subscription(organizationId),
    ]
  },
  groupSummary(organizationId: string, groupId?: string): QueryKey[] {
    return [
      queryKeys.groupsAll(organizationId),
      ...(groupId ? [queryKeys.group(organizationId, groupId)] : []),
      queryKeys.organizationOperators(organizationId),
    ]
  },
  organizationName(organizationId: string): QueryKey[] {
    return [
      queryKeys.organizationProfile(organizationId),
      queryKeys.organizations,
      queryKeys.organizationContext,
    ]
  },
}

export function invalidateCacheDependencies(
  queryClient: QueryClient,
  dependencies: QueryKey[],
  refetchType: 'active' | 'inactive' | 'all' | 'none' = 'active',
) {
  return Promise.all(
    dependencies.map((queryKey) =>
      queryClient.invalidateQueries({ queryKey, refetchType }),
    ),
  )
}
