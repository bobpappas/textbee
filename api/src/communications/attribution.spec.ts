import { AttributionMethod, AttributionState } from './communication.enums'
import { attributeInbound, recognizedReaction } from './attribution'

const receivedAt = new Date('2026-08-23T12:00:00.000Z')
const hoursAgo = (hours: number) =>
  new Date(receivedAt.getTime() - hours * 60 * 60 * 1000)
const delivery = (
  overrides: Partial<{
    groupId: string
    deliveryId: string
    transmittedBody: string
    sentAt: Date
  }> = {},
) => ({
  groupId: 'group-a',
  deliveryId: 'delivery-a',
  transmittedBody: 'GROUPA: Meeting at 7',
  sentAt: hoursAgo(1),
  ...overrides,
})

describe('B017 inbound attribution', () => {
  it('confirms one exact transmitted quote within 30 days', () => {
    const result = attributeInbound({
      body: 'Replying to “GROUPA: Meeting at 7” yes',
      receivedAt,
      candidateGroupIds: ['group-a'],
      deliveries: [delivery({ sentAt: hoursAgo(29 * 24) })],
    })
    expect(result).toEqual(
      expect.objectContaining({
        state: AttributionState.CONFIRMED,
        method: AttributionMethod.EXACT_QUOTE,
        groupId: 'group-a',
        matchedDeliveryId: 'delivery-a',
      }),
    )
  })

  it('never confirms exact text outside the 30-day evidence window', () => {
    const result = attributeInbound({
      body: 'GROUPA: Meeting at 7',
      receivedAt,
      candidateGroupIds: ['group-a'],
      deliveries: [delivery({ sentAt: hoursAgo(31 * 24) })],
    })
    expect(result.state).toBe(AttributionState.UNASSIGNED)
  })

  it('uses the newest qualifying group only as likely evidence within 72 hours', () => {
    const result = attributeInbound({
      body: 'Yes',
      receivedAt,
      candidateGroupIds: ['group-a', 'group-b'],
      deliveries: [
        delivery({ groupId: 'group-a', sentAt: hoursAgo(71) }),
        delivery({
          groupId: 'group-b',
          deliveryId: 'delivery-b',
          transmittedBody: 'GROUPB: Update',
          sentAt: hoursAgo(3),
        }),
      ],
    })
    expect(result).toEqual(
      expect.objectContaining({
        state: AttributionState.LIKELY,
        method: AttributionMethod.RECENT_SEND,
        groupId: 'group-b',
      }),
    )
  })

  it('keeps duplicate exact bodies and tied recent sends ambiguous', () => {
    const exact = attributeInbound({
      body: 'GROUPA: Same body',
      receivedAt,
      candidateGroupIds: ['group-a', 'group-b'],
      deliveries: [
        delivery({ transmittedBody: 'GROUPA: Same body' }),
        delivery({
          groupId: 'group-b',
          deliveryId: 'delivery-b',
          transmittedBody: 'GROUPA: Same body',
        }),
      ],
    })
    expect(exact.state).toBe(AttributionState.AMBIGUOUS)

    const tied = attributeInbound({
      body: 'No quote',
      receivedAt,
      candidateGroupIds: ['group-a', 'group-b'],
      deliveries: [
        delivery(),
        delivery({
          groupId: 'group-b',
          deliveryId: 'delivery-b',
          transmittedBody: 'GROUPB: Other',
        }),
      ],
    })
    expect(tied.state).toBe(AttributionState.AMBIGUOUS)
  })

  it('ignores deliveries from a different organization candidate set', () => {
    const result = attributeInbound({
      body: 'FOREIGN: Exact',
      receivedAt,
      candidateGroupIds: ['local-group'],
      deliveries: [
        delivery({
          groupId: 'foreign-group',
          transmittedBody: 'FOREIGN: Exact',
        }),
      ],
    })
    expect(result.state).toBe(AttributionState.UNASSIGNED)
    expect(result.groupId).toBeUndefined()
  })

  it('recognizes supported reaction fixtures without altering unfamiliar payloads', () => {
    expect(recognizedReaction('Loved “GROUPA: Meeting at 7”')).toEqual({
      name: 'Loved',
      quotedBody: 'GROUPA: Meeting at 7',
    })
    expect(recognizedReaction('custom reaction payload')).toBeUndefined()
  })

  it('prefers a unique stable reply identifier over heuristic history', () => {
    const result = attributeInbound({
      body: 'No quote',
      receivedAt,
      candidateGroupIds: ['group-a', 'group-b'],
      deliveries: [
        delivery(),
        delivery({
          groupId: 'group-b',
          deliveryId: 'delivery-b',
          transmittedBody: 'GROUPB: Other',
        }),
      ],
      transportReplyDeliveryId: 'delivery-b',
    })
    expect(result).toEqual(
      expect.objectContaining({
        state: AttributionState.CONFIRMED,
        method: AttributionMethod.TRANSPORT_REPLY,
        groupId: 'group-b',
      }),
    )
  })
})
