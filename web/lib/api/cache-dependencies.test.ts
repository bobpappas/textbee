import { describe, expect, it } from 'vitest'
import { cacheDependencies } from './cache-dependencies'
import { queryKeys } from './query-keys'

describe('cache dependency matrix', () => {
  const organizationId = 'organization-1'

  it('refreshes history, statistics, and usage after accepted sends', () => {
    expect(cacheDependencies.acceptedSend(organizationId, ['device-1'])).toEqual([
      queryKeys.deviceMessages(organizationId, 'device-1'),
      queryKeys.stats(organizationId),
      queryKeys.subscription(organizationId),
    ])
    expect(cacheDependencies.acceptedSend(organizationId)).toEqual([
      queryKeys.messageHistory(organizationId),
      queryKeys.stats(organizationId),
      queryKeys.subscription(organizationId),
    ])
  })

  it('refreshes every display surface after organization and group changes', () => {
    expect(cacheDependencies.organizationName(organizationId)).toEqual([
      queryKeys.organizationProfile(organizationId),
      queryKeys.organizations,
      queryKeys.organizationContext,
    ])
    expect(cacheDependencies.groupSummary(organizationId, 'group-1')).toEqual([
      queryKeys.groupsAll(organizationId),
      queryKeys.group(organizationId, 'group-1'),
      queryKeys.organizationOperators(organizationId),
    ])
  })
})
