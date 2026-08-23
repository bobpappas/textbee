import { AttributionMethod, AttributionState } from './communication.enums'

export const EXACT_QUOTE_WINDOW_MS = 30 * 24 * 60 * 60 * 1000
export const RECENT_SEND_WINDOW_MS = 72 * 60 * 60 * 1000
export const ATTRIBUTION_ALGORITHM_VERSION = 'b017-v1'

export type AttributionDelivery = {
  groupId: string
  deliveryId: string
  transmittedBody: string
  sentAt: Date
}

export type AttributionResult = {
  state: AttributionState
  method: AttributionMethod
  groupId?: string
  candidateGroupIds: string[]
  matchedDeliveryId?: string
  reason: string
  reaction?: { name: string; quotedBody: string }
}

const REACTION =
  /^(Loved|Liked|Disliked|Laughed at|Emphasized|Questioned)\s+["“](.+)["”]$/is

export function recognizedReaction(payload: string) {
  const match = payload.trim().match(REACTION)
  return match
    ? { name: match[1].replace(/\s+/g, ' '), quotedBody: match[2] }
    : undefined
}

export function attributeInbound(input: {
  body: string
  receivedAt: Date
  candidateGroupIds: string[]
  deliveries: AttributionDelivery[]
  transportReplyDeliveryId?: string
}): AttributionResult {
  const candidates = [...new Set(input.candidateGroupIds)].sort()
  const eligible = input.deliveries.filter((delivery) =>
    candidates.includes(delivery.groupId),
  )

  if (input.transportReplyDeliveryId) {
    const matches = eligible.filter(
      (delivery) => delivery.deliveryId === input.transportReplyDeliveryId,
    )
    if (matches.length === 1)
      return confirmed(
        matches[0],
        candidates,
        AttributionMethod.TRANSPORT_REPLY,
      )
    if (matches.length > 1) return ambiguous(candidates)
  }

  const reaction = recognizedReaction(input.body)
  const quote = reaction?.quotedBody
  const exactMatches = eligible.filter((delivery) => {
    const age = input.receivedAt.getTime() - delivery.sentAt.getTime()
    if (age < 0 || age > EXACT_QUOTE_WINDOW_MS) return false
    return quote
      ? quote === delivery.transmittedBody
      : input.body.includes(delivery.transmittedBody)
  })
  const exactGroups = [...new Set(exactMatches.map((item) => item.groupId))]
  if (exactMatches.length === 1 && exactGroups.length === 1)
    return {
      ...confirmed(exactMatches[0], candidates, AttributionMethod.EXACT_QUOTE),
      reaction,
    }
  if (exactMatches.length > 1) return { ...ambiguous(candidates), reaction }

  const recent = eligible
    .filter((delivery) => {
      const age = input.receivedAt.getTime() - delivery.sentAt.getTime()
      return age >= 0 && age <= RECENT_SEND_WINDOW_MS
    })
    .sort((left, right) => right.sentAt.getTime() - left.sentAt.getTime())
  if (recent.length) {
    const newestAt = recent[0].sentAt.getTime()
    const newestGroups = [
      ...new Set(
        recent
          .filter((delivery) => delivery.sentAt.getTime() === newestAt)
          .map((delivery) => delivery.groupId),
      ),
    ]
    if (newestGroups.length === 1)
      return {
        state: AttributionState.LIKELY,
        method: AttributionMethod.RECENT_SEND,
        groupId: newestGroups[0],
        candidateGroupIds: candidates,
        matchedDeliveryId: recent[0].deliveryId,
        reason: 'Most recent successful group message within 72 hours',
        reaction,
      }
    return { ...ambiguous(candidates), reaction }
  }

  return {
    state: AttributionState.UNASSIGNED,
    method: AttributionMethod.NO_EVIDENCE,
    candidateGroupIds: candidates,
    reason: candidates.length
      ? 'No qualifying group message evidence'
      : 'No active group membership matched at receipt time',
    reaction,
  }
}

function confirmed(
  delivery: AttributionDelivery,
  candidateGroupIds: string[],
  method: AttributionMethod,
): AttributionResult {
  return {
    state: AttributionState.CONFIRMED,
    method,
    groupId: delivery.groupId,
    candidateGroupIds,
    matchedDeliveryId: delivery.deliveryId,
    reason:
      method === AttributionMethod.TRANSPORT_REPLY
        ? 'Carrier reply identifier matched one sent message'
        : 'Matched the exact sent message within 30 days',
  }
}

function ambiguous(candidateGroupIds: string[]): AttributionResult {
  return {
    state: AttributionState.AMBIGUOUS,
    method: AttributionMethod.CONFLICTING_EVIDENCE,
    candidateGroupIds,
    reason: 'More than one group has plausible message evidence',
  }
}
