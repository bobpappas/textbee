import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model, Types } from 'mongoose'
import {
  SelfHostedPolicyService,
  smsSegmentCount,
} from '../billing/self-hosted-policy.service'
import { ConsentService } from '../consent/consent.service'
import { GatewayService } from '../gateway/gateway.service'
import { Device } from '../gateway/schemas/device.schema'
import { SMS } from '../gateway/schemas/sms.schema'
import { MembershipStatus } from '../organizations/organization.enums'
import { OrganizationPolicyService } from '../organizations/organization-policy.service'
import { OperatorMembership } from '../organizations/schemas/operator-membership.schema'
import {
  GroupOwnerStatus,
  GroupSenderStatus,
  GroupStatus,
  RosterMembershipStatus,
} from './group.enums'
import { Contact } from './schemas/contact.schema'
import { GroupAuditEvent } from './schemas/group-audit-event.schema'
import { GroupMessageDelivery } from './schemas/group-message-delivery.schema'
import {
  GroupMessagePreview,
  GroupMessagePreviewDocument,
} from './schemas/group-message-preview.schema'
import {
  GroupMessageSend,
  GroupMessageSendDocument,
} from './schemas/group-message-send.schema'
import { GroupOwnerAssignment } from './schemas/group-owner-assignment.schema'
import { GroupSenderAssignment } from './schemas/group-sender-assignment.schema'
import { Group } from './schemas/group.schema'
import { RosterMembership } from './schemas/roster-membership.schema'

type Actor = { _id?: Types.ObjectId | string; id?: string }
type PreviewRecipient = {
  membershipId: string
  contactId: string
  displayName: string
  mobileNumber: string
  eligible: boolean
  reason?: string
}

const PREVIEW_TTL_MS = 10 * 60 * 1000
const UNAVAILABLE = { error: 'Group not found' }

@Injectable()
export class GroupMessagingService {
  constructor(
    @InjectModel(Group.name) private readonly groups: Model<Group>,
    @InjectModel(Contact.name) private readonly contacts: Model<Contact>,
    @InjectModel(RosterMembership.name)
    private readonly memberships: Model<RosterMembership>,
    @InjectModel(GroupOwnerAssignment.name)
    private readonly owners: Model<GroupOwnerAssignment>,
    @InjectModel(OperatorMembership.name)
    private readonly operators: Model<OperatorMembership>,
    @InjectModel(Device.name) private readonly devices: Model<Device>,
    @InjectModel(GroupMessagePreview.name)
    private readonly previews: Model<GroupMessagePreview>,
    @InjectModel(GroupMessageSend.name)
    private readonly sends: Model<GroupMessageSend>,
    @InjectModel(GroupMessageDelivery.name)
    private readonly deliveries: Model<GroupMessageDelivery>,
    @InjectModel(GroupAuditEvent.name)
    private readonly audit: Model<GroupAuditEvent>,
    @InjectModel(SMS.name) private readonly sms: Model<SMS>,
    private readonly organizationPolicy: OrganizationPolicyService,
    private readonly consent: ConsentService,
    private readonly gateway: GatewayService,
    private readonly selfHostedPolicy: SelfHostedPolicyService,
    @InjectModel(GroupSenderAssignment.name)
    private readonly senders?: Model<GroupSenderAssignment>,
  ) {}

  async preview(
    organizationId: string,
    groupId: string,
    actor: Actor,
    input: unknown,
  ) {
    const access = await this.requireActiveGroup(organizationId, groupId, actor)
    const body = this.body(input)
    const message = `${access.group.joinCode}: ${body}`
    const device = await this.soleEnabledDevice(access.group.organizationId)
    const candidates = await this.candidates(
      access.group.organizationId,
      access.group._id,
    )
    const decisions = await this.consent.authorizeRecipients(
      String(device.user),
      candidates.map((item) => item.mobileNumber),
      { kind: 'ORDINARY', organizationId, groupId },
    )
    const seen = new Set<string>()
    const recipients = candidates.map((candidate, index): PreviewRecipient => {
      const decision = decisions[index]
      if (seen.has(candidate.mobileNumber))
        return { ...candidate, eligible: false, reason: 'DUPLICATE_NUMBER' }
      seen.add(candidate.mobileNumber)
      return {
        ...candidate,
        eligible: Boolean(decision?.eligible),
        reason: decision?.reason,
      }
    })
    const eligibleCount = recipients.filter((item) => item.eligible).length
    const policy = this.selfHostedPolicy.policy()
    if (candidates.length > policy.recipientsPerSend)
      throw new ConflictException({
        error: `This group has ${candidates.length} candidates; one send may contain at most ${policy.recipientsPerSend}. The group was not truncated.`,
        code: 'GROUP_RECIPIENT_LIMIT_EXCEEDED',
      })
    const availability = await this.selfHostedPolicy.previewAvailability(
      device._id,
    )
    const segmentsPerRecipient = smsSegmentCount(message)
    const preview = await this.previews.create({
      organizationId: access.group.organizationId,
      groupId: access.group._id,
      actorUserId: access.userId,
      deviceId: device._id,
      groupName: access.group.displayName,
      joinCode: access.group.joinCode,
      body,
      message,
      recipients,
      expiresAt: new Date(Date.now() + PREVIEW_TTL_MS),
    })
    return this.previewView(
      preview,
      availability,
      segmentsPerRecipient,
      eligibleCount,
      access.senderOnly,
    )
  }

  async confirm(
    organizationId: string,
    groupId: string,
    previewId: string,
    actor: Actor,
    requestIdValue?: string,
  ) {
    const requestId = String(requestIdValue || '').trim()
    if (!requestId || requestId.length > 200)
      throw new BadRequestException({
        error: 'A stable X-Request-Id is required',
      })
    const access = await this.requireActiveGroup(organizationId, groupId, actor)
    if (!Types.ObjectId.isValid(previewId)) throw this.previewExpired()
    const prior = await this.sends.findOne({
      organizationId: access.group.organizationId,
      groupId: access.group._id,
      $or: [{ previewId: new Types.ObjectId(previewId) }, { requestId }],
    })
    if (prior) return this.sendView(prior, access.senderOnly)
    const preview = await this.previews.findOne({
      _id: new Types.ObjectId(previewId),
      organizationId: access.group.organizationId,
      groupId: access.group._id,
      actorUserId: access.userId,
      expiresAt: { $gt: new Date() },
    })
    if (!preview || preview.joinCode !== access.group.joinCode)
      throw this.previewExpired()
    const device = await this.soleEnabledDevice(access.group.organizationId)
    if (String(device._id) !== String(preview.deviceId))
      throw this.previewExpired()

    const current = await this.currentEligibleRecipients(
      preview,
      String(device.user),
      organizationId,
      groupId,
    )
    if (!current.eligible.length)
      throw new ConflictException({
        error: 'No previewed recipients remain eligible. Create a new preview.',
        code: 'MESSAGING_ELIGIBILITY_CHANGED',
      })
    const policy = this.selfHostedPolicy.policy()
    if (current.eligible.length > policy.recipientsPerSend)
      throw new ConflictException({
        error: 'The configured recipient limit changed. Create a new preview.',
      })
    const requiredSegments =
      smsSegmentCount(preview.message) * current.eligible.length
    const availability = await this.selfHostedPolicy.previewAvailability(
      device._id,
    )
    if (!this.fitsCapacity(availability, requiredSegments))
      throw new ConflictException({
        error:
          'Local SMS capacity changed and cannot accept this group send. Create a new preview after the active safety window resets.',
        code: 'GROUP_CAPACITY_UNAVAILABLE',
      })

    let send: GroupMessageSendDocument
    try {
      send = await this.sends.create({
        organizationId: access.group.organizationId,
        groupId: access.group._id,
        actorUserId: access.userId,
        deviceId: device._id,
        previewId: preview._id,
        requestId,
        groupName: preview.groupName,
        joinCode: preview.joinCode,
        body: preview.body,
        message: preview.message,
        status: 'PROCESSING',
        candidateCount: preview.recipients.length,
        acceptedCount: current.eligible.length,
        excludedCount: current.excluded.length,
      })
    } catch (error: any) {
      if (error?.code === 11000) {
        const existing = await this.sends.findOne({
          organizationId: access.group.organizationId,
          groupId: access.group._id,
          $or: [{ previewId: preview._id }, { requestId }],
        })
        if (existing) return this.sendView(existing, access.senderOnly)
      }
      throw error
    }

    await this.deliveries.insertMany(
      [
        ...current.eligible.map((item) => ({
          ...item,
          status: 'ACCEPTED',
          exclusionReason: undefined,
        })),
        ...current.excluded.map((item) => ({
          ...item,
          status: 'EXCLUDED',
          exclusionReason: item.reason,
        })),
      ].map((item) => ({
        groupSendId: send._id,
        contactId: new Types.ObjectId(item.contactId),
        displayName: item.displayName,
        mobileNumber: item.mobileNumber,
        status: item.status,
        exclusionReason: item.exclusionReason,
      })),
    )
    try {
      const result = await this.gateway.sendSMS(
        String(device._id),
        {
          message: preview.message,
          recipients: current.eligible.map((item) => item.mobileNumber),
          smsBody: preview.message,
          receivers: current.eligible.map((item) => item.mobileNumber),
        },
        { kind: 'ORDINARY', organizationId, groupId },
        true,
      )
      send.status = result?.queued ? 'QUEUED' : 'ACCEPTED'
      send.smsBatchId = result?.smsBatchId
      await send.save()
      await this.audit.create({
        organizationId: access.group.organizationId,
        actorUserId: access.userId,
        action: 'GROUP_MESSAGE_CONFIRMED',
        targetType: 'GROUP_MESSAGE_SEND',
        targetId: String(send._id),
        newState: JSON.stringify({
          acceptedCount: send.acceptedCount,
          excludedCount: send.excludedCount,
          status: send.status,
        }),
        correlationId: requestId,
      })
      return this.sendView(send, access.senderOnly)
    } catch (error: any) {
      send.status = 'FAILED'
      send.failure = this.safeFailure(error)
      await send.save()
      await this.deliveries.updateMany(
        { groupSendId: send._id, status: 'ACCEPTED' },
        { $set: { status: 'FAILED' } },
      )
      throw error
    }
  }

  async result(
    organizationId: string,
    groupId: string,
    sendId: string,
    actor: Actor,
  ) {
    const access = await this.requireActiveGroup(organizationId, groupId, actor)
    if (!Types.ObjectId.isValid(sendId))
      throw new NotFoundException(UNAVAILABLE)
    const send = await this.sends.findOne({
      _id: new Types.ObjectId(sendId),
      organizationId: access.group.organizationId,
      groupId: access.group._id,
    })
    if (!send) throw new NotFoundException(UNAVAILABLE)
    return this.sendView(send, access.senderOnly)
  }

  private async currentEligibleRecipients(
    preview: GroupMessagePreviewDocument,
    deviceUserId: string,
    organizationId: string,
    groupId: string,
  ) {
    const snapshot = preview.recipients as PreviewRecipient[]
    const activeMemberships = await this.memberships.find({
      organizationId: preview.organizationId,
      groupId: preview.groupId,
      status: RosterMembershipStatus.ACTIVE,
      _id: {
        $in: snapshot.map((item) => new Types.ObjectId(item.membershipId)),
      },
    })
    const activeById = new Map(
      activeMemberships.map((item) => [String(item._id), item]),
    )
    const contacts = await this.contacts.find({
      _id: { $in: activeMemberships.map((item) => item.contactId) },
      organizationId: preview.organizationId,
    })
    const contactsById = new Map(
      contacts.map((item) => [String(item._id), item]),
    )
    const eligibleSnapshot = snapshot.filter((item) => item.eligible)
    const decisions = await this.consent.authorizeRecipients(
      deviceUserId,
      eligibleSnapshot.map((item) => item.mobileNumber),
      { kind: 'ORDINARY', organizationId, groupId },
    )
    const eligible: PreviewRecipient[] = []
    const excluded: Array<PreviewRecipient & { reason: string }> = snapshot
      .filter((item) => !item.eligible)
      .map((item) => ({ ...item, reason: item.reason || 'INELIGIBLE' }))
    eligibleSnapshot.forEach((item, index) => {
      const membership = activeById.get(item.membershipId)
      const contact = contactsById.get(item.contactId)
      const decision = decisions[index]
      const unchanged =
        membership &&
        String(membership.contactId) === item.contactId &&
        contact?.mobileNumber === item.mobileNumber
      if (unchanged && decision?.eligible) eligible.push(item)
      else
        excluded.push({
          ...item,
          eligible: false,
          reason: unchanged
            ? decision?.reason || 'INELIGIBLE'
            : 'ROSTER_CHANGED',
        })
    })
    return { eligible, excluded }
  }

  private async candidates(
    organizationId: Types.ObjectId,
    groupId: Types.ObjectId,
  ) {
    const memberships = await this.memberships
      .find({ organizationId, groupId, status: RosterMembershipStatus.ACTIVE })
      .sort({ _id: 1 })
    const contacts = await this.contacts.find({
      organizationId,
      _id: { $in: memberships.map((item) => item.contactId) },
    })
    const byId = new Map(contacts.map((item) => [String(item._id), item]))
    return memberships.flatMap((membership) => {
      const contact = byId.get(String(membership.contactId))
      return contact
        ? [
            {
              membershipId: String(membership._id),
              contactId: String(contact._id),
              displayName: contact.displayName,
              mobileNumber: contact.mobileNumber,
            },
          ]
        : []
    })
  }

  private async requireActiveGroup(
    organizationId: string,
    groupId: string,
    actor: Actor,
  ) {
    const userId = this.actorId(actor)
    if (
      !Types.ObjectId.isValid(organizationId) ||
      !Types.ObjectId.isValid(groupId)
    )
      throw new NotFoundException(UNAVAILABLE)
    const organizationObjectId = new Types.ObjectId(organizationId)
    const membership = await this.operators.findOne({
      organizationId: organizationObjectId,
      userId,
      status: MembershipStatus.ACTIVE,
    })
    const group =
      membership &&
      (await this.groups.findOne({
        _id: new Types.ObjectId(groupId),
        organizationId: organizationObjectId,
        status: GroupStatus.ACTIVE,
      }))
    if (!membership || !group) throw new NotFoundException(UNAVAILABLE)
    const admin = await this.organizationPolicy.activeAdminMembership(
      organizationId,
      String(userId),
    )
    if (admin) return { group, userId, senderOnly: false }
    const [owner, sender] = await Promise.all([
      this.owners.findOne({
        organizationId: organizationObjectId,
        groupId: group._id,
        membershipId: membership._id,
        status: GroupOwnerStatus.ACTIVE,
      }),
      this.senders?.findOne({
        organizationId: organizationObjectId,
        groupId: group._id,
        membershipId: membership._id,
        status: GroupSenderStatus.ACTIVE,
      }) ?? null,
    ])
    if (!owner && !sender) throw new NotFoundException(UNAVAILABLE)
    return { group, userId, senderOnly: !owner }
  }

  private async soleEnabledDevice(organizationId: Types.ObjectId) {
    const devices = await this.devices
      .find({ organizationId, enabled: true })
      .limit(2)
    if (devices.length !== 1)
      throw new ServiceUnavailableException({
        error: devices.length
          ? 'Group messaging requires exactly one enabled gateway'
          : 'Group messaging requires an enabled gateway',
        code: 'GROUP_GATEWAY_UNAVAILABLE',
      })
    return devices[0]
  }

  private previewView(
    preview: GroupMessagePreviewDocument,
    availability: Record<string, number>,
    segmentsPerRecipient: number,
    eligibleCount: number,
    senderOnly = false,
  ) {
    const recipients = preview.recipients as PreviewRecipient[]
    const excluded = recipients.filter((item) => !item.eligible)
    const reasonCounts = excluded.reduce<Record<string, number>>(
      (counts, item) => {
        const reason = item.reason || 'INELIGIBLE'
        counts[reason] = (counts[reason] || 0) + 1
        return counts
      },
      {},
    )
    const totalSegments = segmentsPerRecipient * eligibleCount
    const capacityAvailable = this.fitsCapacity(availability, totalSegments)
    return {
      id: String(preview._id),
      group: { id: String(preview.groupId), displayName: preview.groupName },
      joinCode: preview.joinCode,
      body: preview.body,
      message: preview.message,
      deviceId: String(preview.deviceId),
      candidateCount: recipients.length,
      eligibleCount,
      excludedCount: excluded.length,
      reasonCounts,
      excluded: senderOnly
        ? []
        : excluded.map((item) => ({
            displayName: item.displayName,
            maskedNumber: this.mask(item.mobileNumber),
            reason: item.reason,
            explanation: this.explanation(item.reason),
          })),
      segmentsPerRecipient,
      totalSegments,
      remainingCapacity: availability,
      capacityAvailable,
      canConfirm: eligibleCount > 0 && capacityAvailable,
      expiresAt: preview.expiresAt,
    }
  }

  private async sendView(send: GroupMessageSendDocument, senderOnly = false) {
    const deliveries = await this.deliveries
      .find({ groupSendId: send._id })
      .sort({ _id: 1 })
    let statusByNumber = new Map<string, string>()
    if (send.smsBatchId) {
      const records = await this.sms.find({ smsBatch: send.smsBatchId })
      statusByNumber = new Map(
        records.map((item) => [
          item.recipient,
          this.deliveryStatus(item.status),
        ]),
      )
    }
    const recipientResults = deliveries.map((item) => ({
      displayName: item.displayName,
      maskedNumber: this.mask(item.mobileNumber),
      status:
        item.status === 'ACCEPTED'
          ? statusByNumber.get(item.mobileNumber) || send.status
          : item.status,
      reason: item.exclusionReason,
    }))
    const counts = recipientResults.reduce<Record<string, number>>(
      (result, item) => {
        result[item.status] = (result[item.status] || 0) + 1
        return result
      },
      {},
    )
    return {
      id: String(send._id),
      status: send.status,
      groupName: send.groupName,
      joinCode: send.joinCode,
      message: send.message,
      candidateCount: send.candidateCount,
      counts,
      recipients: senderOnly ? [] : recipientResults,
      createdAt: send.createdAt,
    }
  }

  private deliveryStatus(status: string) {
    return (
      (
        {
          pending: 'QUEUED',
          dispatched: 'ACCEPTED',
          sent: 'SENT',
          delivered: 'DELIVERED',
          failed: 'FAILED',
          unknown: 'UNKNOWN',
        } as Record<string, string>
      )[status] || 'ACCEPTED'
    )
  }
  private fitsCapacity(
    availability: Record<string, number>,
    requiredSegments: number,
  ) {
    return Object.values(availability).every(
      (remaining) => remaining === -1 || requiredSegments <= remaining,
    )
  }
  private body(value: unknown) {
    const body =
      typeof value === 'object' &&
      value &&
      typeof (value as any).body === 'string'
        ? (value as any).body.trim()
        : ''
    if (!body || body.length > 1000)
      throw new BadRequestException({
        error: 'Message body must contain 1 to 1,000 characters',
      })
    return body
  }
  private actorId(actor: Actor) {
    const id = String(actor?._id ?? actor?.id ?? '')
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException(UNAVAILABLE)
    return new Types.ObjectId(id)
  }
  private mask(value: string) {
    return `***${value.slice(-4)}`
  }
  private explanation(reason?: string) {
    return (
      (
        {
          NO_ACTIVE_GROUP_CONSENT: 'No active consent exists for this group.',
          ORGANIZATION_SUPPRESSION:
            'This number has opted out of organization messaging.',
          INVALID_NUMBER: 'This is not a valid canonical US mobile number.',
          DUPLICATE_NUMBER:
            'Another roster entry uses the same canonical number.',
          ROSTER_CHANGED: 'Roster membership changed after preview.',
        } as Record<string, string>
      )[reason || ''] || 'This recipient is not currently eligible.'
    )
  }
  private previewExpired() {
    return new ConflictException({
      error:
        'This preview is expired or no longer matches the group. Create a new preview.',
      code: 'GROUP_MESSAGE_PREVIEW_INVALID',
    })
  }
  private safeFailure(error: any) {
    return String(
      error?.response?.error || error?.message || 'Dispatch failed',
    ).slice(0, 300)
  }
}
