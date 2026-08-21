import { describe, expect, it } from 'vitest'
import { isOrganizationQueryKey, queryKeys } from './query-keys'

describe('organization-aware query keys', () => {
  it('uses one immutable organization prefix for every owned family', () => {
    const organizationId = 'organization-immutable-id'
    const keys = [
      queryKeys.subscription(organizationId),
      queryKeys.stats(organizationId),
      queryKeys.devices(organizationId),
      queryKeys.webhooks(organizationId),
      queryKeys.apiKeys(organizationId),
      queryKeys.deviceMessages(organizationId, 'device-1'),
      queryKeys.organizationProfile(organizationId),
      queryKeys.groups(organizationId),
      queryKeys.organizationOperators(organizationId),
      queryKeys.messagingEligibility(organizationId, 'device-1', ['+12085550100']),
    ]

    expect(keys.every(isOrganizationQueryKey)).toBe(true)
    expect(keys.every((key) => key[1] === organizationId)).toBe(true)
  })

  it('captures the complete webhook notification request identity', () => {
    const filters = {
      eventType: 'MESSAGE_RECEIVED',
      status: 'SUCCESS',
      deviceId: 'device-1',
      webhookSubscriptionId: 'webhook-1',
      start: '2026-08-01',
      end: '2026-08-21',
      page: 2,
      limit: 25,
    }

    expect(queryKeys.webhookNotifications('organization-1', filters)).toEqual([
      'organization',
      'organization-1',
      'webhookNotifications',
      filters,
    ])
  })
})
