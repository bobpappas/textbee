import { randomUUID } from 'crypto'
import { Message } from 'firebase-admin/messaging'
import { Model } from 'mongoose'

export const DISPATCH_COMMAND_TTL_MS = 2 * 60 * 1000

type DispatchAttemptModel = Pick<Model<any>, 'updateOne'>

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

export async function issueDispatchAttempts(
  messages: Message[],
  smsModel: DispatchAttemptModel,
  now = new Date(),
): Promise<Message[]> {
  const attempts = messages.map((message) => {
    const issuedMessage = withFreshDispatchAttempt(message, now)
    const payload = JSON.parse(issuedMessage.data?.smsData || '{}')
    const expiresAt = new Date(Number(payload.expiresAt))
    if (
      !payload.smsId ||
      !payload.attemptId ||
      !Number.isFinite(expiresAt.getTime())
    )
      throw new Error('Invalid dispatch attempt payload')
    return {
      message: issuedMessage,
      smsId: payload.smsId,
      attemptId: payload.attemptId,
      expiresAt,
    }
  })

  await Promise.all(
    attempts.map((attempt) =>
      smsModel.updateOne(
        { _id: attempt.smsId, status: 'pending' },
        {
          $set: {
            dispatchAttemptId: attempt.attemptId,
            dispatchIssuedAt: now,
            dispatchExpiresAt: attempt.expiresAt,
          },
        },
      ),
    ),
  )
  return attempts.map((attempt) => attempt.message)
}
