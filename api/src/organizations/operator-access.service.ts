import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { InjectConnection, InjectModel } from '@nestjs/mongoose'
import { randomUUID } from 'crypto'
import { Connection, Model, Types } from 'mongoose'
import { GroupOwnerStatus, GroupSenderStatus } from '../groups/group.enums'
import { GroupOwnerAssignment } from '../groups/schemas/group-owner-assignment.schema'
import { GroupSenderAssignment } from '../groups/schemas/group-sender-assignment.schema'
import { Group } from '../groups/schemas/group.schema'
import { User } from '../users/schemas/user.schema'
import {
  AuditOutcome,
  GrantStatus,
  MembershipStatus,
  OrganizationAuditAction,
  OrganizationRole,
  OrganizationStatus,
} from './organization.enums'
import { OrganizationPolicyService } from './organization-policy.service'
import { AuthorizationAuditEvent } from './schemas/authorization-audit-event.schema'
import { OperatorGrant } from './schemas/operator-grant.schema'
import { OperatorMembership } from './schemas/operator-membership.schema'
import { Organization } from './schemas/organization.schema'

type Actor = { _id?: Types.ObjectId | string; id?: string }

@Injectable()
export class OperatorAccessService {
  constructor(
    @InjectConnection() private readonly connection: Connection,
    @InjectModel(Organization.name)
    private readonly organizations: Model<Organization>,
    @InjectModel(OperatorMembership.name)
    private readonly memberships: Model<OperatorMembership>,
    @InjectModel(OperatorGrant.name)
    private readonly grants: Model<OperatorGrant>,
    @InjectModel(AuthorizationAuditEvent.name)
    private readonly audits: Model<AuthorizationAuditEvent>,
    @InjectModel(User.name) private readonly users: Model<User>,
    @InjectModel(Group.name) private readonly groups: Model<Group>,
    @InjectModel(GroupOwnerAssignment.name)
    private readonly owners: Model<GroupOwnerAssignment>,
    @InjectModel(GroupSenderAssignment.name)
    private readonly senders: Model<GroupSenderAssignment>,
    private readonly policy: OrganizationPolicyService,
  ) {}

  async list(
    organizationId: string,
    actor: Actor,
    statusInput?: string,
    adminInput?: string,
  ) {
    await this.requireAdmin(organizationId, actor)
    const status = statusInput
      ? this.enumValue(MembershipStatus, statusInput, 'status')
      : undefined
    const query: Record<string, unknown> = {
      organizationId: this.objectId(organizationId),
    }
    if (status) query.status = status
    const memberships = await this.memberships
      .find(query)
      .sort({ changedAt: -1 })
    const membershipIds = memberships.map((item) => item._id)
    const [users, grants, owners, senders, groups] = await Promise.all([
      this.users.find({ _id: { $in: memberships.map((item) => item.userId) } }),
      this.grants.find({
        organizationId: this.objectId(organizationId),
        membershipId: { $in: membershipIds },
        role: OrganizationRole.ORGANIZATION_ADMIN,
        status: GrantStatus.ACTIVE,
      }),
      this.owners.find({
        organizationId: this.objectId(organizationId),
        membershipId: { $in: membershipIds },
        status: GroupOwnerStatus.ACTIVE,
      }),
      this.senders.find({
        organizationId: this.objectId(organizationId),
        membershipId: { $in: membershipIds },
        status: GroupSenderStatus.ACTIVE,
      }),
      this.groups.find({ organizationId: this.objectId(organizationId) }),
    ])
    const usersById = new Map(users.map((user) => [String(user._id), user]))
    const admins = new Set(grants.map((grant) => String(grant.membershipId)))
    const groupNames = new Map(
      groups.map((group) => [String(group._id), group.displayName]),
    )
    const assignments = (
      items: Array<{ membershipId: Types.ObjectId; groupId: Types.ObjectId }>,
    ) => {
      const byMembership = new Map<string, string[]>()
      for (const item of items) {
        const id = String(item.membershipId)
        byMembership.set(id, [
          ...(byMembership.get(id) ?? []),
          groupNames.get(String(item.groupId)) ?? 'Unavailable group',
        ])
      }
      return byMembership
    }
    const ownerGroups = assignments(owners)
    const senderGroups = assignments(senders)
    return memberships
      .filter((membership) => {
        if (adminInput === 'true') return admins.has(String(membership._id))
        if (adminInput === 'false') return !admins.has(String(membership._id))
        return true
      })
      .map((membership) => {
        const user = usersById.get(String(membership.userId))
        return {
          membershipId: String(membership._id),
          displayName: user?.name || 'Approved operator',
          email: user?.email,
          status: membership.status,
          organizationAdmin: admins.has(String(membership._id)),
          groupOwners: ownerGroups.get(String(membership._id)) ?? [],
          groupSenders: senderGroups.get(String(membership._id)) ?? [],
          changedAt: membership.changedAt ?? membership.activatedAt,
          reason: membership.reason ?? null,
        }
      })
  }

  async add(organizationId: string, actor: Actor, input: unknown) {
    const actorId = this.actorId(actor)
    await this.requireAdmin(organizationId, actor)
    const { email, reason } = this.addInput(input)
    const user = await this.users.findOne({ email, isBanned: { $ne: true } })
    if (!user) throw this.operatorUnavailable()
    const organizationObjectId = this.objectId(organizationId)
    const existing = await this.memberships.findOne({
      organizationId: organizationObjectId,
      userId: user._id,
    })
    if (existing?.status === MembershipStatus.ACTIVE) {
      return { membershipId: String(existing._id), status: existing.status }
    }
    const now = new Date()
    await this.memberships.updateOne(
      { organizationId: organizationObjectId, userId: user._id },
      {
        $set: {
          status: MembershipStatus.ACTIVE,
          activatedAt: now,
          changedAt: now,
          changedBy: this.objectId(actorId),
          reason,
        },
        $unset: { suspendedAt: 1, revokedAt: 1 },
        $setOnInsert: {
          organizationId: organizationObjectId,
          userId: user._id,
          createdBy: this.objectId(actorId),
        },
      },
      { upsert: true },
    )
    const membership = await this.memberships.findOne({
      organizationId: organizationObjectId,
      userId: user._id,
      status: MembershipStatus.ACTIVE,
    })
    if (!membership) throw this.operatorUnavailable()
    await this.audit(
      organizationObjectId,
      actorId,
      existing
        ? OrganizationAuditAction.OPERATOR_REACTIVATED
        : OrganizationAuditAction.OPERATOR_ADDED,
      String(membership._id),
      existing?.status ?? 'ABSENT',
      MembershipStatus.ACTIVE,
      reason,
    )
    return { membershipId: String(membership._id), status: membership.status }
  }

  async changeStatus(
    organizationId: string,
    membershipId: string,
    actor: Actor,
    nextStatusInput: string,
    input: unknown,
  ) {
    const actorId = this.actorId(actor)
    await this.requireAdmin(organizationId, actor)
    const nextStatus = this.enumValue(
      MembershipStatus,
      nextStatusInput,
      'status',
    )
    const reason = this.reason(input)
    const organizationObjectId = this.objectId(organizationId)
    const membershipObjectId = this.objectId(membershipId)
    let denied = false
    let result: { membershipId: string; status: MembershipStatus } | undefined

    await this.connection.transaction(async (session) => {
      await this.organizations.updateOne(
        { _id: organizationObjectId, status: OrganizationStatus.ACTIVE },
        { $inc: { authorizationRevision: 1 } },
        { session },
      )
      const membership = await this.memberships
        .findOne({
          _id: membershipObjectId,
          organizationId: organizationObjectId,
        })
        .session(session)
      if (!membership) throw this.operatorUnavailable()
      if (membership.status === nextStatus) {
        result = { membershipId, status: nextStatus }
        return
      }
      const removesAccess =
        nextStatus === MembershipStatus.SUSPENDED ||
        nextStatus === MembershipStatus.REVOKED
      if (removesAccess && (await this.isActiveAdmin(membership, session))) {
        denied = !(await this.otherUsableAdminExists(
          organizationObjectId,
          membershipObjectId,
          session,
        ))
      }
      const action = this.membershipAction(nextStatus)
      if (denied) {
        await this.audit(
          organizationObjectId,
          actorId,
          action,
          membershipId,
          membership.status,
          nextStatus,
          reason,
          AuditOutcome.DENIED,
          session,
        )
        return
      }
      const now = new Date()
      const oldStatus = membership.status
      membership.status = nextStatus
      membership.changedAt = now
      membership.changedBy = this.objectId(actorId)
      membership.reason = reason
      membership.activatedAt =
        nextStatus === MembershipStatus.ACTIVE ? now : membership.activatedAt
      membership.suspendedAt =
        nextStatus === MembershipStatus.SUSPENDED ? now : undefined
      membership.revokedAt =
        nextStatus === MembershipStatus.REVOKED ? now : undefined
      await membership.save({ session })
      await this.audit(
        organizationObjectId,
        actorId,
        action,
        membershipId,
        oldStatus,
        nextStatus,
        reason,
        AuditOutcome.SUCCESS,
        session,
      )
      result = { membershipId, status: nextStatus }
    })
    if (denied) throw this.lastAdministrator()
    return result
  }

  async changeAdmin(
    organizationId: string,
    membershipId: string,
    actor: Actor,
    enabled: boolean,
    input: unknown,
  ) {
    const actorId = this.actorId(actor)
    await this.requireAdmin(organizationId, actor)
    const reason = this.reason(input)
    const organizationObjectId = this.objectId(organizationId)
    const membershipObjectId = this.objectId(membershipId)
    let denied = false
    await this.connection.transaction(async (session) => {
      await this.organizations.updateOne(
        { _id: organizationObjectId, status: OrganizationStatus.ACTIVE },
        { $inc: { authorizationRevision: 1 } },
        { session },
      )
      const membership = await this.memberships
        .findOne({
          _id: membershipObjectId,
          organizationId: organizationObjectId,
          status: MembershipStatus.ACTIVE,
        })
        .session(session)
      if (!membership) throw this.operatorUnavailable()
      const grant = await this.grants
        .findOne({
          organizationId: organizationObjectId,
          membershipId: membershipObjectId,
          role: OrganizationRole.ORGANIZATION_ADMIN,
        })
        .session(session)
      const currentlyEnabled = grant?.status === GrantStatus.ACTIVE
      if (currentlyEnabled === enabled) return
      if (
        !enabled &&
        !(await this.otherUsableAdminExists(
          organizationObjectId,
          membershipObjectId,
          session,
        ))
      ) {
        denied = true
      }
      const action = enabled
        ? OrganizationAuditAction.ORGANIZATION_ADMIN_GRANTED
        : OrganizationAuditAction.ORGANIZATION_ADMIN_REVOKED
      if (denied) {
        await this.audit(
          organizationObjectId,
          actorId,
          action,
          membershipId,
          'ACTIVE',
          'REVOKED',
          reason,
          AuditOutcome.DENIED,
          session,
        )
        return
      }
      const now = new Date()
      await this.grants.updateOne(
        {
          organizationId: organizationObjectId,
          membershipId: membershipObjectId,
          role: OrganizationRole.ORGANIZATION_ADMIN,
        },
        {
          $set: {
            status: enabled ? GrantStatus.ACTIVE : GrantStatus.REVOKED,
            changedBy: this.objectId(actorId),
            changedAt: now,
            reason,
            ...(enabled ? { grantedAt: now } : { revokedAt: now }),
          },
          ...(enabled ? { $unset: { revokedAt: 1 } } : {}),
          $setOnInsert: {
            organizationId: organizationObjectId,
            membershipId: membershipObjectId,
            role: OrganizationRole.ORGANIZATION_ADMIN,
            grantedBy: this.objectId(actorId),
          },
        },
        { upsert: enabled, session },
      )
      await this.audit(
        organizationObjectId,
        actorId,
        action,
        membershipId,
        currentlyEnabled ? 'ACTIVE' : 'ABSENT',
        enabled ? 'ACTIVE' : 'REVOKED',
        reason,
        AuditOutcome.SUCCESS,
        session,
      )
    })
    if (denied) throw this.lastAdministrator()
    return { membershipId, organizationAdmin: enabled }
  }

  private async otherUsableAdminExists(
    organizationId: Types.ObjectId,
    excludedMembershipId: Types.ObjectId,
    session: import('mongoose').ClientSession,
  ) {
    const grants = await this.grants
      .find({
        organizationId,
        membershipId: { $ne: excludedMembershipId },
        role: OrganizationRole.ORGANIZATION_ADMIN,
        status: GrantStatus.ACTIVE,
      })
      .session(session)
    if (!grants.length) return false
    return Boolean(
      await this.memberships
        .exists({
          _id: { $in: grants.map((grant) => grant.membershipId) },
          organizationId,
          status: MembershipStatus.ACTIVE,
        })
        .session(session),
    )
  }

  private async isActiveAdmin(
    membership: OperatorMembership,
    session: import('mongoose').ClientSession,
  ) {
    if (membership.status !== MembershipStatus.ACTIVE) return false
    return Boolean(
      await this.grants
        .exists({
          organizationId: membership.organizationId,
          membershipId: membership._id,
          role: OrganizationRole.ORGANIZATION_ADMIN,
          status: GrantStatus.ACTIVE,
        })
        .session(session),
    )
  }

  private async audit(
    organizationId: Types.ObjectId,
    actorId: string,
    action: OrganizationAuditAction,
    targetId: string,
    oldState: string,
    newState: string,
    reason: string,
    outcome = AuditOutcome.SUCCESS,
    session?: import('mongoose').ClientSession,
  ) {
    await this.audits.create(
      [
        {
          organizationId,
          actorUserId: this.objectId(actorId),
          action,
          outcome,
          targetType: OperatorMembership.name,
          targetId,
          oldState,
          newState,
          reason,
          correlationId: randomUUID(),
          operationKey: randomUUID(),
        },
      ],
      session ? { session } : undefined,
    )
  }

  private async requireAdmin(organizationId: string, actor: Actor) {
    const organizationObjectId = this.objectId(organizationId)
    const membership = await this.policy.activeAdminMembership(
      String(organizationObjectId),
      this.actorId(actor),
    )
    if (!membership)
      throw new NotFoundException({ error: 'Organization not found' })
    return membership
  }

  private membershipAction(status: MembershipStatus) {
    if (status === MembershipStatus.ACTIVE)
      return OrganizationAuditAction.OPERATOR_REACTIVATED
    if (status === MembershipStatus.SUSPENDED)
      return OrganizationAuditAction.OPERATOR_SUSPENDED
    return OrganizationAuditAction.OPERATOR_REVOKED
  }

  private addInput(input: unknown) {
    const record = this.record(input)
    const email =
      typeof record.email === 'string' ? record.email.trim().toLowerCase() : ''
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
      throw new BadRequestException({
        error: 'A valid exact email is required',
        field: 'email',
      })
    return { email, reason: this.reason(input) }
  }

  private reason(input: unknown) {
    const value = this.record(input).reason
    const reason = typeof value === 'string' ? value.trim() : ''
    if (reason.length < 2 || reason.length > 500)
      throw new BadRequestException({
        error: 'A reason of 2 to 500 characters is required',
        field: 'reason',
      })
    return reason
  }

  private record(input: unknown): Record<string, unknown> {
    return input && typeof input === 'object'
      ? (input as Record<string, unknown>)
      : {}
  }

  private enumValue<T extends Record<string, string>>(
    values: T,
    input: string,
    field: string,
  ): T[keyof T] {
    if (!Object.values(values).includes(input))
      throw new BadRequestException({ error: `Invalid ${field}`, field })
    return input as T[keyof T]
  }

  private actorId(actor: Actor) {
    const value = String(actor?._id ?? actor?.id ?? '')
    if (!Types.ObjectId.isValid(value))
      throw new BadRequestException({ error: 'Authenticated user is invalid' })
    return value
  }

  private objectId(value: string) {
    if (!Types.ObjectId.isValid(value))
      throw new NotFoundException({ error: 'Organization resource not found' })
    return new Types.ObjectId(value)
  }

  private operatorUnavailable() {
    return new NotFoundException({
      error: 'Operator could not be added or changed',
    })
  }

  private lastAdministrator() {
    return new ConflictException({
      error:
        'Another active organization administrator is required before this change',
      code: 'LAST_USABLE_ORGANIZATION_ADMIN',
    })
  }
}
