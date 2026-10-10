import { GatewayService } from '../gateway.service'
import { GroupMessageSendSchema } from '../../groups/schemas/group-message-send.schema'
import { GroupMessageDeliverySchema } from '../../groups/schemas/group-message-delivery.schema'
import { GroupAuditEventSchema } from '../../groups/schemas/group-audit-event.schema'
import mongoose, { Connection, Types } from 'mongoose'
import { PacedSmsService } from './paced-sms.service'
import {
  PACED_ITEM,
  PACED_SEND,
  PacedItemSchema,
  PacedSendSchema,
} from './paced-sms.schema'
import { SmsSafetyUsageSchema } from '../../billing/sms-safety-usage.schema'
import { SMSSchema } from '../schemas/sms.schema'
import { SMSBatchSchema } from '../schemas/sms-batch.schema'
import { DeviceSchema } from '../schemas/device.schema'
import { UserSchema } from '../../users/schemas/user.schema'
const sendEach = jest.fn()
jest.mock('firebase-admin', () => ({ messaging: () => ({ sendEach }) }))
const uri = process.env.B060_TEST_MONGO
const suite = uri ? describe : describe.skip
suite(
  'B060 durable pacing with real Mongo transactions and simulated phone transport',
  () => {
    let db: Connection, service: PacedSmsService, device: any, now: number
    const policy = {
      segmentsPerMinute: 10,
      segmentsPerDay: 200,
      segmentsRolling30Days: 2000,
      recipientsPerSend: 100,
      timezone: 'America/Boise',
    }
    const consent = { authorizeRecipients: jest.fn() }
    const models: Record<string, any> = {}
    const inputs = (n = 6) =>
      Array.from({ length: n }, (_, i) => ({
        message: 'a'.repeat(307),
        recipient: `+1208555${String(i).padStart(4, '0')}`,
      }))
    const fresh = () =>
      new PacedSmsService(
        db,
        { policy: () => policy } as any,
        consent as any,
        {} as any,
      )
    beforeAll(async () => {
      if (!/^mongodb:\/\/127\.0\.0\.1:27029\/b060_test\?/.test(uri!))
        throw Error('Disposable B060 database only')
      db = await mongoose.createConnection(uri!).asPromise()
      for (const [name, schema] of [
        ['GroupMessageSend', GroupMessageSendSchema],
        ['GroupMessageDelivery', GroupMessageDeliverySchema],
        ['GroupAuditEvent', GroupAuditEventSchema],
        [PACED_ITEM, PacedItemSchema],
        [PACED_SEND, PacedSendSchema],
        ['SmsSafetyUsage', SmsSafetyUsageSchema],
        ['SMS', SMSSchema],
        ['SMSBatch', SMSBatchSchema],
        ['Device', DeviceSchema],
        ['User', UserSchema],
      ] as any) {
        models[name] = db.model(name, schema)
        await models[name].init()
      }
    })
    beforeEach(async () => {
      for (const model of Object.values(models)) await model.deleteMany({})
      now = Date.parse('2026-10-10T18:00:00Z')
      jest.spyOn(Date, 'now').mockImplementation(() => now)
      policy.segmentsPerDay = 200
      policy.segmentsPerMinute = 10
      const userId = new Types.ObjectId()
      await models.User.collection.insertOne({ _id: userId, isBanned: false })
      device = {
        _id: new Types.ObjectId(),
        user: userId,
        enabled: true,
        fcmToken: 'synthetic',
        lastHeartbeat: new Date(now),
        reliability: {
          modeActive: true,
          smsPermissionGranted: true,
          notificationPermissionGranted: true,
          networkConnected: true,
        },
      }
      await models.Device.collection.insertOne(device)
      consent.authorizeRecipients.mockImplementation(async (_, recipients) =>
        recipients.map((recipient) => ({ recipient, eligible: true })),
      )
      sendEach.mockReset().mockResolvedValue({ responses: [{ success: true }] })
      service = fresh()
    })
    afterEach(() => jest.restoreAllMocks())
    afterAll(async () => {
      await db.dropDatabase()
      await db.close()
    })
    it('accepts 18 segments and dispatches at its predicted times', async () => {
      const accepted = await service.accept(
        device,
        inputs(),
        { kind: 'ORDINARY' },
        'group-one',
      )
      expect(accepted.pacing.finishAt).toBe(new Date(now + 96000).toISOString())
      for (const elapsed of [0, 18000, 36000, 60000, 78000, 96000]) {
        now = Date.parse('2026-10-10T18:00:00Z') + elapsed
        await service.dispatchOne(device._id)
        await service.dispatchOne(device._id) // Duplicate wake-up cannot dispatch the next slot early.
      }
      expect(sendEach).toHaveBeenCalledTimes(6)
      const lane = await models.SmsSafetyUsage.findOne({ deviceId: device._id })
      expect(
        lane.ordinaryEvents.filter((e) => e.status === 'CONSUMED'),
      ).toHaveLength(6)
      expect(lane.ordinaryEvents.reduce((n, e) => n + e.segments, 0)).toBe(18)
    })
    it('shares backlog across senders and returns aggregate ETA', async () => {
      await service.accept(device, inputs(), { kind: 'ORDINARY' }, 'a')
      const next = await service.estimate(device._id, Array(6).fill(3))
      expect(next.queuedAheadSegments).toBe(18)
      expect(next.finishAt).toBe(new Date(now + 216000).toISOString())
    })
    it('does not duplicate repeated confirmation', async () => {
      const a = await service.accept(
        device,
        inputs(),
        { kind: 'ORDINARY' },
        'same',
      )
      const b = await service.accept(
        device,
        inputs(),
        { kind: 'ORDINARY' },
        'same',
      )
      expect(String(a.smsBatchId)).toBe(String(b.smsBatchId))
      expect(await models.SMS.countDocuments()).toBe(6)
    })
    it('serializes competing admissions without overcommitting the daily allowance', async () => {
      policy.segmentsPerDay = 20
      // Initialize lane to test transactional contention rather than an initial upsert race.
      await models.SmsSafetyUsage.create({ deviceId: device._id })
      const results = await Promise.allSettled([
        service.accept(device, inputs(), { kind: 'ORDINARY' }, 'a'),
        service.accept(device, inputs(), { kind: 'ORDINARY' }, 'b'),
      ])
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
      expect(await models.SMS.countDocuments()).toBe(6)
      expect(await models.SMSBatch.countDocuments()).toBe(1)
    })
    it('concurrent workers hand off a recipient only once', async () => {
      await service.accept(device, inputs(), { kind: 'ORDINARY' }, 'a')
      await Promise.all([
        service.dispatchOne(device._id),
        fresh().dispatchOne(device._id),
      ])
      expect(sendEach).toHaveBeenCalledTimes(1)
    })
    it('recovers accepted work after a service restart without Redis', async () => {
      await service.accept(device, inputs(), { kind: 'ORDINARY' }, 'a')
      service = fresh()
      await service.dispatchOne(device._id)
      expect(sendEach).toHaveBeenCalledTimes(1)
    })
    it('pauses an offline gateway and resumes without a burst', async () => {
      await models.Device.updateOne(
        { _id: device._id },
        { $set: { lastHeartbeat: new Date(now - 86400000) } },
      )
      const a = await service.accept(
        device,
        inputs(),
        { kind: 'ORDINARY' },
        'a',
      )
      expect(a.pacing.finishAt).toBeNull()
      await service.dispatchOne(device._id)
      expect(sendEach).not.toHaveBeenCalled()
      await models.Device.updateOne(
        { _id: device._id },
        { $set: { lastHeartbeat: new Date(now) } },
      )
      await service.dispatchOne(device._id)
      await service.dispatchOne(device._id)
      expect(sendEach).toHaveBeenCalledTimes(1)
    })
    it('releases unused reservations after consent withdrawal', async () => {
      await service.accept(device, inputs(1), { kind: 'ORDINARY' }, 'a')
      consent.authorizeRecipients.mockResolvedValue([{ eligible: false }])
      await service.dispatchOne(device._id)
      expect(sendEach).not.toHaveBeenCalled()
      expect(
        (await models.SmsSafetyUsage.findOne({ deviceId: device._id }))
          .ordinaryEvents,
      ).toHaveLength(0)
      expect((await models.PacedItem.findOne()).state).toBe('EXCLUDED')
    })
    it('never retries an ambiguous external handoff', async () => {
      await service.accept(device, inputs(1), { kind: 'ORDINARY' }, 'a')
      sendEach.mockRejectedValueOnce(Error('network result unknown'))
      await service.dispatchOne(device._id)
      now += 180000
      await fresh().dispatchOne(device._id)
      expect(sendEach).toHaveBeenCalledTimes(1)
      expect((await models.PacedItem.findOne()).state).toBe('UNRESOLVED')
    })
    it('retains queued reservations across midnight', async () => {
      policy.segmentsPerDay = 20
      await service.accept(device, inputs(), { kind: 'ORDINARY' }, 'a')
      now += 86400000
      await expect(
        service.accept(device, inputs(1), { kind: 'ORDINARY' }, 'b'),
      ).rejects.toThrow('Daily or rolling')
    })
    it('pauses when policy is reduced instead of bypassing it', async () => {
      await service.accept(device, inputs(), { kind: 'ORDINARY' }, 'a')
      policy.segmentsPerDay = 10
      await service.dispatchOne(device._id)
      expect(sendEach).not.toHaveBeenCalled()
      expect(await models.PacedItem.countDocuments({ state: 'QUEUED' })).toBe(6)
    })
    it('rolls back all work when the transaction fails after SMS creation', async () => {
      const spy = jest
        .spyOn(models.PacedItem, 'create')
        .mockRejectedValueOnce(Error('storage failed'))
      await expect(
        service.accept(device, inputs(), { kind: 'ORDINARY' }, 'a'),
      ).rejects.toThrow('storage failed')
      spy.mockRestore()
      expect(await models.SMS.countDocuments()).toBe(0)
      expect(await models.SMSBatch.countDocuments()).toBe(0)
      expect(
        (await models.SmsSafetyUsage.findOne({ deviceId: device._id }))
          .ordinaryEvents,
      ).toHaveLength(0)
    })
    it('retries only an expired unclaimed command, then stops after two attempts', async () => {
      await service.accept(device, inputs(1), { kind: 'ORDINARY' }, 'a')
      await service.dispatchOne(device._id)
      const first = (await models.SMS.findOne()).dispatchAttemptId
      now += 120001
      await service.recoverExpired()
      expect((await models.SMS.findOne()).dispatchAttemptId).toBeUndefined()
      now += 5000
      await service.dispatchOne(device._id)
      expect((await models.SMS.findOne()).dispatchAttemptId).not.toBe(first)
      now += 120001
      await service.recoverExpired()
      expect((await models.PacedItem.findOne()).state).toBe('FAILED')
      expect(sendEach).toHaveBeenCalledTimes(2)
      expect(
        (await models.SmsSafetyUsage.findOne()).ordinaryEvents.reduce(
          (n, e) => n + e.segments,
          0,
        ),
      ).toBe(6)
    })
    it('does not retry when the phone has claimed the command', async () => {
      await service.accept(device, inputs(1), { kind: 'ORDINARY' }, 'a')
      await service.dispatchOne(device._id)
      await models.SMS.updateOne(
        {},
        {
          $set: {
            status: 'dispatched',
            dispatchedAt: new Date(now),
            'metadata.claimedAt': new Date(now),
          },
        },
      )
      now += 180000
      await service.recoverExpired()
      await service.dispatchOne(device._id)
      expect(sendEach).toHaveBeenCalledTimes(1)
    })
    it('keeps an ambiguous crash before external I/O visible and recovers only after expiry', async () => {
      await service.accept(device, inputs(1), { kind: 'ORDINARY' }, 'a')
      await service.dispatchOne(device._id)
      await models.PacedItem.updateOne({}, { $set: { state: 'ISSUED' } })
      const progress = await service.progress(
        (await models.PacedItem.findOne()).batchId,
      )
      expect(progress.counts.UNRESOLVED).toBe(1)
      await service.recoverExpired()
      expect((await models.PacedItem.findOne()).state).toBe('ISSUED')
      now += 120001
      await service.recoverExpired()
      expect((await models.PacedItem.findOne()).state).toBe('QUEUED')
    })
    it('uses the rolling monthly allowance for admission', async () => {
      const original = policy.segmentsRolling30Days
      policy.segmentsRolling30Days = 17
      try {
        await expect(
          service.accept(device, inputs(), { kind: 'ORDINARY' }, 'a'),
        ).rejects.toThrow('Daily or rolling')
      } finally {
        policy.segmentsRolling30Days = original
      }
      expect(await models.SMS.countDocuments()).toBe(0)
    })
    it('does not send after the submitting user is banned', async () => {
      await service.accept(device, inputs(1), { kind: 'ORDINARY' }, 'a')
      await models.User.updateOne(
        { _id: device.user },
        { $set: { isBanned: true } },
      )
      await service.dispatchOne(device._id)
      expect(sendEach).not.toHaveBeenCalled()
      expect((await models.PacedItem.findOne()).state).toBe('EXCLUDED')
    })
    it('does not send before scheduled time', async () => {
      await service.accept(
        device,
        inputs(1).map((i) => ({ ...i, notBefore: new Date(now + 300000) })),
        { kind: 'ORDINARY' },
        'a',
      )
      await service.dispatchOne(device._id)
      expect(sendEach).not.toHaveBeenCalled()
      now += 300000
      await service.dispatchOne(device._id)
      expect(sendEach).toHaveBeenCalledTimes(1)
    })
    it('does not admit paced work over legacy pending reservations', async () => {
      await models.SmsSafetyUsage.create({
        deviceId: device._id,
        ordinaryEvents: [
          { status: 'RESERVED', segments: 1, at: new Date(now) },
        ],
      })
      await expect(
        service.accept(device, inputs(1), { kind: 'ORDINARY' }, 'a'),
      ).rejects.toThrow('Prior SMS work')
    })

    it('commits the group receipt, audience, audit and queue together', async () => {
      const groupId = new Types.ObjectId(),
        organizationId = new Types.ObjectId(),
        previewId = new Types.ObjectId()
      const receipt = {
        send: {
          groupId,
          organizationId,
          previewId,
          actorUserId: device.user,
          deviceId: device._id,
          requestId: 'receipt',
          groupName: 'Synthetic group',
          joinCode: 'TEST',
          body: 'test',
          message: 'test',
          candidateCount: 1,
          acceptedCount: 1,
          excludedCount: 0,
        },
        deliveries: [
          {
            contactId: new Types.ObjectId(),
            displayName: 'Synthetic',
            mobileNumber: '+12085550123',
            status: 'ACCEPTED',
          },
        ],
      }
      const result = await service.accept(
        device,
        inputs(1),
        { kind: 'ORDINARY' },
        'receipt',
        receipt,
      )
      expect(String((await models.GroupMessageSend.findOne()).smsBatchId)).toBe(
        String(result.smsBatchId),
      )
      expect(await models.GroupMessageDelivery.countDocuments()).toBe(1)
      expect(await models.GroupAuditEvent.countDocuments()).toBe(1)
    })
    it('rejects conflicting reuse of a confirmation key', async () => {
      await service.accept(device, inputs(1), { kind: 'ORDINARY' }, 'same')
      await expect(
        service.accept(
          device,
          [{ message: 'different', recipient: '+12085550123' }],
          { kind: 'ORDINARY' },
          'same',
        ),
      ).rejects.toThrow('different message content')
      expect(await models.SMS.countDocuments()).toBe(1)
    })
    it('handles simultaneous identical confirmations with one receipt', async () => {
      await models.SmsSafetyUsage.create({ deviceId: device._id })
      const [a, b] = await Promise.all([
        service.accept(device, inputs(1), { kind: 'ORDINARY' }, 'same'),
        service.accept(device, inputs(1), { kind: 'ORDINARY' }, 'same'),
      ])
      expect(String(a.smsBatchId)).toBe(String(b.smsBatchId))
      expect(await models.SMS.countDocuments()).toBe(1)
    })
it('rechecks eligibility when the phone claims an already issued command', async () => {
  await service.accept(device, inputs(1), { kind: 'ORDINARY' }, 'claim')
  await service.dispatchOne(device._id)
  consent.authorizeRecipients.mockResolvedValue([{ eligible: false }])
  expect(await service.canClaim(await models.SMS.findOne(), device)).toBe(false)
})
it('counts permanent handset failure as an issue in persistent progress', async () => {
  const accepted = await service.accept(
    device,
    inputs(1),
    { kind: 'ORDINARY' },
    'failure',
  )
  await service.dispatchOne(device._id)
  await models.SMS.updateOne(
    {},
    { $set: { status: 'failed', errorCode: 'PHONE_SEND_FAILED' } },
  )
  expect((await service.progress(accepted.smsBatchId)).counts.FAILED).toBe(1)
})

    it('allows exactly one real API phone claim for duplicated command delivery', async () => {
      await service.accept(device, inputs(1), {kind: 'ORDINARY'}, 'duplicate-phone')
      await service.dispatchOne(device._id)
      const sms = await models.SMS.findOne()
      const target = { smsModel: models.SMS, deviceModel: models.Device, paced: service }
      const claim = () => GatewayService.prototype.claimSMSDispatch.call(target, String(device._id), String(sms._id), {
        attemptId: sms.dispatchAttemptId, expiresAt: String(+sms.dispatchExpiresAt),
      })
      const results = await Promise.allSettled([claim(), claim()])
      expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1)
      expect((await models.SMS.findOne()).status).toBe('dispatched')
      now += 180000
      await service.recoverExpired()
      expect(await models.PacedItem.countDocuments({state: 'QUEUED'})).toBe(0)
    })

  },
)