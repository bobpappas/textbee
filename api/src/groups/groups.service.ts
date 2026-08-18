import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { createHash, randomUUID } from 'crypto'
import { Model, Types } from 'mongoose'
import { ConsentService } from '../consent/consent.service'
import { MembershipStatus } from '../organizations/organization.enums'
import { OrganizationPolicyService } from '../organizations/organization-policy.service'
import { OperatorMembership } from '../organizations/schemas/operator-membership.schema'
import { User } from '../users/schemas/user.schema'
import {
  GroupOwnerStatus,
  GroupStatus,
  RosterMembershipStatus,
} from './group.enums'
import { Contact } from './schemas/contact.schema'
import { GroupAuditEvent } from './schemas/group-audit-event.schema'
import { GroupOwnerAssignment } from './schemas/group-owner-assignment.schema'
import { Group, GroupDocument } from './schemas/group.schema'
import { RosterMembership } from './schemas/roster-membership.schema'
import {
  RosterBulkImport,
  RosterBulkImportDocument,
} from './schemas/roster-bulk-import.schema'

type Actor = { _id?: Types.ObjectId | string; id?: string }
type Input = Record<string, unknown>
type BulkClassification =
  | 'READY_NEW_CONTACT'
  | 'READY_EXISTING_CONTACT'
  | 'ALREADY_MEMBER'
  | 'DUPLICATE_IN_FILE'
  | 'SUPPRESSED'
  | 'INVALID'
type BulkRow = {
  rowNumber: number
  displayName: string
  mobileNumber?: string
  displayNumber?: string
  consentNote?: string
  classification: BulkClassification
  reason: string
}
type BulkPersistenceStage = 'CONTACT' | 'MEMBERSHIP' | 'CONSENT' | 'AUDIT'

@Injectable()
export class GroupsService {
  constructor(
    @InjectModel(Group.name) private readonly groups: Model<Group>,
    @InjectModel(Contact.name) private readonly contacts: Model<Contact>,
    @InjectModel(GroupOwnerAssignment.name)
    private readonly owners: Model<GroupOwnerAssignment>,
    @InjectModel(RosterMembership.name)
    private readonly memberships: Model<RosterMembership>,
    @InjectModel(GroupAuditEvent.name)
    private readonly audit: Model<GroupAuditEvent>,
    @InjectModel(RosterBulkImport.name)
    private readonly bulkImports: Model<RosterBulkImport>,
    @InjectModel(OperatorMembership.name)
    private readonly operatorsModel: Model<OperatorMembership>,
    @InjectModel(User.name) private readonly users: Model<User>,
    private readonly policy: OrganizationPolicyService,
    private readonly consent: ConsentService,
  ) {}

  async receivingNumbers(organizationId: string, actor: Actor) {
    await this.requireMembership(organizationId, actor)
    const receivingNumber = this.configuredReceivingNumber()
    return receivingNumber
      ? [
          {
            id: 'deployment-default',
            number: receivingNumber,
            displayNumber: this.formatPhone(receivingNumber),
          },
        ]
      : []
  }

  async operators(organizationId: string, actor: Actor) {
    await this.requireAdmin(organizationId, actor)
    const organizationObjectId = this.objectId(organizationId)
    const memberships = await this.operatorsModel
      .find({
        organizationId: organizationObjectId,
        status: MembershipStatus.ACTIVE,
      })
      .sort({ _id: 1 })
    const users = await this.users.find({
      _id: { $in: memberships.map((item) => item.userId) },
      isBanned: { $ne: true },
    })
    const byId = new Map(users.map((user) => [String(user._id), user]))
    return memberships
      .filter((item) => byId.has(String(item.userId)))
      .map((item) => ({
        membershipId: String(item._id),
        displayName: byId.get(String(item.userId))?.name || 'Approved operator',
      }))
  }

  async list(organizationId: string, actor: Actor, includeArchived = false) {
    const access = await this.requireMembership(organizationId, actor)
    const organizationObjectId = this.objectId(organizationId)
    const admin = await this.isAdmin(organizationId, access.userId)
    if (includeArchived && !admin) throw this.notFound()
    const filter: Record<string, unknown> = {
      organizationId: organizationObjectId,
      status: includeArchived
        ? { $in: [GroupStatus.ACTIVE, GroupStatus.ARCHIVED] }
        : GroupStatus.ACTIVE,
    }
    if (!admin) {
      const assignments = await this.owners.find({
        organizationId: organizationObjectId,
        membershipId: access.membership._id,
        status: GroupOwnerStatus.ACTIVE,
      })
      filter._id = { $in: assignments.map((item) => item.groupId) }
    }
    const groups = await this.groups
      .find(filter)
      .sort({ displayName: 1, _id: 1 })
    return Promise.all(groups.map((group) => this.groupView(group)))
  }

  async read(organizationId: string, groupId: string, actor: Actor) {
    const { group, admin } = await this.requireGroup(
      organizationId,
      groupId,
      actor,
      true,
    )
    if (group.status === GroupStatus.ARCHIVED && !admin) throw this.notFound()
    return this.groupView(group)
  }

  async codeAvailability(
    organizationId: string,
    actor: Actor,
    receivingNumberId: unknown,
    codeInput: unknown,
    excludeGroupId?: string,
  ) {
    await this.requireMembership(organizationId, actor)
    const receivingNumber = this.resolveReceivingNumber(receivingNumberId)
    const joinCode = this.normalizeJoinCode(codeInput)
    const filter: Record<string, unknown> = { receivingNumber, joinCode }
    if (excludeGroupId && Types.ObjectId.isValid(excludeGroupId))
      filter._id = { $ne: new Types.ObjectId(excludeGroupId) }
    return { available: !(await this.groups.exists(filter)) }
  }

  async create(
    organizationId: string,
    actor: Actor,
    inputValue: unknown,
    correlationId: string = randomUUID(),
  ) {
    const actorId = this.actorId(actor)
    await this.requireAdmin(organizationId, actor)
    const input = this.input(inputValue)
    const organizationObjectId = this.objectId(organizationId)
    const displayName = this.normalizeName(input.displayName)
    const joinCode = this.normalizeJoinCode(input.joinCode)
    const receivingNumber = this.resolveReceivingNumber(input.receivingNumberId)
    const ownerIds = this.stringArray(input.ownerMembershipIds)
    await this.validateOwnerMemberships(organizationObjectId, ownerIds)
    let group: GroupDocument | null = null
    try {
      group = await this.groups.create({
        organizationId: organizationObjectId,
        displayName,
        status: GroupStatus.ACTIVE,
        receivingNumberId: 'deployment-default',
        receivingNumber,
        joinCode,
        createdBy: actorId,
      })
      const now = new Date()
      await Promise.all(
        ownerIds.map((membershipId) =>
          this.owners.updateOne(
            {
              organizationId: organizationObjectId,
              groupId: group._id,
              membershipId: new Types.ObjectId(membershipId),
            },
            {
              $set: {
                status: GroupOwnerStatus.ACTIVE,
                changedBy: actorId,
                changedAt: now,
              },
              $unset: { reason: 1 },
            },
            { upsert: true },
          ),
        ),
      )
      await this.record(
        organizationObjectId,
        actorId,
        'GROUP_CREATED',
        'Group',
        String(group._id),
        correlationId,
        undefined,
        GroupStatus.ACTIVE,
      )
      await Promise.all(
        ownerIds.map((membershipId) =>
          this.record(
            organizationObjectId,
            actorId,
            'GROUP_OWNER_ASSIGNED',
            'OperatorMembership',
            membershipId,
            correlationId,
            undefined,
            GroupOwnerStatus.ACTIVE,
          ),
        ),
      )
      return this.groupView(group)
    } catch (error) {
      if (group) {
        await Promise.all([
          this.owners.deleteMany({
            organizationId: organizationObjectId,
            groupId: group._id,
          }),
          this.audit.deleteMany({
            organizationId: organizationObjectId,
            correlationId,
          }),
          this.groups.deleteOne({
            _id: group._id,
            organizationId: organizationObjectId,
          }),
        ])
      }
      if ((error as { code?: number }).code === 11000) throw this.codeConflict()
      throw error
    }
  }

  async rename(
    organizationId: string,
    groupId: string,
    actor: Actor,
    inputValue: unknown,
    correlationId: string = randomUUID(),
  ) {
    const actorId = this.actorId(actor)
    const { group } = await this.requireAdminGroup(
      organizationId,
      groupId,
      actor,
    )
    this.requireActive(group)
    const displayName = this.normalizeName(this.input(inputValue).displayName)
    if (group.displayName === displayName) return this.groupView(group)
    const prior = group.displayName
    group.displayName = displayName
    await group.save()
    await this.record(
      group.organizationId,
      actorId,
      'GROUP_RENAMED',
      'Group',
      String(group._id),
      correlationId,
      prior,
      displayName,
    )
    return this.groupView(group)
  }

  async changeJoinSettings(
    organizationId: string,
    groupId: string,
    actor: Actor,
    inputValue: unknown,
    correlationId: string = randomUUID(),
  ) {
    const actorId = this.actorId(actor)
    const { group } = await this.requireGroup(organizationId, groupId, actor)
    this.requireActive(group)
    const input = this.input(inputValue)
    const joinCode = this.normalizeJoinCode(input.joinCode)
    const receivingNumber = this.resolveReceivingNumber(input.receivingNumberId)
    if (
      group.joinCode === joinCode &&
      group.receivingNumber === receivingNumber
    )
      return this.groupView(group)
    const prior = `${group.receivingNumberId}:${group.joinCode}`
    group.joinCode = joinCode
    group.receivingNumber = receivingNumber
    group.receivingNumberId = 'deployment-default'
    try {
      await group.save()
    } catch (error) {
      if ((error as { code?: number }).code === 11000) throw this.codeConflict()
      throw error
    }
    await this.record(
      group.organizationId,
      actorId,
      'GROUP_JOIN_SETTINGS_CHANGED',
      'Group',
      String(group._id),
      correlationId,
      prior,
      `deployment-default:${joinCode}`,
    )
    return this.groupView(group)
  }

  async archive(
    organizationId: string,
    groupId: string,
    actor: Actor,
    inputValue: unknown,
    correlationId: string = randomUUID(),
  ) {
    const actorId = this.actorId(actor)
    const { group } = await this.requireAdminGroup(
      organizationId,
      groupId,
      actor,
    )
    if (group.status === GroupStatus.ARCHIVED) return this.groupView(group)
    const reason = this.normalizeReason(this.input(inputValue).reason)
    group.status = GroupStatus.ARCHIVED
    group.archivedBy = new Types.ObjectId(actorId)
    group.archivedAt = new Date()
    await group.save()
    await this.record(
      group.organizationId,
      actorId,
      'GROUP_ARCHIVED',
      'Group',
      String(group._id),
      correlationId,
      GroupStatus.ACTIVE,
      GroupStatus.ARCHIVED,
      reason,
    )
    return this.groupView(group)
  }

  async reactivate(
    organizationId: string,
    groupId: string,
    actor: Actor,
    correlationId: string = randomUUID(),
  ) {
    const actorId = this.actorId(actor)
    const { group } = await this.requireAdminGroup(
      organizationId,
      groupId,
      actor,
    )
    if (group.status === GroupStatus.ACTIVE) return this.groupView(group)
    if (group.receivingNumber !== this.configuredReceivingNumber())
      throw new ServiceUnavailableException({
        error: 'Receiving number configuration is required',
      })
    group.status = GroupStatus.ACTIVE
    group.reactivatedBy = new Types.ObjectId(actorId)
    group.reactivatedAt = new Date()
    await group.save()
    await this.record(
      group.organizationId,
      actorId,
      'GROUP_REACTIVATED',
      'Group',
      String(group._id),
      correlationId,
      GroupStatus.ARCHIVED,
      GroupStatus.ACTIVE,
    )
    return this.groupView(group)
  }

  async assignOwner(
    organizationId: string,
    groupId: string,
    membershipId: string,
    actor: Actor,
    correlationId: string = randomUUID(),
  ) {
    const actorId = this.actorId(actor)
    const { group } = await this.requireAdminGroup(
      organizationId,
      groupId,
      actor,
    )
    this.requireActive(group)
    const ownerId = this.objectId(membershipId)
    await this.validateOwnerMemberships(group.organizationId, [String(ownerId)])
    const existing = await this.owners.findOne({
      organizationId: group.organizationId,
      groupId: group._id,
      membershipId: ownerId,
      status: GroupOwnerStatus.ACTIVE,
    })
    if (existing) return this.groupView(group)
    await this.owners.updateOne(
      {
        organizationId: group.organizationId,
        groupId: group._id,
        membershipId: ownerId,
      },
      {
        $set: {
          status: GroupOwnerStatus.ACTIVE,
          changedBy: actorId,
          changedAt: new Date(),
        },
        $unset: { reason: 1 },
      },
      { upsert: true },
    )
    await this.record(
      group.organizationId,
      actorId,
      'GROUP_OWNER_ASSIGNED',
      'OperatorMembership',
      membershipId,
      correlationId,
    )
    return this.groupView(group)
  }

  async revokeOwner(
    organizationId: string,
    groupId: string,
    membershipId: string,
    actor: Actor,
    inputValue: unknown,
    correlationId: string = randomUUID(),
  ) {
    const actorId = this.actorId(actor)
    const { group } = await this.requireAdminGroup(
      organizationId,
      groupId,
      actor,
    )
    this.requireActive(group)
    const reason = this.normalizeReason(this.input(inputValue).reason)
    const ownerId = this.objectId(membershipId)
    const existing = await this.owners.findOne({
      organizationId: group.organizationId,
      groupId: group._id,
      membershipId: ownerId,
      status: GroupOwnerStatus.ACTIVE,
    })
    if (!existing) return this.groupView(group)
    await this.owners.updateOne(
      {
        organizationId: group.organizationId,
        groupId: group._id,
        membershipId: ownerId,
        status: GroupOwnerStatus.ACTIVE,
      },
      {
        $set: {
          status: GroupOwnerStatus.REVOKED,
          changedBy: actorId,
          changedAt: new Date(),
          reason,
        },
      },
    )
    await this.record(
      group.organizationId,
      actorId,
      'GROUP_OWNER_REVOKED',
      'OperatorMembership',
      membershipId,
      correlationId,
      GroupOwnerStatus.ACTIVE,
      GroupOwnerStatus.REVOKED,
      reason,
    )
    return this.groupView(group)
  }

  async roster(
    organizationId: string,
    groupId: string,
    actor: Actor,
    searchInput?: unknown,
  ) {
    const { group, admin } = await this.requireGroup(
      organizationId,
      groupId,
      actor,
      true,
    )
    if (group.status === GroupStatus.ARCHIVED && !admin) throw this.notFound()
    const memberships = await this.memberships.find({
      organizationId: group.organizationId,
      groupId: group._id,
      status: RosterMembershipStatus.ACTIVE,
    })
    const contacts = await this.contacts.find({
      organizationId: group.organizationId,
      _id: { $in: memberships.map((item) => item.contactId) },
    })
    const consentByContact = await this.consent.activeConsentViews(
      group.organizationId,
      group._id,
      contacts.map((contact) => contact._id),
    )
    const membershipByContact = new Map(
      memberships.map((item) => [String(item.contactId), item]),
    )
    const search =
      typeof searchInput === 'string'
        ? searchInput.trim().toLocaleLowerCase()
        : ''
    return contacts
      .map((contact) => ({
        id: String(membershipByContact.get(String(contact._id))?._id),
        contactId: String(contact._id),
        displayName: contact.displayName,
        mobileNumber: contact.mobileNumber,
        displayNumber: this.formatPhone(contact.mobileNumber),
        consentStatus:
          consentByContact.get(String(contact._id))?.status || 'MISSING',
        consentSource: consentByContact.get(String(contact._id))?.source,
        consentedAt: consentByContact.get(String(contact._id))?.consentedAt,
      }))
      .filter(
        (item) =>
          !search ||
          item.displayName.toLocaleLowerCase().includes(search) ||
          item.mobileNumber.includes(search.replace(/\D/g, '')),
      )
      .sort(
        (a, b) =>
          a.displayName.localeCompare(b.displayName) ||
          a.mobileNumber.localeCompare(b.mobileNumber) ||
          a.id.localeCompare(b.id),
      )
  }

  async addPerson(
    organizationId: string,
    groupId: string,
    actor: Actor,
    inputValue: unknown,
    correlationId: string = randomUUID(),
    sourceRow?: number,
    onPersistenceStage?: (stage: BulkPersistenceStage) => void,
  ) {
    const actorId = this.actorId(actor)
    const { group } = await this.requireGroup(organizationId, groupId, actor)
    this.requireActive(group)
    const input = this.input(inputValue)
    const displayName = this.normalizeName(input.displayName)
    const mobileNumber = this.normalizePhone(input.mobileNumber)
    if (input.consentAffirmed !== true)
      throw new BadRequestException({
        error:
          'Affirm that this person asked to receive messages or provided this number for church communications',
      })
    onPersistenceStage?.('CONTACT')
    let contact = await this.contacts.findOne({
      organizationId: group.organizationId,
      mobileNumber,
    })
    let reused = true
    let createdContact = false
    if (!contact) {
      reused = false
      try {
        contact = await this.contacts.create({
          organizationId: group.organizationId,
          displayName,
          mobileNumber,
          createdBy: actorId,
        })
        createdContact = true
      } catch (error) {
        if ((error as { code?: number }).code !== 11000) throw error
        contact = await this.contacts.findOne({
          organizationId: group.organizationId,
          mobileNumber,
        })
      }
    }
    if (!contact) throw new ServiceUnavailableException()
    onPersistenceStage?.('MEMBERSHIP')
    const existingMembership = await this.memberships.findOne({
      organizationId: group.organizationId,
      groupId: group._id,
      contactId: contact._id,
    })
    if (existingMembership?.status === RosterMembershipStatus.ACTIVE) {
      await this.consent.recordOperatorConsent({
        organizationId: group.organizationId,
        groupId: group._id,
        contactId: contact._id,
        mobileNumber,
        actorUserId: actorId,
        affirmed: input.consentAffirmed,
        methodNote: input.consentMethodNote,
        sourceRow,
        onPersistenceStage,
      })
      return {
        id: String(existingMembership._id),
        contactId: String(contact._id),
        displayName: contact.displayName,
        mobileNumber: contact.mobileNumber,
        displayNumber: this.formatPhone(contact.mobileNumber),
        reusedContact: true,
      }
    }
    const now = new Date()
    try {
      onPersistenceStage?.('MEMBERSHIP')
      await this.memberships.updateOne(
        {
          organizationId: group.organizationId,
          groupId: group._id,
          contactId: contact._id,
        },
        {
          $set: {
            status: RosterMembershipStatus.ACTIVE,
            changedBy: actorId,
            changedAt: now,
          },
          $unset: { reason: 1 },
        },
        { upsert: true },
      )
      const membership = await this.memberships.findOne({
        organizationId: group.organizationId,
        groupId: group._id,
        contactId: contact._id,
        status: RosterMembershipStatus.ACTIVE,
      })
      if (!membership) throw new Error('membership-postcondition')
      await this.consent.recordOperatorConsent({
        organizationId: group.organizationId,
        groupId: group._id,
        contactId: contact._id,
        mobileNumber,
        actorUserId: actorId,
        affirmed: input.consentAffirmed,
        methodNote: input.consentMethodNote,
        sourceRow,
        onPersistenceStage,
      })
      onPersistenceStage?.('AUDIT')
      await this.record(
        group.organizationId,
        actorId,
        reused ? 'CONTACT_REUSED' : 'CONTACT_CREATED',
        'Contact',
        String(contact._id),
        correlationId,
      )
      await this.record(
        group.organizationId,
        actorId,
        'ROSTER_MEMBERSHIP_ACTIVATED',
        'RosterMembership',
        String(membership._id),
        correlationId,
        existingMembership?.status,
        RosterMembershipStatus.ACTIVE,
      )
      return {
        id: String(membership._id),
        contactId: String(contact._id),
        displayName: contact.displayName,
        mobileNumber: contact.mobileNumber,
        displayNumber: this.formatPhone(contact.mobileNumber),
        reusedContact: reused,
      }
    } catch (error) {
      if (existingMembership) {
        await this.memberships.updateOne(
          {
            _id: existingMembership._id,
            organizationId: group.organizationId,
            groupId: group._id,
          },
          {
            $set: {
              status: existingMembership.status,
              changedBy: existingMembership.changedBy,
              changedAt: existingMembership.changedAt,
              reason: existingMembership.reason,
            },
          },
        )
      } else {
        await this.memberships.deleteOne({
          organizationId: group.organizationId,
          groupId: group._id,
          contactId: contact._id,
        })
      }
      if (createdContact)
        await this.contacts.deleteOne({
          _id: contact._id,
          organizationId: group.organizationId,
        })
      await this.audit.deleteMany({
        organizationId: group.organizationId,
        correlationId,
      })
      throw error
    }
  }

  async renameContact(
    organizationId: string,
    groupId: string,
    contactId: string,
    actor: Actor,
    inputValue: unknown,
    correlationId: string = randomUUID(),
  ) {
    const actorId = this.actorId(actor)
    const { group, admin } = await this.requireGroup(
      organizationId,
      groupId,
      actor,
    )
    this.requireActive(group)
    const contactObjectId = this.objectId(contactId)
    const membership = await this.memberships.exists({
      organizationId: group.organizationId,
      groupId: group._id,
      contactId: contactObjectId,
      status: RosterMembershipStatus.ACTIVE,
    })
    if (!admin && !membership) throw this.notFound()
    const contact = await this.contacts.findOne({
      _id: contactObjectId,
      organizationId: group.organizationId,
    })
    if (!contact) throw this.notFound()
    const displayName = this.normalizeName(this.input(inputValue).displayName)
    if (contact.displayName === displayName) return this.contactView(contact)
    const prior = contact.displayName
    contact.displayName = displayName
    await contact.save()
    await this.record(
      group.organizationId,
      actorId,
      'CONTACT_DISPLAY_NAME_CHANGED',
      'Contact',
      String(contact._id),
      correlationId,
      prior,
      displayName,
    )
    return this.contactView(contact)
  }

  async contactDetails(
    organizationId: string,
    groupId: string,
    contactId: string,
    actor: Actor,
  ) {
    const { group } = await this.requireGroup(organizationId, groupId, actor)
    if (group.status !== GroupStatus.ACTIVE) throw this.notFound()
    const contact = await this.requireActiveRosterContact(group, contactId)
    return this.contactDetailsView(group, contact)
  }

  async recordContactConsent(
    organizationId: string,
    groupId: string,
    contactId: string,
    actor: Actor,
    inputValue: unknown,
  ) {
    const actorId = this.actorId(actor)
    const { group } = await this.requireGroup(organizationId, groupId, actor)
    if (group.status !== GroupStatus.ACTIVE) throw this.notFound()
    const contact = await this.requireActiveRosterContact(group, contactId)
    const input = this.input(inputValue)
    if (
      await this.consent.isSuppressed(
        group.organizationId,
        contact.mobileNumber,
      )
    )
      throw this.suppressionConflict(group)
    try {
      await this.consent.recordOperatorConsent({
        organizationId: group.organizationId,
        groupId: group._id,
        contactId: contact._id,
        mobileNumber: contact.mobileNumber,
        actorUserId: actorId,
        affirmed: input.affirmed,
        methodNote: input.methodNote,
      })
    } catch (error) {
      if (
        await this.consent.isSuppressed(
          group.organizationId,
          contact.mobileNumber,
        )
      )
        throw this.suppressionConflict(group)
      throw error
    }
    return this.contactDetailsView(group, contact)
  }

  async previewBulkAdd(
    organizationId: string,
    groupId: string,
    actor: Actor,
    inputValue: unknown,
    correlationId: string = randomUUID(),
  ) {
    const actorId = this.actorId(actor)
    const { group } = await this.requireGroup(organizationId, groupId, actor)
    this.requireActive(group)
    const csvContent = this.input(inputValue).csvContent
    if (
      typeof csvContent !== 'string' ||
      csvContent.includes('\uFFFD') ||
      csvContent.length > 1_000_000
    )
      throw new BadRequestException({
        error: 'Upload a readable UTF-8 CSV file',
      })
    const records = this.parseBulkCsv(csvContent)
    if (records.length > 1000)
      throw new BadRequestException({
        error: 'CSV files may contain at most 1,000 non-blank rows',
      })
    const seen = new Set<string>()
    const rows: BulkRow[] = []
    for (const record of records) {
      rows.push(await this.classifyBulkRow(group, record, seen))
    }
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000)
    const preview = await this.bulkImports.create({
      organizationId: group.organizationId,
      groupId: group._id,
      actorUserId: actorId,
      contentHash: createHash('sha256').update(csvContent).digest('hex'),
      status: 'PREVIEW',
      rows,
      expiresAt,
    })
    await this.record(
      group.organizationId,
      actorId,
      'ROSTER_BULK_PREVIEW_CREATED',
      'RosterBulkImport',
      String(preview._id),
      correlationId,
    )
    return this.bulkImportView(preview)
  }

  async applyBulkAdd(
    organizationId: string,
    groupId: string,
    previewId: string,
    actor: Actor,
    inputValue: unknown,
    correlationId: string = randomUUID(),
  ) {
    const actorId = this.actorId(actor)
    const { group } = await this.requireGroup(organizationId, groupId, actor)
    this.requireActive(group)
    if (this.input(inputValue).consentAffirmed !== true)
      throw new BadRequestException({
        error:
          'Affirm that every ready person asked to receive messages or provided their number for church communications',
      })
    const preview = await this.findBulkImport(group, previewId, actorId, false)
    if (preview.status === 'APPLIED') return this.bulkImportView(preview)
    const seen = new Set<string>()
    const results: Record<string, unknown>[] = []
    for (const storedRow of preview.rows as BulkRow[]) {
      const current = await this.classifyBulkRow(
        group,
        {
          rowNumber: storedRow.rowNumber,
          displayName: storedRow.displayName,
          mobileNumber: storedRow.mobileNumber || '',
          consentNote: storedRow.consentNote || '',
        },
        seen,
      )
      let outcome: string = current.classification
      let failureStage: BulkPersistenceStage | undefined
      let contactId: string | undefined
      let membershipId: string | undefined
      if (
        current.classification === 'READY_NEW_CONTACT' ||
        current.classification === 'READY_EXISTING_CONTACT'
      ) {
        try {
          const member = await this.addPerson(
            organizationId,
            groupId,
            actor,
            {
              displayName: current.displayName,
              mobileNumber: current.mobileNumber,
              consentAffirmed: true,
              consentMethodNote: current.consentNote,
            },
            `${String(preview._id)}:row:${current.rowNumber}`,
            current.rowNumber,
            (stage) => {
              failureStage = stage
            },
          )
          outcome = member.reusedContact ? 'REUSED_AND_ADDED' : 'ADDED'
          contactId = member.contactId
          membershipId = member.id
        } catch {
          outcome = 'FAILED'
        }
      }
      const result = {
        rowNumber: current.rowNumber,
        redactedNumber: current.mobileNumber
          ? this.redactPhone(current.mobileNumber)
          : undefined,
        outcome,
        contactId,
        membershipId,
        reason:
          outcome === 'FAILED'
            ? 'The row could not be completed and may be retried'
            : current.reason,
      }
      results.push(result)
      await this.record(
        group.organizationId,
        actorId,
        `ROSTER_BULK_ROW_${outcome}`,
        'RosterBulkImportRow',
        `${String(preview._id)}:${current.rowNumber}`,
        correlationId,
        undefined,
        undefined,
        outcome === 'FAILED' && failureStage
          ? `Persistence stage: ${failureStage}`
          : undefined,
      )
    }
    preview.rows = results
    preview.status = 'APPLIED'
    preview.appliedAt = new Date()
    preview.expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    await preview.save()
    await this.record(
      group.organizationId,
      actorId,
      'ROSTER_BULK_APPLIED',
      'RosterBulkImport',
      String(preview._id),
      correlationId,
    )
    return this.bulkImportView(preview)
  }

  async bulkAddResult(
    organizationId: string,
    groupId: string,
    previewId: string,
    actor: Actor,
  ) {
    const actorId = this.actorId(actor)
    const { group } = await this.requireGroup(organizationId, groupId, actor)
    const preview = await this.findBulkImport(group, previewId, actorId, true)
    return this.bulkImportView(preview)
  }

  async removePerson(
    organizationId: string,
    groupId: string,
    membershipId: string,
    actor: Actor,
    inputValue: unknown,
    correlationId: string = randomUUID(),
  ) {
    const actorId = this.actorId(actor)
    const { group } = await this.requireGroup(organizationId, groupId, actor)
    this.requireActive(group)
    const reason = this.normalizeReason(this.input(inputValue).reason)
    const membership = await this.memberships.findOne({
      _id: this.objectId(membershipId),
      organizationId: group.organizationId,
      groupId: group._id,
    })
    if (!membership) throw this.notFound()
    if (membership.status === RosterMembershipStatus.REMOVED)
      return { removed: true }
    membership.status = RosterMembershipStatus.REMOVED
    membership.changedBy = new Types.ObjectId(actorId)
    membership.changedAt = new Date()
    membership.reason = reason
    await membership.save()
    await this.consent.endGroupConsent({
      organizationId: group.organizationId,
      groupId: group._id,
      contactId: membership.contactId,
      actorUserId: actorId,
      reason,
    })
    await this.record(
      group.organizationId,
      actorId,
      'ROSTER_MEMBERSHIP_REMOVED',
      'RosterMembership',
      String(membership._id),
      correlationId,
      RosterMembershipStatus.ACTIVE,
      RosterMembershipStatus.REMOVED,
      reason,
    )
    return { removed: true }
  }

  normalizePhone(value: unknown) {
    if (typeof value !== 'string' || /[a-z]|(?:ext|x)\s*\d/i.test(value))
      throw new BadRequestException({
        error: 'Enter a structurally valid US phone number',
      })
    const compact = value.trim().replace(/[().\s-]/g, '')
    const digits = compact.startsWith('+1')
      ? compact.slice(2)
      : compact.startsWith('1') && compact.length === 11
        ? compact.slice(1)
        : compact
    if (!/^\d{10}$/.test(digits) || !/^[2-9]\d{2}[2-9]\d{6}$/.test(digits))
      throw new BadRequestException({
        error: 'Enter a structurally valid US phone number',
      })
    return `+1${digits}`
  }

  normalizeJoinCode(value: unknown) {
    if (typeof value !== 'string')
      throw new BadRequestException({
        error: 'Join code must contain 2 to 20 letters or digits',
      })
    const normalized = value.trim().toUpperCase()
    if (!/^[A-Z0-9]{2,20}$/.test(normalized))
      throw new BadRequestException({
        error: 'Join code must contain 2 to 20 letters or digits',
      })
    return normalized
  }

  parseBulkCsv(value: string) {
    const source = value.replace(/^\uFEFF/, '')
    const records: string[][] = []
    let record: string[] = []
    let field = ''
    let quoted = false
    for (let index = 0; index < source.length; index += 1) {
      const character = source[index]
      if (quoted) {
        if (character === '"' && source[index + 1] === '"') {
          field += '"'
          index += 1
        } else if (character === '"') {
          quoted = false
        } else {
          field += character
        }
      } else if (character === '"') {
        if (field.length > 0)
          throw new BadRequestException({ error: 'CSV file is malformed' })
        quoted = true
      } else if (character === ',') {
        record.push(field)
        field = ''
      } else if (character === '\n' || character === '\r') {
        if (character === '\r' && source[index + 1] === '\n') index += 1
        record.push(field)
        records.push(record)
        record = []
        field = ''
      } else {
        field += character
      }
    }
    if (quoted)
      throw new BadRequestException({ error: 'CSV file is malformed' })
    if (field.length > 0 || record.length > 0) {
      record.push(field)
      records.push(record)
    }
    if (records.length === 0)
      throw new BadRequestException({ error: 'CSV header row is required' })
    const headers = records[0]
    const allowed = new Set(['display_name', 'mobile_number', 'consent_note'])
    if (
      headers.length !== new Set(headers).size ||
      !headers.includes('display_name') ||
      !headers.includes('mobile_number') ||
      headers.some((header) => !allowed.has(header)) ||
      headers.length < 2 ||
      headers.length > 3
    )
      throw new BadRequestException({
        error:
          'CSV headers must be display_name,mobile_number with optional consent_note',
      })
    return records
      .slice(1)
      .map((values, index) => ({ values, rowNumber: index + 2 }))
      .filter(({ values }) => values.some((value) => value.trim().length > 0))
      .map(({ values, rowNumber }) => {
        if (values.length !== headers.length)
          return {
            rowNumber,
            displayName: '',
            mobileNumber: '',
            consentNote: '',
            malformed: true,
          }
        const byHeader = new Map(
          headers.map((header, index) => [header, values[index]]),
        )
        return {
          rowNumber,
          displayName: byHeader.get('display_name') || '',
          mobileNumber: byHeader.get('mobile_number') || '',
          consentNote: byHeader.get('consent_note') || '',
          malformed: false,
        }
      })
  }

  private async classifyBulkRow(
    group: GroupDocument,
    record: {
      rowNumber: number
      displayName: string
      mobileNumber: string
      consentNote: string
      malformed?: boolean
    },
    seen: Set<string>,
  ): Promise<BulkRow> {
    let displayName: string
    let mobileNumber: string
    const consentNote = record.consentNote.trim()
    try {
      if (record.malformed) throw new Error('malformed')
      displayName = this.normalizeName(record.displayName)
      mobileNumber = this.normalizePhone(record.mobileNumber)
      if (consentNote.length > 500) throw new Error('consent-note')
    } catch {
      return {
        rowNumber: record.rowNumber,
        displayName: record.displayName.trim(),
        classification: 'INVALID',
        reason: 'Required data, phone number, or consent note is invalid',
      }
    }
    const base = {
      rowNumber: record.rowNumber,
      displayName,
      mobileNumber,
      displayNumber: this.formatPhone(mobileNumber),
      consentNote: consentNote || undefined,
    }
    if (seen.has(mobileNumber))
      return {
        ...base,
        classification: 'DUPLICATE_IN_FILE',
        reason: 'An earlier valid row uses this number',
      }
    seen.add(mobileNumber)
    if (await this.consent.isSuppressed(group.organizationId, mobileNumber))
      return {
        ...base,
        classification: 'SUPPRESSED',
        reason: 'Organization-wide suppression is active',
      }
    const contact = await this.contacts.findOne({
      organizationId: group.organizationId,
      mobileNumber,
    })
    if (!contact)
      return {
        ...base,
        classification: 'READY_NEW_CONTACT',
        reason: 'A new organization contact will be created',
      }
    const member = await this.memberships.exists({
      organizationId: group.organizationId,
      groupId: group._id,
      contactId: contact._id,
      status: RosterMembershipStatus.ACTIVE,
    })
    return member
      ? {
          ...base,
          classification: 'ALREADY_MEMBER',
          reason: 'This contact is already an active group member',
        }
      : {
          ...base,
          classification: 'READY_EXISTING_CONTACT',
          reason: 'The existing organization contact will be reused',
        }
  }

  private async findBulkImport(
    group: GroupDocument,
    previewId: string,
    actorId: string,
    allowExpired: boolean,
  ) {
    if (!Types.ObjectId.isValid(previewId)) throw this.notFound()
    const filter: Record<string, unknown> = {
      _id: new Types.ObjectId(previewId),
      organizationId: group.organizationId,
      groupId: group._id,
      actorUserId: new Types.ObjectId(actorId),
    }
    if (!allowExpired) filter.expiresAt = { $gt: new Date() }
    const preview = await this.bulkImports.findOne(filter)
    if (!preview) throw this.notFound()
    return preview as RosterBulkImportDocument
  }

  private bulkImportView(preview: RosterBulkImportDocument) {
    const rows = preview.rows as Record<string, unknown>[]
    const counts = rows.reduce<Record<string, number>>((result, row) => {
      const key = String(row.outcome || row.classification)
      result[key] = (result[key] || 0) + 1
      return result
    }, {})
    return {
      id: String(preview._id),
      status: preview.status,
      expiresAt: preview.expiresAt,
      appliedAt: preview.appliedAt,
      totalRows: rows.length,
      counts,
      rows,
    }
  }

  private contactView(contact: Contact) {
    return {
      contactId: String(contact._id),
      displayName: contact.displayName,
      mobileNumber: contact.mobileNumber,
      displayNumber: this.formatPhone(contact.mobileNumber),
    }
  }

  private async groupView(group: GroupDocument | Group) {
    const [owners, rosterCount] = await Promise.all([
      this.owners.find({
        organizationId: group.organizationId,
        groupId: group._id,
        status: GroupOwnerStatus.ACTIVE,
      }),
      this.memberships.countDocuments({
        organizationId: group.organizationId,
        groupId: group._id,
        status: RosterMembershipStatus.ACTIVE,
      }),
    ])
    const operatorMemberships = await this.operatorsModel.find({
      organizationId: group.organizationId,
      _id: { $in: owners.map((item) => item.membershipId) },
      status: MembershipStatus.ACTIVE,
    })
    const users = await this.users.find({
      _id: { $in: operatorMemberships.map((item) => item.userId) },
    })
    const byId = new Map(users.map((user) => [String(user._id), user]))
    return {
      id: String(group._id),
      organizationId: String(group.organizationId),
      displayName: group.displayName,
      status: group.status,
      receivingNumberId: group.receivingNumberId,
      receivingNumber: group.receivingNumber,
      displayNumber: this.formatPhone(group.receivingNumber),
      joinCode: group.joinCode,
      joinCommand: `JOIN ${group.joinCode}`,
      rosterCount,
      owners: operatorMemberships.map((item) => ({
        membershipId: String(item._id),
        displayName: byId.get(String(item.userId))?.name || 'Approved operator',
      })),
      createdAt: group.createdAt,
      updatedAt: group.updatedAt,
    }
  }

  private async requireAdminGroup(
    organizationId: string,
    groupId: string,
    actor: Actor,
  ) {
    await this.requireAdmin(organizationId, actor)
    const group = await this.findScopedGroup(organizationId, groupId)
    return { group, admin: true }
  }

  private async requireGroup(
    organizationId: string,
    groupId: string,
    actor: Actor,
    allowArchived = false,
  ) {
    const access = await this.requireMembership(organizationId, actor)
    const group = await this.findScopedGroup(organizationId, groupId)
    const admin = await this.isAdmin(organizationId, access.userId)
    if (!admin) {
      if (!allowArchived && group.status !== GroupStatus.ACTIVE)
        throw this.notFound()
      const owner = await this.owners.findOne({
        organizationId: group.organizationId,
        groupId: group._id,
        membershipId: access.membership._id,
        status: GroupOwnerStatus.ACTIVE,
      })
      if (!owner || group.status !== GroupStatus.ACTIVE) throw this.notFound()
    }
    return { ...access, group, admin }
  }

  private async requireActiveRosterContact(group: Group, contactId: string) {
    const contactObjectId = this.objectId(contactId)
    const membership = await this.memberships.exists({
      organizationId: group.organizationId,
      groupId: group._id,
      contactId: contactObjectId,
      status: RosterMembershipStatus.ACTIVE,
    })
    if (!membership) throw this.notFound()
    const contact = await this.contacts.findOne({
      _id: contactObjectId,
      organizationId: group.organizationId,
    })
    if (!contact) throw this.notFound()
    return contact
  }

  private async contactDetailsView(group: Group, contact: Contact) {
    const suppressed = await this.consent.isSuppressed(
      group.organizationId,
      contact.mobileNumber,
    )
    const activeConsent = suppressed
      ? undefined
      : (
          await this.consent.activeConsentViews(
            group.organizationId,
            group._id,
            [contact._id],
          )
        ).get(String(contact._id))
    return {
      contactId: String(contact._id),
      displayName: contact.displayName,
      displayNumber: this.formatPhone(contact.mobileNumber),
      consentStatus: suppressed
        ? 'OPTED_OUT'
        : activeConsent?.status || 'MISSING',
      consentSource: activeConsent?.source,
      consentedAt: activeConsent?.consentedAt,
      recoveryGuidance: suppressed
        ? `Only the recipient can restore messaging by texting START, then JOIN ${group.joinCode}.`
        : undefined,
    }
  }

  private async findScopedGroup(organizationId: string, groupId: string) {
    if (!Types.ObjectId.isValid(groupId)) throw this.notFound()
    const group = await this.groups.findOne({
      _id: new Types.ObjectId(groupId),
      organizationId: this.objectId(organizationId),
    })
    if (!group) throw this.notFound()
    return group
  }

  private async requireMembership(organizationId: string, actor: Actor) {
    const userId = this.actorId(actor)
    const membership = await this.operatorsModel.findOne({
      organizationId: this.objectId(organizationId),
      userId: new Types.ObjectId(userId),
      status: MembershipStatus.ACTIVE,
    })
    if (!membership) throw this.notFound()
    return { membership, userId }
  }

  private async requireAdmin(organizationId: string, actor: Actor) {
    const userId = this.actorId(actor)
    const membership = await this.policy.activeAdminMembership(
      organizationId,
      userId,
    )
    if (!membership) throw this.notFound()
    return membership
  }

  private async isAdmin(organizationId: string, userId: string) {
    return Boolean(
      await this.policy.activeAdminMembership(organizationId, userId),
    )
  }

  private async validateOwnerMemberships(
    organizationId: Types.ObjectId,
    ids: string[],
  ) {
    if (ids.some((id) => !Types.ObjectId.isValid(id)))
      throw new BadRequestException({
        error: 'Select active organization operators only',
      })
    const memberships = await this.operatorsModel.find({
      _id: { $in: ids.map((id) => new Types.ObjectId(id)) },
      organizationId,
      status: MembershipStatus.ACTIVE,
    })
    if (memberships.length !== new Set(ids).size)
      throw new BadRequestException({
        error: 'Select active organization operators only',
      })
  }

  private configuredReceivingNumber() {
    const value = process.env.TEXTBEE_DEFAULT_RECEIVING_NUMBER
    if (!value) return null
    try {
      return this.normalizePhone(value)
    } catch {
      return null
    }
  }

  private resolveReceivingNumber(receivingNumberId: unknown) {
    if (receivingNumberId !== 'deployment-default')
      throw new BadRequestException({
        error: 'Select an available receiving number',
      })
    const number = this.configuredReceivingNumber()
    if (!number)
      throw new ServiceUnavailableException({
        error: 'Receiving number configuration is required',
      })
    return number
  }

  private normalizeName(value: unknown) {
    if (typeof value !== 'string')
      throw new BadRequestException({ error: 'Display name is required' })
    const normalized = value.trim()
    if (normalized.length < 1 || normalized.length > 100)
      throw new BadRequestException({
        error: 'Display name must contain 1 to 100 characters',
      })
    return normalized
  }

  private normalizeReason(value: unknown) {
    if (
      typeof value !== 'string' ||
      value.trim().length < 1 ||
      value.trim().length > 200
    )
      throw new BadRequestException({ error: 'A reason is required' })
    return value.trim()
  }

  private stringArray(value: unknown) {
    if (value === undefined) return []
    if (!Array.isArray(value) || value.some((item) => typeof item !== 'string'))
      throw new BadRequestException({ error: 'Owner selection is invalid' })
    return [...new Set(value as string[])]
  }

  private requireActive(group: Group) {
    if (group.status !== GroupStatus.ACTIVE)
      throw new ConflictException({ error: 'Archived groups are read-only' })
  }

  private async record(
    organizationId: Types.ObjectId,
    actorId: string,
    action: string,
    targetType: string,
    targetId: string,
    correlationId: string,
    priorState?: string,
    newState?: string,
    reason?: string,
  ) {
    await this.audit.updateOne(
      { organizationId, correlationId, action, targetId },
      {
        $setOnInsert: {
          organizationId,
          actorUserId: actorId,
          action,
          targetType,
          targetId,
          correlationId,
          priorState,
          newState,
          reason,
        },
      },
      { upsert: true },
    )
  }

  private formatPhone(value: string) {
    return `(${value.slice(2, 5)}) ${value.slice(5, 8)}-${value.slice(8)}`
  }
  private redactPhone(value: string) {
    return `***${value.slice(-4)}`
  }
  private input(value: unknown): Input {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Input)
      : {}
  }
  private actorId(actor: Actor) {
    const id = String(actor?._id ?? actor?.id ?? '')
    if (!Types.ObjectId.isValid(id))
      throw new BadRequestException({ error: 'Authenticated user is invalid' })
    return id
  }
  private objectId(id: string) {
    if (!Types.ObjectId.isValid(id)) throw this.notFound()
    return new Types.ObjectId(id)
  }
  private notFound() {
    return new NotFoundException({ error: 'Group not found' })
  }
  private codeConflict() {
    return new ConflictException({
      error: 'Join code is unavailable for the selected gateway number',
    })
  }
  private suppressionConflict(group: Group) {
    return new ConflictException({
      error: `This person opted out. Only the recipient can restore messaging by texting START, then JOIN ${group.joinCode}.`,
    })
  }
}
