import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model, Types } from 'mongoose'
import { GroupStatus, RosterMembershipStatus } from '../groups/group.enums'
import { Contact } from '../groups/schemas/contact.schema'
import { Group } from '../groups/schemas/group.schema'
import { RosterMembership } from '../groups/schemas/roster-membership.schema'
import { MembershipStatus } from '../organizations/organization.enums'
import { OperatorMembership } from '../organizations/schemas/operator-membership.schema'
import { SMS } from '../gateway/schemas/sms.schema'
import {
  AcknowledgmentKind,
  ConsentSource,
  ConsentStatus,
  DispatchPolicyContext,
  SuppressionStatus,
} from './consent.enums'
import { CommandResponseWindow } from './schemas/command-response-window.schema'
import { ConsentAuditEvent } from './schemas/consent-audit-event.schema'
import { GroupConsent } from './schemas/group-consent.schema'
import { OrganizationSuppression } from './schemas/organization-suppression.schema'

type InboundCommandInput = {
  sender: string
  body: string
  inboundSmsId: Types.ObjectId | string
  receivedAt: Date
}

export type InboundCommandResult = {
  handled: boolean
  command?: string
  acknowledgment?: {
    body: string
    kind: AcknowledgmentKind
    organizationId: string
    groupId?: string
  }
}

export type RecipientPolicyResult = {
  recipient: string
  eligible: boolean
  reason?:
    | 'NO_ACTIVE_GROUP_CONSENT'
    | 'ORGANIZATION_SUPPRESSION'
    | 'INVALID_NUMBER'
  organizationId?: string
  groupId?: string
}

const OPT_OUT_COMMANDS = new Set([
  'STOP',
  'QUIT',
  'END',
  'REVOKE',
  'OPT OUT',
  'CANCEL',
  'UNSUBSCRIBE',
])

@Injectable()
export class ConsentService {
  constructor(
    @InjectModel(GroupConsent.name)
    private readonly consents: Model<GroupConsent>,
    @InjectModel(OrganizationSuppression.name)
    private readonly suppressions: Model<OrganizationSuppression>,
    @InjectModel(ConsentAuditEvent.name)
    private readonly audit: Model<ConsentAuditEvent>,
    @InjectModel(CommandResponseWindow.name)
    private readonly responseWindows: Model<CommandResponseWindow>,
    @InjectModel(Group.name) private readonly groups: Model<Group>,
    @InjectModel(Contact.name) private readonly contacts: Model<Contact>,
    @InjectModel(RosterMembership.name)
    private readonly memberships: Model<RosterMembership>,
    @InjectModel(OperatorMembership.name)
    private readonly operators: Model<OperatorMembership>,
    @InjectModel(SMS.name) private readonly sms: Model<SMS>,
  ) {}

  normalizePhone(value: unknown) {
    if (typeof value !== 'string' || /[a-z]|(?:ext|x)\s*\d/i.test(value))
      throw new BadRequestException('Invalid US phone number')
    const compact = value.trim().replace(/[().\s-]/g, '')
    const digits = compact.startsWith('+1')
      ? compact.slice(2)
      : compact.startsWith('1') && compact.length === 11
        ? compact.slice(1)
        : compact
    if (!/^\d{10}$/.test(digits) || !/^[2-9]\d{2}[2-9]\d{6}$/.test(digits))
      throw new BadRequestException('Invalid US phone number')
    return `+1${digits}`
  }

  normalizeCommand(body: unknown) {
    if (typeof body !== 'string') return ''
    return body.trim().replace(/\s+/g, ' ').toUpperCase()
  }

  async recordOperatorConsent(input: {
    organizationId: Types.ObjectId
    groupId: Types.ObjectId
    contactId: Types.ObjectId
    mobileNumber: string
    actorUserId: Types.ObjectId | string
    affirmed: unknown
    methodNote?: unknown
    sourceRow?: number
  }) {
    if (input.affirmed !== true)
      throw new BadRequestException({
        error:
          'Affirm that this person asked to receive messages or provided this number for church communications',
      })
    const methodNote = this.methodNote(input.methodNote)
    const activeSuppression = await this.suppressions.exists({
      organizationId: input.organizationId,
      mobileNumber: input.mobileNumber,
      status: SuppressionStatus.ACTIVE,
    })
    if (activeSuppression)
      throw new ConflictException({
        error:
          'Recipient suppression is active and cannot be cleared by an operator',
      })
    const now = new Date()
    const filter = {
      organizationId: input.organizationId,
      groupId: input.groupId,
      contactId: input.contactId,
    }
    const priorConsent = await this.consents.findOne(filter)
    try {
      await this.consents.updateOne(
        filter,
        {
          $set: {
            mobileNumber: input.mobileNumber,
            source: ConsentSource.OPERATOR_AFFIRMATION,
            status: ConsentStatus.ACTIVE,
            actorUserId: new Types.ObjectId(String(input.actorUserId)),
            methodNote,
            consentedAt: now,
            ...(input.sourceRow === undefined
              ? {}
              : { sourceRow: input.sourceRow }),
          },
          $unset: {
            receivingNumber: 1,
            inboundSmsId: 1,
            endedAt: 1,
            endedByCommand: 1,
            ...(input.sourceRow === undefined ? { sourceRow: 1 } : {}),
          },
        },
        { upsert: true },
      )
      await this.audit.create({
        organizationId: input.organizationId,
        action: 'OPERATOR_CONSENT_RECORDED',
        result: 'ACTIVE',
        redactedNumber: this.redact(input.mobileNumber),
        actorUserId: new Types.ObjectId(String(input.actorUserId)),
        contactId: input.contactId,
        groupId: input.groupId,
        sourceRow: input.sourceRow,
      })
    } catch (error) {
      if (priorConsent)
        await this.consents.replaceOne(
          { _id: priorConsent._id },
          priorConsent.toObject(),
        )
      else await this.consents.deleteOne(filter)
      throw error
    }
  }

  async isSuppressed(organizationId: Types.ObjectId, mobileNumber: string) {
    return Boolean(
      await this.suppressions.exists({
        organizationId,
        mobileNumber,
        status: SuppressionStatus.ACTIVE,
      }),
    )
  }

  async endGroupConsent(input: {
    organizationId: Types.ObjectId
    groupId: Types.ObjectId
    contactId: Types.ObjectId
    actorUserId: Types.ObjectId | string
    reason: string
  }) {
    await this.consents.updateOne(
      {
        organizationId: input.organizationId,
        groupId: input.groupId,
        contactId: input.contactId,
        status: ConsentStatus.ACTIVE,
      },
      {
        $set: {
          status: ConsentStatus.ENDED,
          endedAt: new Date(),
          endedByCommand: 'OPERATOR_MEMBERSHIP_REMOVAL',
        },
      },
    )
    await this.audit.create({
      organizationId: input.organizationId,
      action: 'GROUP_CONSENT_ENDED',
      result: input.reason,
      redactedNumber: '***',
      actorUserId: new Types.ObjectId(String(input.actorUserId)),
      contactId: input.contactId,
      groupId: input.groupId,
    })
  }

  async activeConsentViews(
    organizationId: Types.ObjectId,
    groupId: Types.ObjectId,
    contactIds: Types.ObjectId[],
  ) {
    const records = await this.consents.find({
      organizationId,
      groupId,
      contactId: { $in: contactIds },
      status: ConsentStatus.ACTIVE,
    })
    return new Map(
      records.map((record) => [
        String(record.contactId),
        {
          status: record.status,
          source: record.source,
          consentedAt: record.consentedAt,
        },
      ]),
    )
  }

  async processInbound(
    input: InboundCommandInput,
  ): Promise<InboundCommandResult> {
    const receivingNumber = this.configuredReceivingNumber()
    if (!receivingNumber) return { handled: false }
    let sender: string
    try {
      sender = this.normalizePhone(input.sender)
    } catch {
      return { handled: false }
    }
    const normalized = this.normalizeCommand(input.body)
    const inboundSmsId = new Types.ObjectId(String(input.inboundSmsId))
    const endpointGroups = await this.groups.find({ receivingNumber })
    const organizationIds = [
      ...new Map(
        endpointGroups.map((group) => [
          String(group.organizationId),
          group.organizationId,
        ]),
      ).values(),
    ]

    if (OPT_OUT_COMMANDS.has(normalized))
      return this.processStop(
        organizationIds,
        sender,
        receivingNumber,
        inboundSmsId,
      )
    if (normalized === 'START')
      return this.processStart(
        organizationIds,
        sender,
        receivingNumber,
        inboundSmsId,
      )
    if (normalized === 'HELP')
      return this.processHelp(
        organizationIds,
        sender,
        receivingNumber,
        inboundSmsId,
      )
    if (/^JOIN(?:\s|$)/.test(normalized))
      return this.processJoin(
        normalized,
        endpointGroups,
        sender,
        receivingNumber,
        inboundSmsId,
        input.receivedAt,
      )
    if (
      normalized &&
      /^(?:JOIN|STOP|START|HELP|QUIT|END|REVOKE|OPT|CANCEL|UNSUBSCRIBE)\b/.test(
        normalized,
      )
    )
      return this.processUnknown(
        organizationIds,
        sender,
        receivingNumber,
        inboundSmsId,
      )
    return { handled: false }
  }

  async authorizeRecipients(
    userId: Types.ObjectId | string,
    recipients: string[],
    context: DispatchPolicyContext = { kind: 'ORDINARY' },
  ): Promise<RecipientPolicyResult[]> {
    const operatorMemberships = await this.operators.find({
      userId: new Types.ObjectId(String(userId)),
      status: MembershipStatus.ACTIVE,
    })
    const allowedOrganizations = new Set(
      operatorMemberships.map((item) => String(item.organizationId)),
    )
    if (
      context.organizationId &&
      !allowedOrganizations.has(context.organizationId)
    )
      return recipients.map((recipient) => ({
        recipient,
        eligible: false,
        reason: 'NO_ACTIVE_GROUP_CONSENT',
      }))

    return Promise.all(
      recipients.map(async (recipient): Promise<RecipientPolicyResult> => {
        let mobileNumber: string
        try {
          mobileNumber = this.normalizePhone(recipient)
        } catch {
          return { recipient, eligible: false, reason: 'INVALID_NUMBER' }
        }
        const organizationFilter = context.organizationId
          ? [new Types.ObjectId(context.organizationId)]
          : operatorMemberships.map((item) => item.organizationId)
        const suppression = await this.suppressions.findOne({
          organizationId: { $in: organizationFilter },
          mobileNumber,
          status: SuppressionStatus.ACTIVE,
        })
        if (
          suppression &&
          !(
            context.kind === 'ACKNOWLEDGMENT' &&
            context.acknowledgmentKind === 'STOP' &&
            String(suppression.organizationId) === context.organizationId
          )
        )
          return {
            recipient: mobileNumber,
            eligible: false,
            reason: 'ORGANIZATION_SUPPRESSION',
            organizationId: String(suppression.organizationId),
          }

        if (
          suppression &&
          context.kind === 'ACKNOWLEDGMENT' &&
          context.acknowledgmentKind === 'STOP'
        )
          return {
            recipient: mobileNumber,
            eligible: true,
            organizationId: context.organizationId,
          }

        if (context.kind === 'ACKNOWLEDGMENT') {
          if (
            ['START', 'HELP', 'UNKNOWN'].includes(
              context.acknowledgmentKind || '',
            )
          )
            return {
              recipient: mobileNumber,
              eligible: true,
              organizationId: context.organizationId,
            }
        }

        const consent = await this.consents.findOne({
          organizationId: { $in: organizationFilter },
          ...(context.groupId
            ? { groupId: new Types.ObjectId(context.groupId) }
            : {}),
          mobileNumber,
          status: ConsentStatus.ACTIVE,
        })
        if (!consent)
          return {
            recipient: mobileNumber,
            eligible: false,
            reason: 'NO_ACTIVE_GROUP_CONSENT',
          }
        return {
          recipient: mobileNumber,
          eligible: true,
          organizationId: String(consent.organizationId),
          groupId: String(consent.groupId),
        }
      }),
    )
  }

  private async processStop(
    organizationIds: Types.ObjectId[],
    sender: string,
    receivingNumber: string,
    inboundSmsId: Types.ObjectId,
  ): Promise<InboundCommandResult> {
    let acknowledgmentOrganizationId: string | undefined
    for (const organizationId of organizationIds) {
      const active = await this.suppressions.exists({
        organizationId,
        mobileNumber: sender,
        status: SuppressionStatus.ACTIVE,
      })
      if (!active && !acknowledgmentOrganizationId)
        acknowledgmentOrganizationId = String(organizationId)
      if (!active)
        await this.suppressions.updateOne(
          { organizationId, mobileNumber: sender },
          {
            $set: {
              status: SuppressionStatus.ACTIVE,
              suppressedAt: new Date(),
              suppressedByInboundSmsId: inboundSmsId,
            },
            $unset: { endedAt: 1, endedByInboundSmsId: 1 },
          },
          { upsert: true },
        )
      const consentResult = await this.consents.updateMany(
        { organizationId, mobileNumber: sender, status: ConsentStatus.ACTIVE },
        {
          $set: {
            status: ConsentStatus.ENDED,
            endedAt: new Date(),
            endedByCommand: 'STOP',
          },
        },
      )
      const contacts = await this.contacts.find({
        organizationId,
        mobileNumber: sender,
      })
      await this.memberships.updateMany(
        {
          organizationId,
          contactId: { $in: contacts.map((item) => item._id) },
          status: RosterMembershipStatus.ACTIVE,
        },
        {
          $set: {
            status: RosterMembershipStatus.REMOVED,
            changedAt: new Date(),
            reason: 'Recipient STOP',
            changedByInboundSmsId: inboundSmsId,
          },
        },
      )
      await this.sms.updateMany(
        {
          recipient: sender,
          status: 'pending',
          $or: [
            { 'metadata.organizationId': String(organizationId) },
            { 'metadata.organizationId': { $exists: false } },
          ],
        },
        {
          $set: {
            status: 'failed',
            failedAt: new Date(),
            errorCode: 'RECIPIENT_SUPPRESSED',
            errorMessage: 'Recipient opted out of organization messages',
          },
        },
      )
      await this.audit.updateOne(
        { organizationId, inboundSmsId, action: 'STOP' },
        {
          $setOnInsert: {
            organizationId,
            action: 'STOP',
            result: active ? 'ALREADY_SUPPRESSED' : 'SUPPRESSED',
            redactedNumber: this.redact(sender),
            receivingNumber,
            inboundSmsId,
            affectedConsentCount: consentResult.modifiedCount,
            acknowledgmentOutcome: active ? 'NOT_REPEATED' : 'QUEUED',
          },
        },
        { upsert: true },
      )
    }
    return {
      handled: true,
      command: 'STOP',
      ...(acknowledgmentOrganizationId
        ? {
            acknowledgment: {
              kind: 'STOP' as const,
              organizationId: acknowledgmentOrganizationId,
              body: 'Boise Church of Christ: All church texts are stopped. Reply START to become eligible again, then JOIN each group you want.',
            },
          }
        : {}),
    }
  }

  private async processStart(
    organizationIds: Types.ObjectId[],
    sender: string,
    receivingNumber: string,
    inboundSmsId: Types.ObjectId,
  ): Promise<InboundCommandResult> {
    let acknowledgmentOrganizationId: string | undefined
    for (const organizationId of organizationIds) {
      const result = await this.suppressions.updateOne(
        {
          organizationId,
          mobileNumber: sender,
          status: SuppressionStatus.ACTIVE,
        },
        {
          $set: {
            status: SuppressionStatus.ENDED,
            endedAt: new Date(),
            endedByInboundSmsId: inboundSmsId,
          },
        },
      )
      if (result.modifiedCount > 0 && !acknowledgmentOrganizationId)
        acknowledgmentOrganizationId = String(organizationId)
      await this.audit.updateOne(
        { organizationId, inboundSmsId, action: 'START' },
        {
          $setOnInsert: {
            organizationId,
            action: 'START',
            result:
              result.modifiedCount > 0
                ? 'ELIGIBILITY_RESTORED'
                : 'NO_ACTIVE_SUPPRESSION',
            redactedNumber: this.redact(sender),
            receivingNumber,
            inboundSmsId,
            affectedConsentCount: 0,
            acknowledgmentOutcome:
              result.modifiedCount > 0 ? 'QUEUED' : 'RATE_LIMITED',
          },
        },
        { upsert: true },
      )
    }
    if (!acknowledgmentOrganizationId && organizationIds[0]) {
      const permitted = await this.claimResponseWindow(
        sender,
        receivingNumber,
        'START_INFORMATIONAL',
      )
      if (permitted) acknowledgmentOrganizationId = String(organizationIds[0])
    }
    return {
      handled: true,
      command: 'START',
      ...(acknowledgmentOrganizationId
        ? {
            acknowledgment: {
              kind: 'START' as const,
              organizationId: acknowledgmentOrganizationId,
              body: 'Boise Church of Christ: Messaging eligibility is restored, but you have not rejoined any groups. Send an advertised JOIN <CODE> for each group you want.',
            },
          }
        : {}),
    }
  }

  private async processHelp(
    organizationIds: Types.ObjectId[],
    sender: string,
    receivingNumber: string,
    inboundSmsId: Types.ObjectId,
  ): Promise<InboundCommandResult> {
    const organizationId = organizationIds[0]
    if (!organizationId) return { handled: true, command: 'HELP' }
    const suppressed = await this.suppressions.exists({
      organizationId: { $in: organizationIds },
      mobileNumber: sender,
      status: SuppressionStatus.ACTIVE,
    })
    const permitted =
      !suppressed &&
      (await this.claimResponseWindow(sender, receivingNumber, 'HELP'))
    await this.audit.updateOne(
      { organizationId, inboundSmsId, action: 'HELP' },
      {
        $setOnInsert: {
          organizationId,
          action: 'HELP',
          result: suppressed
            ? 'SUPPRESSED'
            : permitted
              ? 'QUEUED'
              : 'RATE_LIMITED',
          redactedNumber: this.redact(sender),
          receivingNumber,
          inboundSmsId,
          acknowledgmentOutcome: permitted ? 'QUEUED' : 'NOT_SENT',
        },
      },
      { upsert: true },
    )
    return {
      handled: true,
      command: 'HELP',
      ...(permitted
        ? {
            acknowledgment: {
              kind: 'HELP' as const,
              organizationId: String(organizationId),
              body: 'Boise Church of Christ messaging help: Reply STOP to stop all church texts or START to restore eligibility. Contact your church administrator for assistance.',
            },
          }
        : {}),
    }
  }

  private async processUnknown(
    organizationIds: Types.ObjectId[],
    sender: string,
    receivingNumber: string,
    inboundSmsId: Types.ObjectId,
  ): Promise<InboundCommandResult> {
    const organizationId = organizationIds[0]
    if (!organizationId) return { handled: false }
    const suppressed = await this.suppressions.exists({
      organizationId: { $in: organizationIds },
      mobileNumber: sender,
      status: SuppressionStatus.ACTIVE,
    })
    const permitted =
      !suppressed &&
      (await this.claimResponseWindow(sender, receivingNumber, 'UNKNOWN'))
    await this.audit.updateOne(
      { organizationId, inboundSmsId, action: 'UNKNOWN_COMMAND' },
      {
        $setOnInsert: {
          organizationId,
          action: 'UNKNOWN_COMMAND',
          result: suppressed
            ? 'SUPPRESSED'
            : permitted
              ? 'QUEUED'
              : 'RATE_LIMITED',
          redactedNumber: this.redact(sender),
          receivingNumber,
          inboundSmsId,
          acknowledgmentOutcome: permitted ? 'QUEUED' : 'NOT_SENT',
        },
      },
      { upsert: true },
    )
    return {
      handled: true,
      command: 'UNKNOWN',
      ...(permitted
        ? {
            acknowledgment: {
              kind: 'UNKNOWN' as const,
              organizationId: String(organizationId),
              body: 'Command not recognized. Use an advertised JOIN <CODE>, STOP, or HELP.',
            },
          }
        : {}),
    }
  }

  private async processJoin(
    normalized: string,
    endpointGroups: Group[],
    sender: string,
    receivingNumber: string,
    inboundSmsId: Types.ObjectId,
    receivedAt: Date,
  ): Promise<InboundCommandResult> {
    const match = /^JOIN ([A-Z0-9]{2,20})$/.exec(normalized)
    if (!match)
      return this.processUnknown(
        [
          ...new Map(
            endpointGroups.map((group) => [
              String(group.organizationId),
              group.organizationId,
            ]),
          ).values(),
        ],
        sender,
        receivingNumber,
        inboundSmsId,
      )
    const routes = endpointGroups.filter(
      (group) =>
        group.status === GroupStatus.ACTIVE && group.joinCode === match[1],
    )
    if (routes.length !== 1)
      return this.processUnknown(
        [
          ...new Map(
            endpointGroups.map((group) => [
              String(group.organizationId),
              group.organizationId,
            ]),
          ).values(),
        ],
        sender,
        receivingNumber,
        inboundSmsId,
      )
    const group = routes[0]
    const suppressed = await this.suppressions.exists({
      organizationId: group.organizationId,
      mobileNumber: sender,
      status: SuppressionStatus.ACTIVE,
    })
    if (suppressed) {
      await this.audit.updateOne(
        { organizationId: group.organizationId, inboundSmsId, action: 'JOIN' },
        {
          $setOnInsert: {
            organizationId: group.organizationId,
            action: 'JOIN',
            result: 'SUPPRESSED',
            redactedNumber: this.redact(sender),
            receivingNumber,
            inboundSmsId,
            groupId: group._id,
            acknowledgmentOutcome: 'NOT_SENT',
          },
        },
        { upsert: true },
      )
      return { handled: true, command: 'JOIN' }
    }

    let contact = await this.contacts.findOne({
      organizationId: group.organizationId,
      mobileNumber: sender,
    })
    let createdContact = false
    if (!contact) {
      try {
        contact = await this.contacts.create({
          organizationId: group.organizationId,
          displayName: `SMS contact ending ${sender.slice(-4)}`,
          mobileNumber: sender,
          createdByInboundSmsId: inboundSmsId,
        })
        createdContact = true
      } catch (error) {
        if ((error as { code?: number }).code !== 11000) throw error
        contact = await this.contacts.findOne({
          organizationId: group.organizationId,
          mobileNumber: sender,
        })
      }
    }
    if (!contact) throw new Error('contact-postcondition')
    const priorMembership = await this.memberships.findOne({
      organizationId: group.organizationId,
      groupId: group._id,
      contactId: contact._id,
    })
    const priorConsent = await this.consents.findOne({
      organizationId: group.organizationId,
      groupId: group._id,
      contactId: contact._id,
    })
    const alreadyJoined =
      priorMembership?.status === RosterMembershipStatus.ACTIVE &&
      priorConsent?.status === ConsentStatus.ACTIVE
    try {
      await this.memberships.updateOne(
        {
          organizationId: group.organizationId,
          groupId: group._id,
          contactId: contact._id,
        },
        {
          $set: {
            status: RosterMembershipStatus.ACTIVE,
            changedAt: receivedAt,
            changedByInboundSmsId: inboundSmsId,
          },
          $unset: { reason: 1 },
        },
        { upsert: true },
      )
      await this.consents.updateOne(
        {
          organizationId: group.organizationId,
          groupId: group._id,
          contactId: contact._id,
        },
        {
          $set: {
            mobileNumber: sender,
            source: ConsentSource.TEXT_TO_JOIN,
            status: ConsentStatus.ACTIVE,
            receivingNumber,
            inboundSmsId,
            consentedAt: receivedAt,
          },
          $unset: {
            actorUserId: 1,
            methodNote: 1,
            endedAt: 1,
            endedByCommand: 1,
          },
        },
        { upsert: true },
      )
      const [membershipPostcondition, consentPostcondition] = await Promise.all(
        [
          this.memberships.exists({
            organizationId: group.organizationId,
            groupId: group._id,
            contactId: contact._id,
            status: RosterMembershipStatus.ACTIVE,
          }),
          this.consents.exists({
            organizationId: group.organizationId,
            groupId: group._id,
            contactId: contact._id,
            status: ConsentStatus.ACTIVE,
          }),
        ],
      )
      if (!membershipPostcondition || !consentPostcondition)
        throw new Error('join-postcondition')
    } catch (error) {
      if (priorMembership)
        await this.memberships.replaceOne(
          { _id: priorMembership._id },
          priorMembership.toObject(),
        )
      else
        await this.memberships.deleteOne({
          organizationId: group.organizationId,
          groupId: group._id,
          contactId: contact._id,
        })
      if (priorConsent)
        await this.consents.replaceOne(
          { _id: priorConsent._id },
          priorConsent.toObject(),
        )
      else
        await this.consents.deleteOne({
          organizationId: group.organizationId,
          groupId: group._id,
          contactId: contact._id,
        })
      if (createdContact) await this.contacts.deleteOne({ _id: contact._id })
      throw error
    }

    const responseKind = alreadyJoined ? 'ALREADY_JOINED' : 'JOIN'
    const permitted =
      !alreadyJoined ||
      (await this.claimResponseWindow(
        sender,
        receivingNumber,
        `ALREADY_JOINED:${String(group._id)}`,
      ))
    await this.audit.updateOne(
      { organizationId: group.organizationId, inboundSmsId, action: 'JOIN' },
      {
        $setOnInsert: {
          organizationId: group.organizationId,
          action: 'JOIN',
          result: alreadyJoined ? 'ALREADY_JOINED' : 'ACTIVATED',
          redactedNumber: this.redact(sender),
          receivingNumber,
          inboundSmsId,
          contactId: contact._id,
          groupId: group._id,
          affectedConsentCount: alreadyJoined ? 0 : 1,
          acknowledgmentOutcome: permitted ? 'QUEUED' : 'RATE_LIMITED',
        },
      },
      { upsert: true },
    )
    return {
      handled: true,
      command: 'JOIN',
      ...(permitted
        ? {
            acknowledgment: {
              kind: responseKind as AcknowledgmentKind,
              organizationId: String(group.organizationId),
              groupId: String(group._id),
              body: `Boise Church of Christ: You joined ${group.displayName}. Msg frequency varies. Msg & data rates may apply. Reply STOP to stop all church texts; HELP for help.`,
            },
          }
        : {}),
    }
  }

  private async claimResponseWindow(
    mobileNumber: string,
    receivingNumber: string,
    responseKind: string,
  ) {
    const now = new Date()
    const windowStart = new Date(now)
    windowStart.setUTCMinutes(0, 0, 0)
    try {
      await this.responseWindows.create({
        mobileNumber,
        receivingNumber,
        responseKind,
        windowStart,
      })
      return true
    } catch (error) {
      if ((error as { code?: number }).code === 11000) return false
      throw error
    }
  }

  private configuredReceivingNumber() {
    try {
      return this.normalizePhone(process.env.TEXTBEE_DEFAULT_RECEIVING_NUMBER)
    } catch {
      return null
    }
  }

  private methodNote(value: unknown) {
    if (value === undefined || value === null || value === '') return undefined
    if (typeof value !== 'string' || value.trim().length > 500)
      throw new BadRequestException({
        error: 'Consent method note must be 500 characters or fewer',
      })
    return value.trim()
  }

  private redact(number: string) {
    return `***${number.slice(-4)}`
  }
}
