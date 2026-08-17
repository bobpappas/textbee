import {
  buildMessagingEligibilityDetails,
  ELIGIBILITY_CHANGED_MESSAGE,
} from './messaging-eligibility'

describe('messaging eligibility responses', () => {
  it.each([
    ['NO_ACTIVE_GROUP_CONSENT', 'missing-consent', 'no active group consent'],
    ['ORGANIZATION_SUPPRESSION', 'opted-out', 'Operators cannot override'],
    ['INVALID_NUMBER', 'invalid-number', 'valid US mobile number'],
  ] as const)(
    'explains %s without exposing its internal name',
    (reason, code, copy) => {
      const details = buildMessagingEligibilityDetails([
        { position: 1, recipient: '+12085550101', reason },
      ])

      expect(details.message).toContain(copy)
      expect(details.excludedRecipients[0]).toMatchObject({
        position: 1,
        recipient: 'Recipient ending in 0101',
        code,
      })
      expect(JSON.stringify(details)).not.toContain('+12085550101')
      expect(JSON.stringify(details)).not.toContain(reason)
    },
  )

  it('summarizes mixed exclusions by public reason and stable position', () => {
    const details = buildMessagingEligibilityDetails([
      {
        position: 2,
        recipient: '+12085550101',
        reason: 'NO_ACTIVE_GROUP_CONSENT',
      },
      {
        position: 5,
        recipient: '+12085550102',
        reason: 'ORGANIZATION_SUPPRESSION',
      },
      {
        position: 6,
        recipient: '+12085550103',
        reason: 'NO_ACTIVE_GROUP_CONSENT',
      },
    ])

    expect(details.exclusionSummary).toEqual({
      total: 3,
      reasons: [
        { code: 'missing-consent', label: 'No active group consent', count: 2 },
        { code: 'opted-out', label: 'Recipient opted out', count: 1 },
      ],
    })
    expect(details.excludedRecipients.map((item) => item.position)).toEqual([
      2, 5, 6,
    ])
  })

  it('provides retry-safe dispatch-change copy', () => {
    expect(ELIGIBILITY_CHANGED_MESSAGE).toContain('no message was sent')
    expect(ELIGIBILITY_CHANGED_MESSAGE).toContain('before retrying')
  })
})
