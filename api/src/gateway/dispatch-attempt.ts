import { randomUUID } from 'crypto'
import { Message } from 'firebase-admin/messaging'

export const DISPATCH_COMMAND_TTL_MS = 2 * 60 * 1000

export function withFreshDispatchAttempt(
  message: Message,
  now = new Date(),
  attemptId: string = randomUUID(),
): Message {
  const payload = JSON.parse(message.data?.smsData || '{}')
  payload.attemptId = attemptId
  payload.expiresAt = String(now.getTime() + DISPATCH_COMMAND_TTL_MS)
  return {
    ...message,
    data: { ...message.data, smsData: JSON.stringify(payload) },
    android: {
      ...message.android,
      ttl: DISPATCH_COMMAND_TTL_MS,
      priority: 'high',
    },
  }
}
