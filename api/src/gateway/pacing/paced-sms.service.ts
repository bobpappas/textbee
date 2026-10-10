import { Injectable, ConflictException, Logger, Optional } from '@nestjs/common'
import { InjectConnection } from '@nestjs/mongoose'
import { Interval } from '@nestjs/schedule'
import { Connection, Types } from 'mongoose'
import { randomUUID, createHash } from 'crypto'
import { AndroidSmsTransport } from './android-sms.transport'
import { SelfHostedPolicyService } from '../../billing/self-hosted-policy.service'
import { ConsentService } from '../../consent/consent.service'
import { OrganizationPolicyService } from '../../organizations/organization-policy.service'
import { getGatewayAvailability } from '../device-availability'
import { withFreshDispatchAttempt } from '../dispatch-attempt'
import { nextSlot, schedule, slotSpacing, DISPATCH_TICK_MS } from './schedule'
import { smsUnits } from './text'
import { PACED_ITEM, PACED_SEND } from './paced-sms.schema'

export type PacedInput = {
  message: string
  recipient: string
  notBefore?: Date
  simSubscriptionId?: number
}
@Injectable()
export class PacedSmsService {
  private running = false
  private readonly logger = new Logger(PacedSmsService.name)
  constructor(
    @InjectConnection() private db: Connection,
    private policyService: SelfHostedPolicyService,
    private consent: ConsentService,
    private organizationPolicy: OrganizationPolicyService,
    @Optional()
    private transport: AndroidSmsTransport = new AndroidSmsTransport(),
  ) {}
  private model(name: string): any {
    return this.db.model<any>(name)
  }
  enabled() {
    return process.env.TEXTBEE_BILLING_MODE === 'self_hosted'
  }
  private day(at: number) {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: this.policyService.policy().timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date(at))
  }
  private totals(events: any[], now: number) {
    return events.reduce(
      (sum, e) => {
        const held = e.paced && e.status === 'RESERVED'
        if (held || e.dayKey === this.day(now)) sum.day += e.segments
        if (held || Math.abs(now - +new Date(e.at)) < 30 * 86400_000)
          sum.month += e.segments
        return sum
      },
      { day: 0, month: 0 },
    )
  }
  private history(events: any[]) {
    return events
      .filter((e) => !(e.paced && e.status === 'RESERVED'))
      .map((e) => ({ at: +new Date(e.at), segments: e.segments }))
  }
  private fits(used: number, cost: number, limit: number) {
    return limit === -1 || used + cost <= limit
  }
  async estimate(deviceId: any, costs: number[] = [], batchId?: any) {
    const now = Date.now(),
      policy = this.policyService.policy()
    const [lane, items, device] = await Promise.all([
      this.model('SmsSafetyUsage').findOne({ deviceId }).lean(),
      this.model(PACED_ITEM)
        .find({ deviceId, state: 'QUEUED' })
        .sort({ sequence: 1 })
        .lean(),
      this.model('Device').findById(deviceId).lean(),
    ])
    const events = (lane as any)?.ordinaryEvents || []
    const totals = this.totals(events, now)
    const total = costs.reduce((a, b) => a + b, 0)
    const allowed =
      costs.every(
        (c) => policy.segmentsPerMinute === -1 || c <= policy.segmentsPerMinute,
      ) &&
      this.fits(totals.day, total, policy.segmentsPerDay) &&
      this.fits(totals.month, total, policy.segmentsRolling30Days)
    const proposed = costs.map((segments, i) => ({
      id: `new:${i}`,
      segments,
      notBefore: now,
    }))
    const timetable = schedule(
      now,
      +(lane as any)?.pacedNextAt || 0,
      policy.segmentsPerMinute,
      this.history(events),
      [
        ...items.map((i: any) => ({
          id: String(i._id),
          segments: i.segments,
          notBefore: +new Date(i.notBefore),
        })),
        ...proposed,
      ],
    )
    const ids = new Set(
      batchId
        ? items
            .filter((i: any) => String(i.batchId) === String(batchId))
            .map((i) => String(i._id))
        : proposed.map((i) => i.id),
    )
    const selected = timetable?.filter((i) => ids.has(i.id)) || []
    const online = Boolean(
      device &&
      getGatewayAvailability(device as any, new Date(Date.now())).available,
    )
    return {
      generatedAt: new Date(now).toISOString(),
      capacityAvailable: allowed,
      rate: policy.segmentsPerMinute,
      waitingForGateway: !online,
      startAt:
        online && allowed && selected.length
          ? new Date(selected[0].at).toISOString()
          : null,
      finishAt:
        online && allowed && selected.length
          ? new Date(selected[selected.length - 1].at).toISOString()
          : null,
      queuedAheadSegments: batchId
        ? undefined
        : items.reduce((n, i: any) => n + i.segments, 0),
    }
  }
  async accept(
    device: any,
    inputs: PacedInput[],
    context: any,
    key: string = randomUUID(),
    receipt?: { send: any; deliveries: any[] },
  ) {
    const deviceId = device._id,
      policy = this.policyService.policy()
    if (!inputs.length || inputs.length > policy.recipientsPerSend)
      throw new ConflictException('Recipient limit exceeded')
    const costs = inputs.map((i) => smsUnits(i.message).segments)
    if (
      costs.some(
        (c) => policy.segmentsPerMinute !== -1 && c > policy.segmentsPerMinute,
      )
    )
      throw new ConflictException(
        'Shorten the message: one recipient exceeds the per-minute segment limit',
      )
    const fingerprint = createHash('sha256')
      .update(JSON.stringify({ inputs, context }))
      .digest('hex')
    await this.model('SmsSafetyUsage')
      .updateOne(
        { deviceId },
        {
          $setOnInsert: {
            deviceId,
            organizationId: device.organizationId,
            ordinaryEvents: [],
            complianceEvents: [],
          },
        },
        { upsert: true },
      )
      .catch((error) => {
        if (error.code !== 11000) throw error
      })
    let batchId: any
    const session = await this.db.startSession()
    try {
      await session.withTransaction(async () => {
        const prior = await this.model(PACED_SEND)
          .findOne({ deviceId, key })
          .session(session)
        if (prior) {
          if (prior.fingerprint !== fingerprint)
            throw new ConflictException(
              'Confirmation key belongs to different message content',
            )
          batchId = prior.batchId
          return
        }
        const lane = await this.model('SmsSafetyUsage')
          .findOne({ deviceId })
          .session(session)
        const now = Date.now(),
          events = lane.ordinaryEvents || []
        // Refuse ambiguous legacy reservations instead of replaying old jobs.
        if (events.some((e) => !e.paced && e.status === 'RESERVED'))
          throw new ConflictException(
            'Prior SMS work must finish before paced admission',
          )
        const totals = this.totals(events, now),
          total = costs.reduce((a, b) => a + b, 0)
        if (
          !this.fits(totals.day, total, policy.segmentsPerDay) ||
          !this.fits(totals.month, total, policy.segmentsRolling30Days)
        )
          throw new ConflictException(
            'Daily or rolling SMS allowance cannot accept this send',
          )
        const [batch] = await this.model('SMSBatch').create(
          [
            {
              user: device.user,
              device: deviceId,
              organizationId: device.organizationId,
              requestedByUserId: context.actorUserId || device.user,
              message: inputs[0].message,
              recipientCount: inputs.length,
              status: 'pending',
              metadata: { paced: true },
            },
          ],
          { session },
        )
        batchId = batch._id
        let sequence = lane.pacedSequence || 0
        for (const [index, input] of inputs.entries()) {
          const [sms] = await this.model('SMS').create(
            [
              {
                user: device.user,
                device: deviceId,
                organizationId: device.organizationId,
                requestedByUserId: context.actorUserId || device.user,
                smsBatch: batchId,
                message: input.message,
                recipient: input.recipient,
                type: 'SENT',
                transportIdentity: `paced:${randomUUID()}`,
                status: 'pending',
                requestedAt: new Date(now),
                simSubscriptionId: input.simSubscriptionId,
                metadata: {
                  paced: true,
                  policyContext: context,
                  organizationId: context.organizationId,
                  groupId: context.groupId,
                },
              },
            ],
            { session },
          )
          await this.model(PACED_ITEM).create(
            [
              {
                deviceId,
                batchId,
                smsId: sms._id,
                segments: costs[index],
                sequence: ++sequence,
                notBefore: input.notBefore || new Date(now),
                context,
              },
            ],
            { session },
          )
          events.push({
            reservationId: String(sms._id),
            segments: costs[index],
            at: new Date(now),
            dayKey: this.day(now),
            status: 'RESERVED',
            paced: true,
          })
        }
        await this.model('SmsSafetyUsage').updateOne(
          { _id: lane._id },
          {
            $set: { ordinaryEvents: events, pacedSequence: sequence },
            $inc: { pacedRevision: 1 },
          },
          { session },
        )
        await this.model(PACED_SEND).create(
          [{ deviceId, key, fingerprint, batchId }],
          { session },
        )
        if (receipt) {
          const [groupSend] = await this.model('GroupMessageSend').create(
            [{ ...receipt.send, smsBatchId: batchId, status: 'QUEUED' }],
            { session },
          )
          await this.model('GroupMessageDelivery').create(
            receipt.deliveries.map((d) => ({
              ...d,
              groupSendId: groupSend._id,
            })),
            { session, ordered: true },
          )
          await this.model('GroupAuditEvent').create(
            [
              {
                organizationId: receipt.send.organizationId,
                actorUserId: receipt.send.actorUserId,
                action: 'GROUP_MESSAGE_CONFIRMED',
                targetType: 'GROUP_MESSAGE_SEND',
                targetId: String(groupSend._id),
                newState: JSON.stringify({
                  acceptedCount: receipt.send.acceptedCount,
                }),
                correlationId: receipt.send.requestId,
              },
            ],
            { session },
          )
        }
      })
    } finally {
      await session.endSession()
    }
    return {
      success: true,
      queued: true,
      smsBatchId: batchId,
      recipientCount: inputs.length,
      pacing: await this.estimate(deviceId, [], batchId),
    }
  }
  async pendingBatches(groupId: string) {
    return this.model(PACED_ITEM).distinct('batchId', {
      'context.groupId': groupId,
      state: 'QUEUED',
    })
  }
  async progress(batchId: any) {
    const items = await this.model(PACED_ITEM)
      .find({ batchId })
      .sort({ sequence: 1 })
      .lean()
    if (!items.length) return null
    const sms = await this.model('SMS')
      .find({ smsBatch: batchId })
      .select('_id status')
      .lean()
    const statuses = new Map(sms.map((s) => [String(s._id), s.status]))
    const counts = items.reduce((o: any, i: any) => {
      const status = statuses.get(String(i.smsId))
      const state =
        i.state === 'ISSUED' ||
        (i.state === 'HANDED_OFF' && status === 'unknown')
          ? 'UNRESOLVED'
          : i.state === 'HANDED_OFF' && status === 'failed'
            ? 'FAILED'
            : i.state
      o[state] = (o[state] || 0) + 1
      return o
    }, {})
    return {
      counts,
      total: items.length,
      ...(await this.estimate(items[0].deviceId, [], batchId)),
    }
  }
  private async authorized(device: any, item: any, sms: any) {
    const ctx = item.context || { kind: 'ORDINARY' }
    if (!device?.enabled) return false
    if (
      ctx.organizationId &&
      String(device.organizationId) !== ctx.organizationId
    )
      return false
    const userId = ctx.actorUserId || String(device.user)
    const user = await this.model('User').findById(userId).lean()
    if (!user || user.isBanned) return false
    if (
      this.db.models.OAuthApproval &&
      (await this.model('OAuthApproval').exists({ userId, state: 'REVOKED' }))
    )
      return false
    if (ctx.groupId) {
      const member = await this.model('OperatorMembership')
        .findOne({
          organizationId: ctx.organizationId,
          userId,
          status: 'ACTIVE',
        })
        .lean()
      const group = await this.model('Group')
        .findOne({
          _id: ctx.groupId,
          organizationId: ctx.organizationId,
          status: 'ACTIVE',
        })
        .lean()
      if (!member || !group) return false
      const admin = await this.organizationPolicy.activeAdminMembership(
        ctx.organizationId,
        userId,
      )
      if (!admin) {
        const q = {
          organizationId: ctx.organizationId,
          groupId: ctx.groupId,
          membershipId: member._id,
          status: 'ACTIVE',
        }
        const [owner, sender] = await Promise.all([
          this.model('GroupOwnerAssignment').exists(q),
          this.model('GroupSenderAssignment').exists(q),
        ])
        if (!owner && !sender) return false
      }
    }
    const [decision] = await this.consent.authorizeRecipients(
      String(device.user),
      [sms.recipient],
      ctx,
    )
    return Boolean(decision?.eligible)
  }
  async recoverExpired() {
    const now = Date.now()
    const candidates = await this.model(PACED_ITEM)
      .find({
        state: { $in: ['ISSUED', 'HANDED_OFF', 'UNRESOLVED'] },
        issuedAt: { $lte: new Date(now - 120_000) },
      })
      .limit(100)
    for (const candidate of candidates) {
      const session = await this.db.startSession()
      try {
        await session.withTransaction(async () => {
          const item = await this.model(PACED_ITEM)
            .findOne({
              _id: candidate._id,
              attemptId: candidate.attemptId,
              state: { $in: ['ISSUED', 'HANDED_OFF', 'UNRESOLVED'] },
            })
            .session(session)
          if (!item) return
          const sms = await this.model('SMS')
            .findOne({
              _id: item.smsId,
              dispatchAttemptId: item.attemptId,
              dispatchExpiresAt: { $lte: new Date(now) },
              dispatchedAt: { $exists: false },
              'metadata.claimedAt': { $exists: false },
              $or: [
                { status: 'pending' },
                { status: 'failed', errorCode: 'GATEWAY_UNAVAILABLE' },
              ],
            })
            .session(session)
          if (!sms) return // Claimed, acknowledged, or conclusively failed: never resend.
          if (item.attempts >= 2) {
            await this.model(PACED_ITEM).updateOne(
              { _id: item._id },
              {
                $set: {
                  state: 'FAILED',
                  reason: 'Phone did not claim the command after two attempts',
                },
              },
              { session },
            )
            await this.model('SMS').updateOne(
              { _id: sms._id, dispatchAttemptId: item.attemptId },
              {
                $set: {
                  status: 'failed',
                  errorCode: 'GATEWAY_UNAVAILABLE',
                  failedAt: new Date(now),
                },
              },
              { session },
            )
            return
          }
          const lane = await this.model('SmsSafetyUsage')
            .findOne({ deviceId: item.deviceId })
            .session(session)
          const events = lane.ordinaryEvents || [],
            totals = this.totals(events, now),
            policy = this.policyService.policy()
          if (
            !this.fits(totals.day, item.segments, policy.segmentsPerDay) ||
            !this.fits(
              totals.month,
              item.segments,
              policy.segmentsRolling30Days,
            )
          ) {
            await this.model(PACED_ITEM).updateOne(
              { _id: item._id },
              {
                $set: {
                  state: 'UNRESOLVED',
                  reason: 'Retry waiting for sending allowance',
                },
              },
              { session },
            )
            return
          }
          const reservationId = `${item.smsId}:${item.attempts + 1}`
          events.push({
            reservationId,
            segments: item.segments,
            at: new Date(now),
            dayKey: this.day(now),
            status: 'RESERVED',
            paced: true,
          })
          // Atomic SMS write fences a phone claim racing this recovery transaction.
          await this.model('SMS').updateOne(
            { _id: sms._id, dispatchAttemptId: item.attemptId },
            {
              $set: { status: 'pending' },
              $unset: {
                dispatchAttemptId: '',
                dispatchIssuedAt: '',
                dispatchExpiresAt: '',
                errorCode: '',
                failedAt: '',
              },
            },
            { session },
          )
          await this.model('SmsSafetyUsage').updateOne(
            { _id: lane._id },
            { $set: { ordinaryEvents: events }, $inc: { pacedRevision: 1 } },
            { session },
          )
          await this.model(PACED_ITEM).updateOne(
            { _id: item._id },
            {
              $set: {
                state: 'QUEUED',
                reservationId,
                notBefore: new Date(now + 5000),
              },
              $unset: { reason: '', attemptId: '' },
            },
            { session },
          )
        })
      } finally {
        await session.endSession()
      }
    }
  }
  async canClaim(sms: any, device: any) {
    if (!sms.metadata?.paced) return true
    const item = await this.model(PACED_ITEM).findOne({ smsId: sms._id })
    return Boolean(item && (await this.authorized(device, item, sms)))
  }
  @Interval(DISPATCH_TICK_MS)
  async tick() {
    if (!this.enabled() || this.running) return
    this.running = true
    try {
      await this.recoverExpired()
      const devices = await this.model(PACED_ITEM).distinct('deviceId', {
        state: 'QUEUED',
        notBefore: { $lte: new Date(Date.now()) },
      })
      for (const id of devices) await this.dispatchOne(id)
    } catch {
      this.logger.error(
        'Paced dispatch paused; retrying durable work on next tick',
      )
    } finally {
      this.running = false
    }
  }
  async dispatchOne(deviceId: any) {
    const candidate = await this.model(PACED_ITEM)
      .findOne({
        deviceId,
        state: 'QUEUED',
        notBefore: { $lte: new Date(Date.now()) },
      })
      .sort({ sequence: 1 })
    if (!candidate) return
    const [device, sms] = await Promise.all([
      this.model('Device').findById(deviceId),
      this.model('SMS').findById(candidate.smsId),
    ])
    const eligible = Boolean(
      sms && (await this.authorized(device, candidate, sms)),
    )
    if (
      eligible &&
      !getGatewayAvailability(device as any, new Date(Date.now())).available
    )
      return
    let command: any, itemId: any
    const session = await this.db.startSession()
    try {
      await session.withTransaction(async () => {
        command = undefined
        const item = await this.model(PACED_ITEM)
          .findOne({ _id: candidate._id, state: 'QUEUED' })
          .session(session)
        if (!item) return
        const lane = await this.model('SmsSafetyUsage')
          .findOne({ deviceId })
          .session(session)
        const events = lane.ordinaryEvents || [],
          now = Date.now(),
          policy = this.policyService.policy()
        const held = events.find(
          (e) =>
            e.reservationId === (item.reservationId || String(item.smsId)) &&
            e.status === 'RESERVED',
        )
        if (!held) throw new Error('Missing durable reservation')
        if (!eligible) {
          await this.model(PACED_ITEM).updateOne(
            { _id: item._id },
            { $set: { state: 'EXCLUDED', reason: 'Eligibility changed' } },
            { session },
          )
          await this.model('SMS').updateOne(
            { _id: item.smsId },
            {
              $set: {
                status: 'failed',
                errorCode: 'RECIPIENT_INELIGIBLE',
                failedAt: new Date(now),
              },
            },
            { session },
          )
          await this.model('SmsSafetyUsage').updateOne(
            { _id: lane._id },
            {
              $pull: {
                ordinaryEvents: {
                  reservationId: item.reservationId || String(item.smsId),
                },
              },
              $inc: { pacedRevision: 1 },
            },
            { session },
          )
          return
        }
        const totals = this.totals(events, now)
        if (
          !this.fits(totals.day, 0, policy.segmentsPerDay) ||
          !this.fits(totals.month, 0, policy.segmentsRolling30Days)
        )
          return
        const at = nextSlot(
          now,
          +lane.pacedNextAt || 0,
          item.segments,
          policy.segmentsPerMinute,
          this.history(events),
        )
        if (at === null || at > now) return
        const payload = {
          smsId: String(sms._id),
          smsBatchId: String(item.batchId),
          message: sms.message,
          smsBody: sms.message,
          recipients: [sms.recipient],
          receivers: [sms.recipient],
          policyContext: item.context,
          ...(sms.simSubscriptionId !== undefined
            ? { simSubscriptionId: sms.simSubscriptionId }
            : {}),
        }
        command = withFreshDispatchAttempt(
          {
            token: device.fcmToken,
            data: { smsData: JSON.stringify(payload) },
          },
          new Date(now),
        )
        const issued = JSON.parse(command.data.smsData)
        const updated = await this.model('SMS').updateOne(
          {
            _id: sms._id,
            status: 'pending',
            dispatchAttemptId: { $exists: false },
          },
          {
            $set: {
              dispatchAttemptId: issued.attemptId,
              dispatchIssuedAt: new Date(now),
              dispatchExpiresAt: new Date(Number(issued.expiresAt)),
            },
          },
          { session },
        )
        if (updated.modifiedCount !== 1) throw new Error('SMS already issued')
        held.status = 'CONSUMED'
        held.at = new Date(now)
        held.dayKey = this.day(now)
        await this.model('SmsSafetyUsage').updateOne(
          { _id: lane._id },
          {
            $set: {
              ordinaryEvents: events,
              pacedNextAt: new Date(now + slotSpacing(item.segments, policy.segmentsPerMinute)),
            },
            $inc: { pacedRevision: 1 },
          },
          { session },
        )
        await this.model(PACED_ITEM).updateOne(
          { _id: item._id },
          {
            $set: {
              state: 'ISSUED',
              issuedAt: new Date(now),
              attemptId: issued.attemptId,
            },
            $inc: { attempts: 1 },
          },
          { session },
        )
        itemId = item._id
      })
    } finally {
      await session.endSession()
    }
    if (!command) return
    // Never replay ISSUED work after an ambiguous crash/transport result.
    try {
      const ok = (await this.transport.handoff(command)) === 'ACCEPTED'
      await this.model(PACED_ITEM).updateOne(
        {
          _id: itemId,
          state: 'ISSUED',
          attemptId: JSON.parse(command.data.smsData).attemptId,
        },
        { $set: { state: ok ? 'HANDED_OFF' : 'FAILED' } },
      )
      if (!ok)
        await this.model('SMS').updateOne(
          { _id: sms._id, status: 'pending' },
          {
            $set: {
              status: 'failed',
              failedAt: new Date(Date.now()),
              errorCode: 'FCM_DELIVERY_FAILED',
            },
          },
        )
    } catch {
      await this.model(PACED_ITEM).updateOne(
        {
          _id: itemId,
          state: 'ISSUED',
          attemptId: JSON.parse(command.data.smsData).attemptId,
        },
        {
          $set: {
            state: 'UNRESOLVED',
            reason: 'Transport result unknown; no automatic resend',
          },
        },
      )
    }
  }
}
