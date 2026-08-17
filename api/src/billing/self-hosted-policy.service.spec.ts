import { HttpException } from '@nestjs/common'
import { Types } from 'mongoose'
import { SelfHostedPolicyService } from './self-hosted-policy.service'

const policyEnvironment = {
  TEXTBEE_BILLING_MODE: 'self_hosted',
  TEXTBEE_SMS_POLICY_TIMEZONE: 'America/Boise',
  TEXTBEE_SMS_ACTIVE_DEVICE_LIMIT: '1',
  TEXTBEE_SMS_RECIPIENT_LIMIT: '40',
  TEXTBEE_SMS_SEGMENTS_PER_MINUTE: '10',
  TEXTBEE_SMS_SEGMENTS_PER_DAY: '200',
  TEXTBEE_SMS_SEGMENTS_ROLLING_30_DAYS: '2000',
  TEXTBEE_SMS_COMPLIANCE_SEGMENTS_PER_DAY: '50',
}

describe('SelfHostedPolicyService', () => {
  const originalEnvironment = process.env
  const deviceId = new Types.ObjectId()
  let usage: {
    updateOne: jest.Mock
    findOneAndUpdate: jest.Mock
    findOne: jest.Mock
    find: jest.Mock
  }
  let devices: { find: jest.Mock }
  let service: SelfHostedPolicyService

  beforeEach(() => {
    process.env = { ...originalEnvironment, ...policyEnvironment }
    usage = {
      updateOne: jest.fn().mockResolvedValue({ acknowledged: true }),
      findOneAndUpdate: jest
        .fn()
        .mockResolvedValue({ _id: new Types.ObjectId() }),
      findOne: jest.fn().mockResolvedValue({ ordinaryEvents: [] }),
      find: jest.fn().mockResolvedValue([]),
    }
    devices = { find: jest.fn().mockResolvedValue([]) }
    service = new SelfHostedPolicyService(usage as any, devices as any)
  })

  afterAll(() => {
    process.env = originalEnvironment
  })

  it('atomically reserves multipart capacity for every eligible recipient', async () => {
    const reservation = await service.reserve({
      deviceId,
      kind: 'ORDINARY',
      messages: [{ message: 'a'.repeat(161), recipientCount: 3 }],
    })

    expect(reservation).toMatchObject({ kind: 'ORDINARY', segments: 6 })
    expect(usage.findOneAndUpdate).toHaveBeenCalledTimes(1)
    const [filter, update] = usage.findOneAndUpdate.mock.calls[0]
    expect(filter).toHaveProperty('$expr.$and')
    expect(update.$push.ordinaryEvents).toMatchObject({
      segments: 6,
      status: 'RESERVED',
    })
  })

  it('rejects the entire request before writing when the recipient cap is exceeded', async () => {
    await expect(
      service.reserve({
        deviceId,
        kind: 'ORDINARY',
        messages: [{ message: 'hello', recipientCount: 41 }],
      }),
    ).rejects.toBeInstanceOf(HttpException)

    expect(usage.updateOne).not.toHaveBeenCalled()
    expect(usage.findOneAndUpdate).not.toHaveBeenCalled()
  })

  it('uses a separate compliance event allowance', async () => {
    await service.reserve({
      deviceId,
      kind: 'COMPLIANCE',
      messages: [{ message: 'You have been unsubscribed.', recipientCount: 1 }],
    })

    const [, update] = usage.findOneAndUpdate.mock.calls[0]
    expect(update.$push.complianceEvents).toMatchObject({
      segments: 1,
      status: 'RESERVED',
    })
    expect(update.$push.ordinaryEvents).toBeUndefined()
  })

  it('reports a policy limit without consuming capacity when atomic acceptance fails', async () => {
    usage.findOneAndUpdate.mockResolvedValue(null)
    const now = new Date()
    usage.findOne.mockResolvedValue({
      ordinaryEvents: [
        {
          reservationId: 'existing',
          at: now,
          dayKey: new Intl.DateTimeFormat('en-CA', {
            timeZone: 'America/Boise',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
          }).format(now),
          segments: 10,
          status: 'CONSUMED',
        },
      ],
    })

    await expect(
      service.reserve({
        deviceId,
        kind: 'ORDINARY',
        messages: [{ message: 'hello', recipientCount: 1 }],
      }),
    ).rejects.toMatchObject({
      status: 429,
      response: expect.objectContaining({
        retryAt: expect.any(String),
        retryAfterSeconds: expect.any(Number),
      }),
    })

    expect(usage.updateOne).toHaveBeenCalledTimes(1)
    expect(usage.findOneAndUpdate).toHaveBeenCalledTimes(1)
  })

  it('releases only unconsumed reservations and preserves consumed attempts', async () => {
    await service.release(deviceId, 'reservation-1', 'ORDINARY')
    await service.consume(deviceId, 'reservation-2', 'ORDINARY')

    expect(usage.updateOne).toHaveBeenNthCalledWith(
      1,
      { deviceId },
      {
        $pull: {
          ordinaryEvents: {
            reservationId: 'reservation-1',
            status: 'RESERVED',
          },
        },
      },
    )
    expect(usage.updateOne).toHaveBeenNthCalledWith(
      2,
      { deviceId },
      { $set: { 'ordinaryEvents.$[event].status': 'CONSUMED' } },
      { arrayFilters: [{ 'event.reservationId': 'reservation-2' }] },
    )
  })

  it('previews every active ordinary capacity window without reserving', async () => {
    const now = new Date()
    usage.findOne.mockResolvedValue({
      ordinaryEvents: [
        {
          at: now,
          dayKey: new Intl.DateTimeFormat('en-CA', {
            timeZone: 'America/Boise',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
          }).format(now),
          segments: 7,
          status: 'CONSUMED',
        },
      ],
    })

    await expect(service.previewAvailability(deviceId)).resolves.toEqual({
      minuteSegments: 3,
      dailySegments: 193,
      rolling30DaySegments: 1993,
    })
    expect(usage.updateOne).not.toHaveBeenCalled()
    expect(usage.findOneAndUpdate).not.toHaveBeenCalled()
  })
})
