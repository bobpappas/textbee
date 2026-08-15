import { HttpException, HttpStatus, Injectable } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { randomUUID } from 'crypto'
import { Model, Types } from 'mongoose'
import { Device } from '../gateway/schemas/device.schema'
import { loadSelfHostedPolicy } from './self-hosted-policy.config'
import { SmsSafetyUsage } from './sms-safety-usage.schema'

export type SafetyKind = 'ORDINARY' | 'COMPLIANCE'

const GSM_BASIC = new Set(
  '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà',
)
const GSM_EXTENDED = new Set('^{}\\[~]|€')

export function smsSegmentCount(message: string) {
  let septets = 0
  for (const character of message) {
    if (GSM_BASIC.has(character)) septets += 1
    else if (GSM_EXTENDED.has(character)) septets += 2
    else {
      const units = message.length
      return units <= 70 ? 1 : Math.ceil(units / 67)
    }
  }
  return septets <= 160 ? 1 : Math.ceil(septets / 153)
}

@Injectable()
export class SelfHostedPolicyService {
  constructor(
    @InjectModel(SmsSafetyUsage.name)
    private readonly usage: Model<SmsSafetyUsage>,
    @InjectModel(Device.name) private readonly devices: Model<Device>,
  ) {}

  policy() {
    return loadSelfHostedPolicy()
  }

  async reserve(input: {
    deviceId: string | Types.ObjectId
    kind: SafetyKind
    messages: Array<{ message: string; recipientCount: number }>
    effectiveAt?: Date
  }) {
    const policy = this.policy()
    const recipients = input.messages.reduce(
      (total, item) => total + item.recipientCount,
      0,
    )
    if (input.kind === 'ORDINARY' && recipients > policy.recipientsPerSend)
      throw this.limitError(
        `One send may contain at most ${policy.recipientsPerSend} recipients`,
      )
    const segments = input.messages.reduce(
      (total, item) =>
        total + smsSegmentCount(item.message) * item.recipientCount,
      0,
    )
    const at = input.effectiveAt || new Date()
    const deviceId = new Types.ObjectId(String(input.deviceId))
    const reservationId = randomUUID()
    const event = {
      reservationId,
      at,
      dayKey: this.dayKey(at, policy.timezone),
      segments,
      status: 'RESERVED',
    }
    await this.usage.updateOne(
      { deviceId },
      { $setOnInsert: { deviceId, ordinaryEvents: [], complianceEvents: [] } },
      { upsert: true },
    )
    const eventsField =
      input.kind === 'ORDINARY' ? 'ordinaryEvents' : 'complianceEvents'
    const limits =
      input.kind === 'ORDINARY'
        ? [
            [
              policy.segmentsPerMinute,
              this.sumExpression(eventsField, at, 'MINUTE'),
            ],
            [policy.segmentsPerDay, this.sumExpression(eventsField, at, 'DAY')],
            [
              policy.segmentsRolling30Days,
              this.sumExpression(eventsField, at, 'ROLLING_30_DAYS'),
            ],
          ]
        : [
            [
              policy.complianceSegmentsPerDay,
              this.sumExpression(eventsField, at, 'DAY'),
            ],
          ]
    const checks = limits
      .filter(([limit]) => limit !== -1)
      .map(([limit, used]) => ({ $lte: [{ $add: [used, segments] }, limit] }))
    const reserved = await this.usage.findOneAndUpdate(
      { deviceId, ...(checks.length ? { $expr: { $and: checks } } : {}) },
      { $push: { [eventsField]: event } },
      { new: true },
    )
    if (!reserved) {
      const retryAt = await this.retryAt(deviceId, input.kind, at, segments)
      throw this.limitError(
        input.kind === 'ORDINARY'
          ? 'Operational SMS limit reached; retry after the active safety window resets'
          : 'Compliance response allowance exhausted; the inbound command was still processed',
        retryAt,
      )
    }
    return { reservationId, segments, kind: input.kind }
  }

  async consume(
    deviceId: string | Types.ObjectId,
    reservationId: string,
    kind: SafetyKind,
  ) {
    const field = kind === 'ORDINARY' ? 'ordinaryEvents' : 'complianceEvents'
    await this.usage.updateOne(
      { deviceId: new Types.ObjectId(String(deviceId)) },
      { $set: { [`${field}.$[event].status`]: 'CONSUMED' } },
      { arrayFilters: [{ 'event.reservationId': reservationId }] },
    )
  }

  async release(
    deviceId: string | Types.ObjectId,
    reservationId: string,
    kind: SafetyKind,
  ) {
    const field = kind === 'ORDINARY' ? 'ordinaryEvents' : 'complianceEvents'
    await this.usage.updateOne(
      { deviceId: new Types.ObjectId(String(deviceId)) },
      { $pull: { [field]: { reservationId, status: 'RESERVED' } } },
    )
  }

  async compatibilityResponse(userId: string | Types.ObjectId) {
    const policy = this.policy()
    const devices = await this.devices.find({
      user: new Types.ObjectId(String(userId)),
      enabled: true,
    })
    const usageDocuments = await this.usage.find({
      deviceId: { $in: devices.map((device) => device._id) },
    })
    const now = new Date()
    const events = usageDocuments.flatMap(
      (document) =>
        (document.ordinaryEvents || []) as Array<{
          at: Date
          dayKey: string
          segments: number
        }>,
    )
    const usedMinute = this.sumEvents(events, now, policy.timezone, 'MINUTE')
    const usedDay = this.sumEvents(events, now, policy.timezone, 'DAY')
    const used30Days = this.sumEvents(
      events,
      now,
      policy.timezone,
      'ROLLING_30_DAYS',
    )
    return {
      mode: 'self_hosted',
      policy,
      usage: {
        segmentsThisMinute: usedMinute,
        processedSmsToday: usedDay,
        processedSmsLastMonth: used30Days,
        minuteLimit: policy.segmentsPerMinute,
        dailyLimit: policy.segmentsPerDay,
        monthlyLimit: policy.segmentsRolling30Days,
        bulkSendLimit: policy.recipientsPerSend,
        deviceLimit: policy.activeDeviceLimit,
        dailyRemaining: this.remaining(policy.segmentsPerDay, usedDay),
        monthlyRemaining: this.remaining(
          policy.segmentsRolling30Days,
          used30Days,
        ),
        dailyUsagePercentage: this.percentage(policy.segmentsPerDay, usedDay),
        monthlyUsagePercentage: this.percentage(
          policy.segmentsRolling30Days,
          used30Days,
        ),
      },
    }
  }

  private sumExpression(
    field: string,
    at: Date,
    window: 'MINUTE' | 'DAY' | 'ROLLING_30_DAYS',
  ): Record<string, unknown> {
    const condition =
      window === 'DAY'
        ? { $eq: ['$$event.dayKey', this.dayKey(at, this.policy().timezone)] }
        : {
            $lte: [
              { $abs: { $subtract: ['$$event.at', at] } },
              window === 'MINUTE' ? 60_000 : 30 * 24 * 60 * 60 * 1000,
            ],
          }
    return {
      $sum: {
        $map: {
          input: {
            $filter: {
              input: { $ifNull: [`$${field}`, []] },
              as: 'event',
              cond: condition,
            },
          },
          as: 'event',
          in: '$$event.segments',
        },
      },
    }
  }

  private sumEvents(
    events: Array<{ at: Date; dayKey: string; segments: number }>,
    at: Date,
    timezone: string,
    window: 'MINUTE' | 'DAY' | 'ROLLING_30_DAYS',
  ) {
    return events.reduce((total, event) => {
      const eventAt = new Date(event.at)
      const included =
        window === 'DAY'
          ? event.dayKey === this.dayKey(at, timezone)
          : Math.abs(eventAt.getTime() - at.getTime()) <=
            (window === 'MINUTE' ? 60_000 : 30 * 24 * 60 * 60 * 1000)
      return total + (included ? event.segments : 0)
    }, 0)
  }

  private dayKey(at: Date, timezone: string) {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(at)
  }

  private remaining(limit: number, used: number) {
    return limit === -1 ? -1 : Math.max(0, limit - used)
  }

  private percentage(limit: number, used: number) {
    return limit === -1 ? 0 : Math.round((used / limit) * 100)
  }

  private async retryAt(
    deviceId: Types.ObjectId,
    kind: SafetyKind,
    at: Date,
    addedSegments: number,
  ) {
    const policy = this.policy()
    const document = await this.usage.findOne({ deviceId })
    const field = kind === 'ORDINARY' ? 'ordinaryEvents' : 'complianceEvents'
    const events = (
      (document?.[field] || []) as Array<{
        at: Date
        dayKey: string
        segments: number
      }>
    ).map((event) => ({ ...event, at: new Date(event.at) }))
    const candidates: Date[] = []
    const addWindowCandidate = (duration: number, limit: number) => {
      if (limit === -1) return
      const included = events.filter(
        (event) => Math.abs(event.at.getTime() - at.getTime()) <= duration,
      )
      const used = included.reduce((total, event) => total + event.segments, 0)
      if (used + addedSegments > limit && included.length)
        candidates.push(
          new Date(
            Math.max(...included.map((event) => event.at.getTime())) +
              duration +
              1,
          ),
        )
    }
    const dayLimit =
      kind === 'ORDINARY'
        ? policy.segmentsPerDay
        : policy.complianceSegmentsPerDay
    const usedDay = this.sumEvents(events, at, policy.timezone, 'DAY')
    if (dayLimit !== -1 && usedDay + addedSegments > dayLimit)
      candidates.push(this.nextLocalDay(at, policy.timezone))
    if (kind === 'ORDINARY') {
      addWindowCandidate(60_000, policy.segmentsPerMinute)
      addWindowCandidate(30 * 24 * 60 * 60 * 1000, policy.segmentsRolling30Days)
    }
    return candidates.length
      ? new Date(
          Math.max(...candidates.map((candidate) => candidate.getTime())),
        )
      : undefined
  }

  private nextLocalDay(at: Date, timezone: string) {
    const currentDay = this.dayKey(at, timezone)
    let low = at.getTime()
    let high = low + 36 * 60 * 60 * 1000
    while (this.dayKey(new Date(high), timezone) === currentDay)
      high += 24 * 60 * 60 * 1000
    while (high - low > 1000) {
      const middle = Math.floor((low + high) / 2)
      if (this.dayKey(new Date(middle), timezone) === currentDay) low = middle
      else high = middle
    }
    return new Date(high)
  }

  private limitError(message: string, retryAt?: Date) {
    return new HttpException(
      {
        message,
        code: 'SELF_HOSTED_SMS_LIMIT',
        hasReachedLimit: true,
        ...(retryAt && {
          retryAt: retryAt.toISOString(),
          retryAfterSeconds: Math.max(
            1,
            Math.ceil((retryAt.getTime() - Date.now()) / 1000),
          ),
        }),
      },
      HttpStatus.TOO_MANY_REQUESTS,
    )
  }
}
