import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common'
import { InjectConnection, InjectModel } from '@nestjs/mongoose'
import { JwtService } from '@nestjs/jwt'
import { ClientSession, Connection, Model, Types } from 'mongoose'
import { createHash } from 'crypto'
import {
  ACCESS_REQUEST,
  ADMISSION_AUDIT,
  AccessRequest,
} from './schemas/access-request.schema'
import { OAuthApproval } from './schemas/oauth-approval.schema'
import { OAuthIdentityBinding } from './schemas/oauth-identity-binding.schema'
import { ApiKey } from '../schemas/api-key.schema'
import { User } from '../../users/schemas/user.schema'
import { UserRole } from '../../users/user-roles.enum'
import { Organization } from '../../organizations/schemas/organization.schema'
import { OperatorMembership } from '../../organizations/schemas/operator-membership.schema'
import { OperatorGrant } from '../../organizations/schemas/operator-grant.schema'
import { Group } from '../../groups/schemas/group.schema'
import { GroupOwnerAssignment } from '../../groups/schemas/group-owner-assignment.schema'
import { GroupSenderAssignment } from '../../groups/schemas/group-sender-assignment.schema'
import { VerifiedOAuthIdentity } from './oauth-provider.types'
import { AdmissionDecision } from './access-request.dto'

export const ONBOARDING_AUDIENCE = 'textbee-onboarding'
@Injectable()
export class AccessRequestService {
  constructor(
    @InjectConnection() private readonly connection: Connection,
    private readonly jwt: JwtService,
    @InjectModel(ApiKey.name) private readonly apiKeys: Model<any>,
    @InjectModel(ACCESS_REQUEST)
    private readonly requests: Model<AccessRequest>,
    @InjectModel(ADMISSION_AUDIT) private readonly audits: Model<any>,
    @InjectModel(OAuthApproval.name) private readonly approvals: Model<any>,
    @InjectModel(OAuthIdentityBinding.name)
    private readonly bindings: Model<any>,
    @InjectModel(User.name) private readonly users: Model<any>,
    @InjectModel(Organization.name) private readonly organizations: Model<any>,
    @InjectModel(OperatorMembership.name)
    private readonly memberships: Model<any>,
    @InjectModel(OperatorGrant.name) private readonly grants: Model<any>,
    @InjectModel(Group.name) private readonly groups: Model<any>,
    @InjectModel(GroupOwnerAssignment.name) private readonly owners: Model<any>,
    @InjectModel(GroupSenderAssignment.name)
    private readonly senders: Model<any>,
  ) {}

  // Called only with an identity returned by the verified provider registry.
  async applicantSession(identity: VerifiedOAuthIdentity) {
    const approval = await this.approvals.findOne({
      providerKey: identity.providerKey,
      normalizedEmail: identity.normalizedEmail,
    })
    if (approval && approval.state !== 'REVOKED') return null // Existing admission/legacy binding flow.
    const binding = await this.bindings.findOne({
      providerKey: identity.providerKey,
      providerSubject: identity.subject,
    })
    if (
      (binding && String(binding.approvalId) !== String(approval?._id)) ||
      (approval?.boundSubject && approval.boundSubject !== identity.subject)
    )
      throw new UnauthorizedException()
    const user = await this.users.findOne({ email: identity.normalizedEmail })
    if (
      user &&
      (!approval ||
        user.isBanned ||
        String(approval.userId) !== String(user._id))
    )
      throw new UnauthorizedException()
    let request
    try {
      request = await this.requests.findOneAndUpdate(
        { provider: identity.providerKey, subject: identity.subject },
        {
          $setOnInsert: {
            email: identity.normalizedEmail,
            name: identity.name || identity.normalizedEmail.split('@')[0],
            state: approval ? 'REVOKED' : 'PENDING',
            userId: approval?.userId,
          },
        },
        { upsert: true, new: true },
      )
    } catch (error) {
      if (error.code !== 11000) throw error
      request = await this.requests.findOne({
        provider: identity.providerKey,
        subject: identity.subject,
      })
    }
    if (!request || request.email !== identity.normalizedEmail)
      throw new UnauthorizedException()
    return {
      user: {
        _id: `request:${request.id}`,
        name: request.name,
        email: request.email,
        admission: 'onboarding',
      },
      accessToken: this.jwt.sign(
        { purpose: 'onboarding', requestId: request.id },
        { audience: ONBOARDING_AUDIENCE, expiresIn: '30m' },
      ),
    }
  }

  applicantId(token: string) {
    try {
      const claims = this.jwt.verify(token, { audience: ONBOARDING_AUDIENCE })
      if (
        claims.purpose !== 'onboarding' ||
        claims.sub ||
        !Types.ObjectId.isValid(claims.requestId)
      )
        throw new Error()
      return claims.requestId as string
    } catch {
      throw new UnauthorizedException()
    }
  }

  async status(token: string) {
    const request = await this.requests.findById(this.applicantId(token))
    if (!request) throw new UnauthorizedException()
    const approval = await this.approvals.findOne({
      providerKey: request.provider,
      normalizedEmail: request.email,
    })
    const user = approval?.userId
      ? await this.users.findById(approval.userId)
      : null
    const state =
      approval?.state === 'REVOKED' || user?.isBanned
        ? 'REVOKED'
        : request.state
    return { state }
  }

  requireAdmin(actor: any) {
    if (!actor || actor.role !== UserRole.ADMIN || actor.isBanned)
      throw new ForbiddenException()
  }
  async list(actor: any, page = 1) {
    this.requireAdmin(actor)
    if (!Number.isInteger(page) || page < 1 || page > 10000)
      throw new BadRequestException()
    const items = await this.requests
      .find()
      .sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * 25)
      .limit(26)
      .lean()
    return {
      items: items
        .slice(0, 25)
        .map(({ _id, name, email, state, version, createdAt }) => ({
          id: String(_id),
          name,
          email,
          state,
          version,
          createdAt,
        })),
      hasMore: items.length > 25,
    }
  }
  async options(actor: any, organizationId?: string) {
    this.requireAdmin(actor)
    if (organizationId) {
      if (!Types.ObjectId.isValid(organizationId))
        throw new BadRequestException()
      return this.groups
        .find({ organizationId, status: 'ACTIVE' })
        .select('_id displayName')
        .sort({ displayName: 1 })
        .lean()
    }
    return this.organizations
      .find({ status: 'ACTIVE' })
      .select('_id displayName')
      .sort({ displayName: 1 })
      .lean()
  }

  async decide(actor: any, id: string, input: AdmissionDecision) {
    this.requireAdmin(actor)
    if (!Types.ObjectId.isValid(id) || !input.reason?.trim())
      throw new BadRequestException()
    const selected = [...(input.groups || [])].sort((a, b) =>
      a.groupId.localeCompare(b.groupId),
    )
    if (new Set(selected.map((g) => g.groupId)).size !== selected.length)
      throw new BadRequestException('Select each group once')
    const key = createHash('sha256')
      .update(
        JSON.stringify({
          actor: String(actor._id),
          ...input,
          groups: selected,
        }),
      )
      .digest('hex')
    return this.connection.transaction(async (session) => {
      const request = await this.requests.findById(id).session(session)
      if (!request) throw new NotFoundException()
      if (request.decisionKey === key)
        return { state: request.state, version: request.version }
      if (request.version !== input.version)
        throw new ConflictException(
          'Request changed. Refresh and review it again.',
        )
      let approval = await this.approvals
        .findOne({
          providerKey: request.provider,
          normalizedEmail: request.email,
        })
        .session(session)
      // Platform administrator lifecycle remains in the invariant-protected recovery tools.
      if (approval?.role === UserRole.ADMIN)
        throw new ConflictException(
          'Use platform administrator recovery tools for this account',
        )
      if (approval?.boundSubject && approval.boundSubject !== request.subject)
        throw new ConflictException('Identity requires administrator recovery')
      const currentUser = approval?.userId
        ? await this.users.findById(approval.userId).session(session)
        : null
      if (currentUser?.isBanned || currentUser?.role === UserRole.ADMIN)
        throw new ConflictException('Account requires administrator recovery')
      const now = new Date()
      if (input.action === 'approve') {
        if (!['PENDING', 'REVOKED'].includes(request.state))
          throw new ConflictException('Reconsider this request before approval')
        if (
          !input.organizationId ||
          !Types.ObjectId.isValid(input.organizationId)
        )
          throw new BadRequestException('Choose an organization')
        const org = await this.organizations.findOneAndUpdate(
          { _id: input.organizationId, status: 'ACTIVE' },
          { $inc: { authorizationRevision: 1 } },
          { session, new: true },
        )
        if (!org)
          throw new ConflictException('Organization is no longer active')
        for (const grant of selected) {
          // Write locks serialize admission against group archival.
          const group = await this.groups.findOneAndUpdate(
            { _id: grant.groupId, organizationId: org._id, status: 'ACTIVE' },
            { $set: { updatedAt: now } },
            { session, new: true },
          )
          if (!group)
            throw new ConflictException(
              'A selected group is no longer available',
            )
        }
        let user = currentUser
        if (!user) {
          if (
            (approval &&
              (approval.boundSubject ||
                approval.userId ||
                approval.state !== 'REVOKED')) ||
            (await this.users
              .exists({ email: request.email })
              .session(session)) ||
            (await this.bindings
              .exists({
                providerKey: request.provider,
                providerSubject: request.subject,
              })
              .session(session))
          )
            throw new ConflictException(
              'Identity requires administrator recovery',
            )
          ;[user] = await this.users.create(
            [
              {
                email: request.email,
                name: request.name,
                role: UserRole.REGULAR,
                emailVerifiedAt: now,
              },
            ],
            { session },
          )
          const values = {
            providerKey: request.provider,
            normalizedEmail: request.email,
            role: UserRole.REGULAR,
            state: 'BOUND',
            boundSubject: request.subject,
            userId: user._id,
            boundAt: now,
            approvedAt: now,
            actorKind: 'PLATFORM_ADMIN',
            actorUserId: actor._id,
            reason: input.reason,
            authorizationRevision: (approval?.authorizationRevision || 0) + 1,
          }
          if (approval) {
            Object.assign(approval, values)
            approval.revokedAt = undefined
            await approval.save({ session })
          } else {
            ;[approval] = await this.approvals.create([values], { session })
          }
          await this.bindings.create(
            [
              {
                providerKey: request.provider,
                providerSubject: request.subject,
                approvalId: approval._id,
                userId: user._id,
                boundAt: now,
              },
            ],
            { session },
          )
        } else {
          const binding = await this.bindings
            .findOne({
              approvalId: approval._id,
              userId: user._id,
              providerSubject: request.subject,
              providerKey: request.provider,
            })
            .session(session)
          if (!binding)
            throw new ConflictException(
              'Identity requires administrator recovery',
            )
          if (request.state === 'REVOKED')
            await this.removeUserAccess(
              user._id,
              actor._id,
              input.reason,
              session,
            )
          approval.state = 'BOUND'
          approval.authorizationRevision += 1
          approval.approvedAt = now
          approval.revokedAt = undefined
          approval.actorKind = 'PLATFORM_ADMIN'
          approval.actorUserId = actor._id
          approval.reason = input.reason
          await approval.save({ session })
        }
        const member = await this.memberships.findOneAndUpdate(
          { organizationId: org._id, userId: user._id },
          {
            $set: {
              status: 'ACTIVE',
              changedAt: now,
              changedBy: actor._id,
              activatedAt: now,
              reason: input.reason,
            },
            $setOnInsert: { createdBy: actor._id },
            $unset: { revokedAt: 1, suspendedAt: 1 },
          },
          { upsert: true, new: true, session },
        )
        for (const grant of selected) {
          const model = grant.role === 'owner' ? this.owners : this.senders
          await model.updateOne(
            {
              organizationId: org._id,
              groupId: grant.groupId,
              membershipId: member._id,
            },
            {
              $set: {
                status: 'ACTIVE',
                changedBy: actor._id,
                changedAt: now,
                reason: input.reason,
              },
            },
            { upsert: true, session },
          )
        }
        request.userId = user._id
        request.state = 'APPROVED'
      } else if (input.action === 'reject') {
        if (request.state !== 'PENDING')
          throw new ConflictException('Only pending requests can be rejected')
        request.state = 'REJECTED'
      } else if (input.action === 'reconsider') {
        if (request.state !== 'REJECTED')
          throw new ConflictException(
            'Only rejected requests can be reconsidered',
          )
        request.state = 'PENDING'
      } else if (input.action === 'revoke') {
        if (request.state !== 'APPROVED' || !approval)
          throw new ConflictException('Only approved requests can be revoked')
        approval.state = 'REVOKED'
        approval.authorizationRevision += 1
        approval.revokedAt = now
        approval.actorKind = 'PLATFORM_ADMIN'
        approval.actorUserId = actor._id
        approval.reason = input.reason
        await approval.save({ session })
        await this.removeUserAccess(
          request.userId,
          actor._id,
          input.reason,
          session,
        )
        request.state = 'REVOKED'
      } else throw new BadRequestException()
      request.version += 1
      request.decisionKey = key
      await request.save({ session })
      await this.audits.create(
        [
          {
            requestId: request._id,
            actorId: actor._id,
            action: input.action,
            reason: input.reason.trim(),
            grants:
              input.action === 'approve'
                ? { organizationId: input.organizationId, groups: selected }
                : undefined,
          },
        ],
        { session },
      )
      return { state: request.state, version: request.version }
    })
  }
  private async removeUserAccess(
    userId: Types.ObjectId,
    actorId: Types.ObjectId,
    reason: string,
    session: ClientSession,
  ) {
    const now = new Date()
    await this.apiKeys.updateMany(
      {
        user: userId,
        purpose: { $ne: 'GATEWAY' },
        revokedAt: { $exists: false },
      },
      { $set: { revokedAt: now, revokedBy: actorId } },
      { session },
    )
    const memberships = await this.memberships
      .find({ userId: userId })
      .session(session)
    const ids = memberships.map((m) => m._id)
    await this.organizations.updateMany(
      { _id: { $in: memberships.map((m) => m.organizationId) } },
      { $inc: { authorizationRevision: 1 } },
      { session },
    )
    for (const member of memberships.filter((m) => m.status === 'ACTIVE')) {
      const adminGrant = await this.grants
        .exists({
          membershipId: member._id,
          role: 'ORGANIZATION_ADMIN',
          status: 'ACTIVE',
        })
        .session(session)
      if (!adminGrant) continue
      const otherGrants = await this.grants
        .find({
          organizationId: member.organizationId,
          membershipId: { $nin: ids },
          role: 'ORGANIZATION_ADMIN',
          status: 'ACTIVE',
        })
        .session(session)
      const otherAdmin = await this.memberships
        .exists({
          _id: { $in: otherGrants.map((g) => g.membershipId) },
          organizationId: member.organizationId,
          status: 'ACTIVE',
        })
        .session(session)
      if (!otherAdmin)
        throw new ConflictException(
          'Assign another organization administrator before revoking this user',
        )
    }
    await this.memberships.updateMany(
      { _id: { $in: ids } },
      {
        $set: {
          status: 'REVOKED',
          revokedAt: now,
          changedAt: now,
          changedBy: actorId,
          reason: reason,
        },
      },
      { session },
    )
    for (const model of [this.grants, this.owners, this.senders])
      await model.updateMany(
        { membershipId: { $in: ids } },
        {
          $set: {
            status: 'REVOKED',
            changedAt: now,
            changedBy: actorId,
            reason: reason,
          },
        },
        { session },
      )
  }
}
