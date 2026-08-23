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
  smsSegmentCount,
  SelfHostedPolicyService,
} from '../billing/self-hosted-policy.service'
import { ConsentService } from '../consent/consent.service'
import { Device } from '../gateway/schemas/device.schema'
import { SMS } from '../gateway/schemas/sms.schema'
import { SMSType } from '../gateway/sms-type.enum'
import { GatewayService } from '../gateway/gateway.service'
import {
  GroupOwnerStatus,
  GroupSenderStatus,
  GroupStatus,
  RosterMembershipStatus,
} from '../groups/group.enums'
import { Contact } from '../groups/schemas/contact.schema'
import { GroupAuditEvent } from '../groups/schemas/group-audit-event.schema'
import { GroupMessageDelivery } from '../groups/schemas/group-message-delivery.schema'
import { GroupMessageSend } from '../groups/schemas/group-message-send.schema'
import { GroupOwnerAssignment } from '../groups/schemas/group-owner-assignment.schema'
import { GroupSenderAssignment } from '../groups/schemas/group-sender-assignment.schema'
import { Group } from '../groups/schemas/group.schema'
import { RosterMembership } from '../groups/schemas/roster-membership.schema'
import { MembershipStatus } from '../organizations/organization.enums'
import { OrganizationPolicyService } from '../organizations/organization-policy.service'
import { OperatorMembership } from '../organizations/schemas/operator-membership.schema'
import { User } from '../users/schemas/user.schema'
import {
  ATTRIBUTION_ALGORITHM_VERSION,
  EXACT_QUOTE_WINDOW_MS,
  attributeInbound,
} from './attribution'
import {
  AttributionMethod,
  AttributionState,
  CommunicationDirection,
  CommunicationEntryKind,
} from './communication.enums'
import { CommunicationAuditEvent } from './schemas/communication-audit-event.schema'
import { CommunicationReplyPreview } from './schemas/communication-reply-preview.schema'
import { ConversationEntry } from './schemas/conversation-entry.schema'
import { ConversationReadState } from './schemas/conversation-read-state.schema'
import { ConversationWorkState } from './schemas/conversation-work-state.schema'
import { Conversation } from './schemas/conversation.schema'

type Actor = { _id?: Types.ObjectId | string; id?: string }
type Access = {
  userId: Types.ObjectId
  membership: OperatorMembership
  admin: boolean
  ownerGroupIds: Set<string>
  senderGroupIds: Set<string>
}

const UNAVAILABLE = { error: 'Conversation not found or access denied' }
const PREVIEW_TTL_MS = 10 * 60 * 1000

@Injectable()
export class CommunicationsService {
  constructor(
    @InjectModel(Conversation.name)
    private readonly conversations: Model<Conversation>,
    @InjectModel(ConversationEntry.name)
    private readonly entries: Model<ConversationEntry>,
    @InjectModel(ConversationReadState.name)
    private readonly reads: Model<ConversationReadState>,
    @InjectModel(ConversationWorkState.name)
    private readonly work: Model<ConversationWorkState>,
    @InjectModel(CommunicationAuditEvent.name)
    private readonly audits: Model<CommunicationAuditEvent>,
    @InjectModel(CommunicationReplyPreview.name)
    private readonly replyPreviews: Model<CommunicationReplyPreview>,
    @InjectModel(Contact.name) private readonly contacts: Model<Contact>,
    @InjectModel(Group.name) private readonly groups: Model<Group>,
    @InjectModel(RosterMembership.name)
    private readonly roster: Model<RosterMembership>,
    @InjectModel(GroupOwnerAssignment.name)
    private readonly owners: Model<GroupOwnerAssignment>,
    @InjectModel(GroupSenderAssignment.name)
    private readonly senders: Model<GroupSenderAssignment>,
    @InjectModel(OperatorMembership.name)
    private readonly operators: Model<OperatorMembership>,
    @InjectModel(User.name) private readonly users: Model<User>,
    @InjectModel(Device.name) private readonly devices: Model<Device>,
    @InjectModel(SMS.name) private readonly sms: Model<SMS>,
    @InjectModel(GroupMessageSend.name)
    private readonly groupSends: Model<GroupMessageSend>,
    @InjectModel(GroupMessageDelivery.name)
    private readonly deliveries: Model<GroupMessageDelivery>,
    @InjectModel(GroupAuditEvent.name)
    private readonly groupAudits: Model<GroupAuditEvent>,
    private readonly policy: OrganizationPolicyService,
    private readonly consent: ConsentService,
    private readonly gateway: GatewayService,
    private readonly safety: SelfHostedPolicyService,
  ) {}

  async classifyInboundSms(smsId: string) {
    if (!Types.ObjectId.isValid(smsId)) return null
    const sms = await this.sms.findOne({
      _id: new Types.ObjectId(smsId),
      type: SMSType.RECEIVED,
    })
    if (!sms?.organizationId || !sms.sender) return null
    const existing = await this.entries.findOne({
      organizationId: sms.organizationId,
      smsId: sms._id,
    })
    if (existing) return existing

    let canonicalNumber: string
    try {
      canonicalNumber = this.consent.normalizePhone(sms.sender)
    } catch {
      return null
    }
    const contact = await this.contacts.findOne({
      organizationId: sms.organizationId,
      mobileNumber: canonicalNumber,
    })
    const receivedAt = sms.receivedAt || (sms as any).createdAt || new Date()
    const receivingNumber = String(sms.metadata?.receivingNumber || '')
    const conversation = await this.upsertConversation(
      sms.organizationId,
      canonicalNumber,
      contact,
      receivedAt,
    )
    const memberships = contact
      ? await this.roster.find({
          organizationId: sms.organizationId,
          contactId: contact._id,
          status: RosterMembershipStatus.ACTIVE,
        })
      : []
    const groups = memberships.length
      ? await this.groups.find({
          _id: { $in: memberships.map((item) => item.groupId) },
          organizationId: sms.organizationId,
          status: GroupStatus.ACTIVE,
          ...(receivingNumber ? { receivingNumber } : {}),
        })
      : []
    const candidateGroupIds = groups.map((group) => String(group._id))
    const cutoff = new Date(receivedAt.getTime() - EXACT_QUOTE_WINDOW_MS)
    const deliveries = contact
      ? await this.deliveries.find({
          contactId: contact._id,
          status: { $ne: 'EXCLUDED' },
          createdAt: { $gte: cutoff, $lte: receivedAt },
        })
      : []
    const sends = deliveries.length
      ? await this.groupSends.find({
          _id: { $in: deliveries.map((item) => item.groupSendId) },
          organizationId: sms.organizationId,
          groupId: { $in: groups.map((group) => group._id) },
          status: { $in: ['QUEUED', 'ACCEPTED', 'SENT', 'DELIVERED'] },
        })
      : []
    const sendsById = new Map(sends.map((send) => [String(send._id), send]))
    const result = contact
      ? attributeInbound({
          body: sms.message,
          receivedAt,
          candidateGroupIds,
          deliveries: deliveries.flatMap((delivery) => {
            const send = sendsById.get(String(delivery.groupSendId))
            return send
              ? [
                  {
                    groupId: String(send.groupId),
                    deliveryId: String(delivery._id),
                    transmittedBody: send.message,
                    sentAt:
                      send.createdAt ||
                      (delivery as any).createdAt ||
                      receivedAt,
                  },
                ]
              : []
          }),
          transportReplyDeliveryId:
            typeof sms.metadata?.replyToDeliveryId === 'string'
              ? sms.metadata.replyToDeliveryId
              : undefined,
        })
      : {
          state: AttributionState.UNASSIGNED,
          method: AttributionMethod.NO_EVIDENCE,
          candidateGroupIds: [],
          reason: 'Sender is not a known organization contact',
        }
    const matchedDelivery = result.matchedDeliveryId
      ? deliveries.find((item) => String(item._id) === result.matchedDeliveryId)
      : undefined
    const reactionTo = matchedDelivery?.smsId
      ? await this.entries.findOne({
          organizationId: sms.organizationId,
          smsId: matchedDelivery.smsId,
        })
      : null
    const group = result.groupId
      ? groups.find((item) => String(item._id) === result.groupId)
      : undefined
    try {
      const entry = await this.entries.create({
        organizationId: sms.organizationId,
        conversationId: conversation._id,
        smsId: sms._id,
        groupId: group?._id,
        groupName: group?.displayName,
        direction: CommunicationDirection.INBOUND,
        kind:
          result.reaction && reactionTo
            ? CommunicationEntryKind.REACTION
            : CommunicationEntryKind.MESSAGE,
        attributionState: result.state,
        attributionMethod: result.method,
        candidateGroupIds: result.candidateGroupIds.map(
          (id) => new Types.ObjectId(id),
        ),
        matchedDeliveryId: result.matchedDeliveryId
          ? new Types.ObjectId(result.matchedDeliveryId)
          : undefined,
        reactionToEntryId: reactionTo?._id,
        reactionName:
          result.reaction && reactionTo ? result.reaction.name : undefined,
        attributionReason: result.reason,
        algorithmVersion: ATTRIBUTION_ALGORITHM_VERSION,
        eventAt: receivedAt,
        version: 1,
      })
      if (group?._id)
        await this.ensureWorkState(
          sms.organizationId,
          conversation._id,
          group._id,
        )
      return entry
    } catch (error: any) {
      if (error?.code === 11000)
        return this.entries.findOne({
          organizationId: sms.organizationId,
          smsId: sms._id,
        })
      throw error
    }
  }

  async linkGroupSend(sendId: string) {
    if (!Types.ObjectId.isValid(sendId)) return []
    const send = await this.groupSends.findById(sendId)
    if (!send?.smsBatchId) return []
    const [group, deliveries, smsRecords] = await Promise.all([
      this.groups.findOne({
        _id: send.groupId,
        organizationId: send.organizationId,
      }),
      this.deliveries.find({
        groupSendId: send._id,
        status: { $ne: 'EXCLUDED' },
      }),
      this.sms.find({
        organizationId: send.organizationId,
        smsBatch: send.smsBatchId,
        type: SMSType.SENT,
      }),
    ])
    if (!group) return []
    const smsByNumber = new Map(
      smsRecords.map((item) => [item.recipient, item]),
    )
    const linked: ConversationEntry[] = []
    for (const delivery of deliveries) {
      const record = smsByNumber.get(delivery.mobileNumber)
      if (!record) continue
      if (!delivery.smsId)
        await this.deliveries.updateOne(
          { _id: delivery._id, smsId: { $exists: false } },
          { $set: { smsId: record._id } },
        )
      const contact = await this.contacts.findOne({
        _id: delivery.contactId,
        organizationId: send.organizationId,
      })
      if (!contact) continue
      const eventAt = record.requestedAt || send.createdAt || new Date()
      const conversation = await this.upsertConversation(
        send.organizationId,
        delivery.mobileNumber,
        contact,
        eventAt,
      )
      try {
        const entry = await this.entries.create({
          organizationId: send.organizationId,
          conversationId: conversation._id,
          smsId: record._id,
          groupSendId: send._id,
          groupDeliveryId: delivery._id,
          groupId: send.groupId,
          groupName: send.groupName,
          actorUserId: send.actorUserId,
          direction: CommunicationDirection.OUTBOUND,
          kind: CommunicationEntryKind.MESSAGE,
          attributionState: AttributionState.CONFIRMED,
          attributionMethod: AttributionMethod.TRANSPORT_REPLY,
          candidateGroupIds: [send.groupId],
          matchedDeliveryId: delivery._id,
          attributionReason: 'Persisted group delivery link',
          algorithmVersion: ATTRIBUTION_ALGORITHM_VERSION,
          eventAt,
          version: 1,
        })
        linked.push(entry)
        await this.ensureWorkState(
          send.organizationId,
          conversation._id,
          send.groupId,
        )
      } catch (error: any) {
        if (error?.code !== 11000) throw error
      }
    }
    return linked
  }

  async list(
    organizationId: string,
    actor: Actor,
    query: Record<string, unknown> = {},
  ) {
    const access = await this.access(organizationId, actor)
    const requestedGroupId = this.optionalObjectId(query.groupId)
    const view = ['unread', 'recent', 'all', 'groups'].includes(
      String(query.view || '').toLowerCase(),
    )
      ? String(query.view).toLowerCase()
      : 'unread'
    if (!access.admin && !requestedGroupId)
      throw new NotFoundException(UNAVAILABLE)
    if (requestedGroupId)
      this.requireGroupAccess(access, String(requestedGroupId))
    const limit = Math.min(Math.max(Number(query.limit) || 25, 1), 50)
    const conversationFilter: Record<string, unknown> = {
      organizationId: this.objectId(organizationId),
    }
    if (typeof query.cursor === 'string' && query.cursor) {
      const [timestamp, id] = query.cursor.split('|')
      if (!timestamp || !Types.ObjectId.isValid(id))
        throw new BadRequestException({
          error: 'Invalid communications cursor',
        })
      conversationFilter.$or = [
        { lastActivityAt: { $lt: new Date(timestamp) } },
        {
          lastActivityAt: new Date(timestamp),
          _id: { $lt: new Types.ObjectId(id) },
        },
      ]
    }
    if (typeof query.search === 'string' && query.search.trim()) {
      const term = query.search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      conversationFilter.displayName = { $regex: term, $options: 'i' }
    }
    const candidates = await this.conversations
      .find(conversationFilter)
      .sort({ lastActivityAt: -1, _id: -1 })
      .limit(limit * 3)
    const items: any[] = []
    for (const conversation of candidates) {
      const visible = await this.visibleEntries(
        access,
        conversation._id,
        requestedGroupId,
      )
      if (!visible.length) continue
      const inboundIds = visible
        .filter((entry) => entry.direction === CommunicationDirection.INBOUND)
        .map((entry) => entry._id)
      const read = inboundIds.length
        ? await this.reads.find({
            organizationId: conversation.organizationId,
            userId: access.userId,
            entryId: { $in: inboundIds },
            read: true,
          })
        : []
      const readIds = new Set(read.map((item) => String(item.entryId)))
      const unreadCount = inboundIds.filter(
        (id) => !readIds.has(String(id)),
      ).length
      if (view === 'unread' && unreadCount === 0) continue
      const last = visible[visible.length - 1]
      const groupIds = [
        ...new Set(
          visible.flatMap((entry) =>
            entry.groupId ? [String(entry.groupId)] : [],
          ),
        ),
      ]
      const work = requestedGroupId
        ? await this.work.findOne({
            organizationId: conversation.organizationId,
            conversationId: conversation._id,
            groupId: requestedGroupId,
          })
        : null
      if (query.resolution === 'open' && work?.resolved) continue
      if (query.resolution === 'resolved' && !work?.resolved) continue
      if (
        query.assignee &&
        String(work?.assigneeMembershipId || '') !== String(query.assignee)
      )
        continue
      items.push({
        id: String(conversation._id),
        contact: {
          displayName: conversation.displayName,
          number:
            access.admin || !this.senderOnly(access, requestedGroupId)
              ? conversation.canonicalNumber
              : this.mask(conversation.canonicalNumber),
        },
        lastActivityAt: conversation.lastActivityAt,
        lastEntry: await this.entryView(last, access),
        unreadCount,
        groupIds,
        workState: work ? this.workView(work) : undefined,
      })
      if (items.length >= limit) break
    }
    const last = items[items.length - 1]
    return {
      view,
      items,
      nextCursor:
        items.length === limit && last
          ? `${new Date(last.lastActivityAt).toISOString()}|${last.id}`
          : null,
      counts: {
        unread: items.reduce((sum, item) => sum + item.unreadCount, 0),
      },
    }
  }

  async read(
    organizationId: string,
    conversationId: string,
    actor: Actor,
    groupId?: string,
  ) {
    const access = await this.access(organizationId, actor)
    const conversation = await this.conversations.findOne({
      _id: this.objectId(conversationId),
      organizationId: this.objectId(organizationId),
    })
    if (!conversation) throw new NotFoundException(UNAVAILABLE)
    const groupObjectId = groupId ? this.objectId(groupId) : undefined
    if (!access.admin && !groupObjectId)
      throw new NotFoundException(UNAVAILABLE)
    if (groupObjectId) this.requireGroupAccess(access, String(groupObjectId))
    const entries = await this.visibleEntries(
      access,
      conversation._id,
      groupObjectId,
    )
    if (!entries.length) throw new NotFoundException(UNAVAILABLE)
    const inbound = entries.filter(
      (entry) => entry.direction === CommunicationDirection.INBOUND,
    )
    if (inbound.length)
      await this.reads.bulkWrite(
        inbound.map((entry) => ({
          updateOne: {
            filter: {
              organizationId: conversation.organizationId,
              entryId: entry._id,
              userId: access.userId,
            },
            update: {
              $set: { read: true, changedAt: new Date() },
              $setOnInsert: {
                organizationId: conversation.organizationId,
                entryId: entry._id,
                userId: access.userId,
              },
            },
            upsert: true,
          },
        })),
      )
    const work = groupObjectId
      ? await this.work.findOne({
          organizationId: conversation.organizationId,
          conversationId: conversation._id,
          groupId: groupObjectId,
        })
      : null
    return {
      id: String(conversation._id),
      contact: {
        displayName: conversation.displayName,
        number:
          access.admin || !this.senderOnly(access, groupObjectId)
            ? conversation.canonicalNumber
            : this.mask(conversation.canonicalNumber),
      },
      entries: await Promise.all(
        entries.map((entry) => this.entryView(entry, access)),
      ),
      workState: work ? this.workView(work) : undefined,
    }
  }

  async markRead(
    organizationId: string,
    conversationId: string,
    actor: Actor,
    input: any,
  ) {
    const groupId =
      typeof input?.groupId === 'string' ? input.groupId : undefined
    const thread = await this.read(
      organizationId,
      conversationId,
      actor,
      groupId,
    )
    const access = await this.access(organizationId, actor)
    const read = input?.read !== false
    const ids = thread.entries
      .filter(
        (entry: any) => entry.direction === CommunicationDirection.INBOUND,
      )
      .map((entry: any) => new Types.ObjectId(entry.id))
    if (ids.length)
      await this.reads.updateMany(
        {
          organizationId: this.objectId(organizationId),
          userId: access.userId,
          entryId: { $in: ids },
        },
        { $set: { read, changedAt: new Date() } },
      )
    return { read, entryCount: ids.length }
  }

  async assignAttribution(
    organizationId: string,
    entryId: string,
    actor: Actor,
    input: any,
  ) {
    const access = await this.access(organizationId, actor)
    const groupId = this.objectId(input?.groupId)
    const reason = this.reason(input?.reason)
    const entry = await this.entries.findOne({
      _id: this.objectId(entryId),
      organizationId: this.objectId(organizationId),
      direction: CommunicationDirection.INBOUND,
    })
    if (
      !entry ||
      !entry.candidateGroupIds.some((id) => String(id) === String(groupId))
    )
      throw new NotFoundException(UNAVAILABLE)
    if (!access.admin && !access.ownerGroupIds.has(String(groupId)))
      throw new NotFoundException(UNAVAILABLE)
    if (
      !access.admin &&
      entry.attributionState !== AttributionState.AMBIGUOUS &&
      !access.ownerGroupIds.has(String(entry.groupId || ''))
    )
      throw new NotFoundException(UNAVAILABLE)
    const group = await this.groups.findOne({
      _id: groupId,
      organizationId: this.objectId(organizationId),
      status: GroupStatus.ACTIVE,
    })
    if (!group)
      throw new ConflictException({
        error: 'The candidate group is no longer active',
        code: 'ATTRIBUTION_GROUP_INACTIVE',
      })
    const prior = {
      state: entry.attributionState,
      method: entry.attributionMethod,
      groupId: entry.groupId ? String(entry.groupId) : null,
      reason: entry.attributionReason,
    }
    entry.groupId = group._id
    entry.groupName = group.displayName
    entry.attributionState = AttributionState.CONFIRMED
    entry.attributionMethod = AttributionMethod.MANUAL
    entry.attributionReason = 'Confirmed — manually assigned'
    entry.version += 1
    await entry.save()
    await this.ensureWorkState(
      entry.organizationId,
      entry.conversationId,
      group._id,
    )
    await this.audits.create({
      organizationId: entry.organizationId,
      actorUserId: access.userId,
      action: 'ATTRIBUTION_ASSIGNED',
      targetId: String(entry._id),
      details: {
        prior,
        selectedGroupId: String(group._id),
        reason,
        originalAlgorithmVersion: entry.algorithmVersion,
      },
    })
    return this.entryView(entry, access)
  }

  async updateWorkState(
    organizationId: string,
    conversationId: string,
    groupId: string,
    actor: Actor,
    input: any,
  ) {
    const access = await this.access(organizationId, actor)
    const groupObjectId = this.objectId(groupId)
    this.requireGroupAccess(access, groupId)
    const conversation = await this.conversations.findOne({
      _id: this.objectId(conversationId),
      organizationId: this.objectId(organizationId),
    })
    if (
      !conversation ||
      !(await this.visibleEntries(access, conversation._id, groupObjectId))
        .length
    )
      throw new NotFoundException(UNAVAILABLE)
    const state = await this.ensureWorkState(
      conversation.organizationId,
      conversation._id,
      groupObjectId,
    )
    const expectedVersion = Number(input?.version)
    if (!Number.isInteger(expectedVersion) || expectedVersion !== state.version)
      throw new ConflictException({
        error:
          'This conversation changed. Review the current assignment and resolution state.',
        code: 'COMMUNICATION_STATE_STALE',
        currentState: this.workView(state),
      })
    const action = String(input?.action || '')
    if (action === 'assign-self')
      state.assigneeMembershipId = access.membership._id
    else if (action === 'assign') {
      if (this.senderOnly(access, groupObjectId))
        throw new NotFoundException(UNAVAILABLE)
      const assigneeId = this.objectId(input?.assigneeMembershipId)
      if (
        !(await this.operatorCanAccessGroup(
          conversation.organizationId,
          groupObjectId,
          assigneeId,
        ))
      )
        throw new ConflictException({
          error: 'The selected operator no longer has access to this group',
          code: 'ASSIGNEE_NOT_AUTHORIZED',
        })
      state.assigneeMembershipId = assigneeId
    } else if (action === 'unassign') {
      if (
        this.senderOnly(access, groupObjectId) &&
        String(state.assigneeMembershipId || '') !==
          String(access.membership._id)
      )
        throw new NotFoundException(UNAVAILABLE)
      state.assigneeMembershipId = undefined
    } else if (action === 'resolve') {
      state.resolved = true
      state.resolvedBy = access.userId
      state.resolvedAt = new Date()
    } else if (action === 'reopen') {
      state.resolved = false
      state.resolvedBy = undefined
      state.resolvedAt = undefined
    } else
      throw new BadRequestException({
        error: 'Choose a supported work-state action',
      })
    state.version += 1
    await state.save()
    await this.audits.create({
      organizationId: conversation.organizationId,
      actorUserId: access.userId,
      action: `WORK_${action.toUpperCase().replace('-', '_')}`,
      targetId: `${conversationId}:${groupId}`,
      details: {
        version: state.version,
        assigneeMembershipId: state.assigneeMembershipId
          ? String(state.assigneeMembershipId)
          : null,
        resolved: state.resolved,
      },
    })
    return this.workView(state)
  }

  async previewReply(
    organizationId: string,
    conversationId: string,
    actor: Actor,
    input: any,
  ) {
    const access = await this.access(organizationId, actor)
    const groupId = this.objectId(input?.groupId)
    this.requireGroupAccess(access, String(groupId))
    const conversation = await this.conversations.findOne({
      _id: this.objectId(conversationId),
      organizationId: this.objectId(organizationId),
    })
    const parent = await this.entries.findOne({
      _id: this.objectId(input?.parentEntryId),
      organizationId: this.objectId(organizationId),
      conversationId: conversation?._id,
      direction: CommunicationDirection.INBOUND,
    })
    if (
      !conversation?.contactId ||
      !parent ||
      !(await this.canReplyToEntry(access, parent, groupId))
    )
      throw new NotFoundException(UNAVAILABLE)
    const body = this.messageBody(input?.body)
    const [group, contact, membership, device] = await Promise.all([
      this.groups.findOne({
        _id: groupId,
        organizationId: conversation.organizationId,
        status: GroupStatus.ACTIVE,
      }),
      this.contacts.findOne({
        _id: conversation.contactId,
        organizationId: conversation.organizationId,
      }),
      this.roster.findOne({
        organizationId: conversation.organizationId,
        groupId,
        contactId: conversation.contactId,
        status: RosterMembershipStatus.ACTIVE,
      }),
      this.soleDevice(conversation.organizationId),
    ])
    if (!group || !contact || !membership)
      throw new ConflictException({
        error: 'The contact is no longer an active member of this group',
        code: 'MESSAGING_ELIGIBILITY_CHANGED',
      })
    const message = `${group.joinCode}: ${body}`
    const [decision] = await this.consent.authorizeRecipients(
      String(device.user),
      [contact.mobileNumber],
      { kind: 'ORDINARY', organizationId, groupId: String(groupId) },
    )
    if (!decision?.eligible)
      throw new ConflictException({
        error: this.eligibilityMessage(decision?.reason),
        code: decision?.reason || 'MESSAGING_ELIGIBILITY_CHANGED',
      })
    const segments = smsSegmentCount(message)
    const capacity = await this.safety.previewAvailability(device._id)
    if (
      !Object.values(capacity).every(
        (remaining) => remaining === -1 || remaining >= segments,
      )
    )
      throw new ConflictException({
        error:
          'Local SMS capacity cannot accept this reply yet. Try again after the active safety window resets.',
        code: 'GROUP_CAPACITY_UNAVAILABLE',
      })
    const preview = await this.replyPreviews.create({
      organizationId: conversation.organizationId,
      conversationId: conversation._id,
      parentEntryId: parent._id,
      groupId: group._id,
      contactId: contact._id,
      actorUserId: access.userId,
      deviceId: device._id,
      canonicalNumber: contact.mobileNumber,
      displayName: contact.displayName,
      groupName: group.displayName,
      joinCode: group.joinCode,
      body,
      message,
      segments,
      expiresAt: new Date(Date.now() + PREVIEW_TTL_MS),
    })
    return {
      id: String(preview._id),
      parentEntryId: String(parent._id),
      group: { id: String(group._id), displayName: group.displayName },
      recipient: {
        displayName: contact.displayName,
        number: this.senderOnly(access, groupId)
          ? this.mask(contact.mobileNumber)
          : contact.mobileNumber,
      },
      message,
      encoding: this.encoding(message),
      segments,
      route: { deviceId: String(device._id), simSubscriptionId: null },
      eligibility: { eligible: true },
      remainingCapacity: capacity,
      expiresAt: preview.expiresAt,
    }
  }

  async confirmReply(
    organizationId: string,
    conversationId: string,
    previewId: string,
    actor: Actor,
    requestIdValue?: string,
  ) {
    const requestId = String(requestIdValue || '').trim()
    if (!requestId || requestId.length > 200)
      throw new BadRequestException({
        error: 'A stable X-Request-Id is required',
      })
    const access = await this.access(organizationId, actor)
    const preview = await this.replyPreviews.findOne({
      _id: this.objectId(previewId),
      organizationId: this.objectId(organizationId),
      conversationId: this.objectId(conversationId),
      actorUserId: access.userId,
      expiresAt: { $gt: new Date() },
    })
    if (!preview)
      throw new ConflictException({
        error:
          'This reply preview expired or eligibility changed. Create a new preview.',
        code: 'REPLY_PREVIEW_INVALID',
      })
    this.requireGroupAccess(access, String(preview.groupId))
    const prior = await this.groupSends.findOne({
      organizationId: preview.organizationId,
      groupId: preview.groupId,
      requestId,
    })
    if (prior) return this.replySendView(prior)
    const [group, contact, membership, parent, device] = await Promise.all([
      this.groups.findOne({
        _id: preview.groupId,
        organizationId: preview.organizationId,
        status: GroupStatus.ACTIVE,
        joinCode: preview.joinCode,
      }),
      this.contacts.findOne({
        _id: preview.contactId,
        organizationId: preview.organizationId,
        mobileNumber: preview.canonicalNumber,
      }),
      this.roster.findOne({
        organizationId: preview.organizationId,
        groupId: preview.groupId,
        contactId: preview.contactId,
        status: RosterMembershipStatus.ACTIVE,
      }),
      this.entries.findOne({
        _id: preview.parentEntryId,
        organizationId: preview.organizationId,
        conversationId: preview.conversationId,
      }),
      this.soleDevice(preview.organizationId),
    ])
    if (
      !group ||
      !contact ||
      !membership ||
      !parent ||
      String(device._id) !== String(preview.deviceId) ||
      !(await this.canReplyToEntry(access, parent, preview.groupId))
    )
      throw new ConflictException({
        error:
          'Authorization, attribution, membership, route, or group settings changed. Create a new reply preview.',
        code: 'MESSAGING_ELIGIBILITY_CHANGED',
      })
    const [decision] = await this.consent.authorizeRecipients(
      String(device.user),
      [contact.mobileNumber],
      { kind: 'ORDINARY', organizationId, groupId: String(group._id) },
    )
    if (!decision?.eligible)
      throw new ConflictException({
        error: this.eligibilityMessage(decision?.reason),
        code: decision?.reason || 'MESSAGING_ELIGIBILITY_CHANGED',
      })
    let send: any
    try {
      send = await this.groupSends.create({
        organizationId: preview.organizationId,
        groupId: preview.groupId,
        actorUserId: access.userId,
        deviceId: preview.deviceId,
        previewId: preview._id,
        requestId,
        groupName: preview.groupName,
        joinCode: preview.joinCode,
        body: preview.body,
        message: preview.message,
        status: 'PROCESSING',
        candidateCount: 1,
        acceptedCount: 1,
        excludedCount: 0,
        parentInboundEntryId: preview.parentEntryId,
      })
    } catch (error: any) {
      if (error?.code === 11000) {
        const existing = await this.groupSends.findOne({
          organizationId: preview.organizationId,
          groupId: preview.groupId,
          requestId,
        })
        if (existing) return this.replySendView(existing)
      }
      throw error
    }
    const delivery = await this.deliveries.create({
      groupSendId: send._id,
      contactId: contact._id,
      displayName: contact.displayName,
      mobileNumber: contact.mobileNumber,
      status: 'ACCEPTED',
    })
    try {
      const result = await this.gateway.sendSMS(
        String(device._id),
        {
          message: preview.message,
          recipients: [contact.mobileNumber],
          smsBody: preview.message,
          receivers: [contact.mobileNumber],
        },
        { kind: 'ORDINARY', organizationId, groupId: String(group._id) },
        true,
      )
      send.status = result?.queued ? 'QUEUED' : 'ACCEPTED'
      send.smsBatchId = result?.smsBatchId
      await send.save()
      if (send.smsBatchId) {
        const record = await this.sms.findOne({
          organizationId: preview.organizationId,
          smsBatch: send.smsBatchId,
          recipient: contact.mobileNumber,
        })
        if (record)
          await this.deliveries.updateOne(
            { _id: delivery._id },
            { $set: { smsId: record._id } },
          )
      }
      await this.linkGroupSend(String(send._id))
      await this.groupAudits.create({
        organizationId: preview.organizationId,
        actorUserId: access.userId,
        action: 'GROUP_REPLY_CONFIRMED',
        targetType: 'GROUP_MESSAGE_SEND',
        targetId: String(send._id),
        newState: JSON.stringify({
          status: send.status,
          parentInboundEntryId: String(preview.parentEntryId),
        }),
        correlationId: requestId,
      })
      return this.replySendView(send)
    } catch (error) {
      send.status = 'FAILED'
      await send.save()
      await this.deliveries.updateOne(
        { _id: delivery._id },
        { $set: { status: 'FAILED' } },
      )
      throw error
    }
  }

  private async upsertConversation(
    organizationId: Types.ObjectId,
    canonicalNumber: string,
    contact: Contact | null,
    eventAt: Date,
  ) {
    await this.conversations.updateOne(
      { organizationId, canonicalNumber },
      {
        $set: {
          lastActivityAt: eventAt,
          displayName: contact?.displayName || 'Unknown sender',
        },
        $setOnInsert: {
          organizationId,
          canonicalNumber,
          contactId: contact?._id,
        },
      },
      { upsert: true },
    )
    const conversation = await this.conversations.findOne({
      organizationId,
      canonicalNumber,
    })
    if (!conversation)
      throw new ServiceUnavailableException({
        error: 'Conversation could not be persisted',
      })
    return conversation
  }

  private async access(organizationId: string, actor: Actor): Promise<Access> {
    const organizationObjectId = this.objectId(organizationId)
    const userId = this.actorId(actor)
    const membership = await this.operators.findOne({
      organizationId: organizationObjectId,
      userId,
      status: MembershipStatus.ACTIVE,
    })
    if (!membership) throw new NotFoundException(UNAVAILABLE)
    const admin = Boolean(
      await this.policy.activeAdminMembership(organizationId, String(userId)),
    )
    const [owners, senders] = admin
      ? [[], []]
      : await Promise.all([
          this.owners.find({
            organizationId: organizationObjectId,
            membershipId: membership._id,
            status: GroupOwnerStatus.ACTIVE,
          }),
          this.senders.find({
            organizationId: organizationObjectId,
            membershipId: membership._id,
            status: GroupSenderStatus.ACTIVE,
          }),
        ])
    return {
      userId,
      membership,
      admin,
      ownerGroupIds: new Set(owners.map((item) => String(item.groupId))),
      senderGroupIds: new Set(senders.map((item) => String(item.groupId))),
    }
  }

  private async visibleEntries(
    access: Access,
    conversationId: Types.ObjectId,
    requestedGroupId?: Types.ObjectId,
  ) {
    const filter: Record<string, unknown> = {
      organizationId: access.membership.organizationId,
      conversationId,
    }
    if (requestedGroupId) {
      const groupId = String(requestedGroupId)
      if (access.admin)
        filter.$or = [
          { groupId: requestedGroupId },
          {
            attributionState: AttributionState.AMBIGUOUS,
            candidateGroupIds: requestedGroupId,
          },
        ]
      else if (access.ownerGroupIds.has(groupId))
        filter.$or = [
          { groupId: requestedGroupId },
          {
            attributionState: AttributionState.AMBIGUOUS,
            candidateGroupIds: requestedGroupId,
          },
        ]
      else filter.groupId = requestedGroupId
    } else if (!access.admin) return []
    return this.entries.find(filter).sort({ eventAt: 1, _id: 1 })
  }

  private async entryView(entry: ConversationEntry, access: Access) {
    const sms = await this.sms.findOne({
      _id: entry.smsId,
      organizationId: entry.organizationId,
    })
    const actor = entry.actorUserId
      ? await this.users.findById(entry.actorUserId)
      : null
    return {
      id: String(entry._id),
      direction: entry.direction,
      kind: entry.kind,
      message: sms?.message || '',
      status: sms?.status,
      eventAt: entry.eventAt,
      group: entry.groupId
        ? { id: String(entry.groupId), displayName: entry.groupName || 'Group' }
        : null,
      author:
        actor?.name ||
        (entry.direction === CommunicationDirection.INBOUND
          ? 'Contact'
          : 'Approved operator'),
      attribution: {
        state: entry.attributionState,
        method: entry.attributionMethod,
        reason: entry.attributionReason,
        candidateGroupIds:
          access.admin || access.ownerGroupIds.size
            ? entry.candidateGroupIds.map(String)
            : [],
        manuallyAssigned: entry.attributionMethod === AttributionMethod.MANUAL,
      },
      reaction: entry.reactionToEntryId
        ? {
            name: entry.reactionName,
            targetEntryId: String(entry.reactionToEntryId),
          }
        : null,
      version: entry.version,
    }
  }

  private async canReplyToEntry(
    access: Access,
    entry: ConversationEntry,
    groupId: Types.ObjectId,
  ) {
    const id = String(groupId)
    if (entry.attributionState === AttributionState.AMBIGUOUS) return false
    return (
      String(entry.groupId || '') === id &&
      (access.admin ||
        access.ownerGroupIds.has(id) ||
        access.senderGroupIds.has(id))
    )
  }

  private requireGroupAccess(access: Access, groupId: string) {
    if (
      !access.admin &&
      !access.ownerGroupIds.has(groupId) &&
      !access.senderGroupIds.has(groupId)
    )
      throw new NotFoundException(UNAVAILABLE)
  }

  private senderOnly(access: Access, groupId?: Types.ObjectId | string) {
    const id = String(groupId || '')
    return (
      !access.admin &&
      !access.ownerGroupIds.has(id) &&
      access.senderGroupIds.has(id)
    )
  }

  private async ensureWorkState(
    organizationId: Types.ObjectId,
    conversationId: Types.ObjectId,
    groupId: Types.ObjectId,
  ) {
    await this.work.updateOne(
      { organizationId, conversationId, groupId },
      {
        $setOnInsert: {
          organizationId,
          conversationId,
          groupId,
          resolved: false,
          version: 1,
        },
      },
      { upsert: true },
    )
    const state = await this.work.findOne({
      organizationId,
      conversationId,
      groupId,
    })
    if (!state)
      throw new ServiceUnavailableException({
        error: 'Conversation work state could not be persisted',
      })
    return state
  }

  private async operatorCanAccessGroup(
    organizationId: Types.ObjectId,
    groupId: Types.ObjectId,
    membershipId: Types.ObjectId,
  ) {
    const membership = await this.operators.findOne({
      _id: membershipId,
      organizationId,
      status: MembershipStatus.ACTIVE,
    })
    if (!membership) return false
    if (
      await this.policy.activeAdminMembership(
        String(organizationId),
        String(membership.userId),
      )
    )
      return true
    return Boolean(
      (await this.owners.findOne({
        organizationId,
        groupId,
        membershipId,
        status: GroupOwnerStatus.ACTIVE,
      })) ||
      (await this.senders.findOne({
        organizationId,
        groupId,
        membershipId,
        status: GroupSenderStatus.ACTIVE,
      })),
    )
  }

  private async soleDevice(organizationId: Types.ObjectId) {
    const devices = await this.devices
      .find({ organizationId, enabled: true })
      .limit(2)
    if (devices.length !== 1)
      throw new ServiceUnavailableException({
        error: devices.length
          ? 'Replying requires exactly one enabled gateway'
          : 'Replying requires an enabled gateway',
        code: 'GROUP_GATEWAY_UNAVAILABLE',
      })
    return devices[0]
  }

  private workView(state: ConversationWorkState) {
    return {
      assigneeMembershipId: state.assigneeMembershipId
        ? String(state.assigneeMembershipId)
        : null,
      resolved: state.resolved,
      resolvedBy: state.resolvedBy ? String(state.resolvedBy) : null,
      resolvedAt: state.resolvedAt || null,
      version: state.version,
    }
  }

  private replySendView(send: GroupMessageSend) {
    return {
      id: String(send._id),
      status: send.status,
      groupId: String(send.groupId),
      message: send.message,
      createdAt: send.createdAt,
    }
  }

  private actorId(actor: Actor) {
    return this.objectId(actor?._id ?? actor?.id)
  }

  private objectId(value: unknown) {
    if (!Types.ObjectId.isValid(String(value || '')))
      throw new NotFoundException(UNAVAILABLE)
    return new Types.ObjectId(String(value))
  }

  private optionalObjectId(value: unknown) {
    return value === undefined || value === null || value === ''
      ? undefined
      : this.objectId(value)
  }

  private reason(value: unknown) {
    if (typeof value !== 'string' || !value.trim() || value.trim().length > 500)
      throw new BadRequestException({
        error: 'A reason of 1 to 500 characters is required',
      })
    return value.trim()
  }

  private messageBody(value: unknown) {
    if (
      typeof value !== 'string' ||
      !value.trim() ||
      value.trim().length > 1000
    )
      throw new BadRequestException({
        error: 'Message body must contain 1 to 1,000 characters',
      })
    return value.trim()
  }

  private mask(value: string) {
    return `***${value.slice(-4)}`
  }

  private encoding(message: string) {
    return /^[\x00-\x7F\n\r]*$/.test(message) ? 'GSM-7' : 'Unicode'
  }

  private eligibilityMessage(reason?: string) {
    return (
      (
        {
          NO_ACTIVE_GROUP_CONSENT:
            'This contact does not have active consent for the selected group. Record consent or ask the contact to rejoin before replying.',
          ORGANIZATION_SUPPRESSION:
            'This number has opted out of organization messaging. A recipient START and new group JOIN are required before replying.',
          INVALID_NUMBER:
            'The contact does not have a structurally valid mobile number.',
        } as Record<string, string>
      )[reason || ''] ||
      'The contact is no longer eligible for this reply. Review membership, consent, route, and gateway readiness.'
    )
  }
}
