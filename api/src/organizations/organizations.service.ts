import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { randomUUID } from 'crypto'
import { Model, Types } from 'mongoose'
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
import {
  OperatorMembership,
  OperatorMembershipDocument,
} from './schemas/operator-membership.schema'
import {
  Organization,
  OrganizationDocument,
} from './schemas/organization.schema'

type Actor = { _id?: Types.ObjectId | string; id?: string }

@Injectable()
export class OrganizationsService {
  constructor(
    @InjectModel(Organization.name)
    private readonly organizations: Model<Organization>,
    @InjectModel(OperatorMembership.name)
    private readonly memberships: Model<OperatorMembership>,
    @InjectModel(OperatorGrant.name)
    private readonly grants: Model<OperatorGrant>,
    @InjectModel(AuthorizationAuditEvent.name)
    private readonly auditEvents: Model<AuthorizationAuditEvent>,
    private readonly organizationPolicy: OrganizationPolicyService,
  ) {}

  async list(actor: Actor) {
    const actorId = this.actorId(actor)
    const organizations = await this.organizations
      .find()
      .sort({ displayName: 1, _id: 1 })
    const manageableIds =
      await this.organizationPolicy.manageableOrganizationIds(
        organizations.map((organization) => String(organization._id)),
        actorId,
      )
    return organizations.map((organization) =>
      this.registryView(
        organization,
        manageableIds.has(String(organization._id)),
      ),
    )
  }

  async create(
    actor: Actor,
    displayNameInput: unknown,
    idempotencyKeyInput: unknown,
    correlationId: string = randomUUID(),
  ) {
    const actorId = this.actorId(actor)
    const displayName = this.normalizeDisplayName(displayNameInput)
    const idempotencyKey = this.normalizeIdempotencyKey(idempotencyKeyInput)

    let organization = await this.organizations
      .findOne({ createdBy: actorId, provisioningKey: idempotencyKey })
      .select('+provisioningKey')
    if (organization && organization.displayName !== displayName) {
      throw new ConflictException({
        error: 'Idempotency key was already used for another organization name',
      })
    }
    if (!organization) {
      try {
        organization = await this.organizations.create({
          displayName,
          status: OrganizationStatus.PROVISIONING,
          createdBy: actorId,
          provisioningKey: idempotencyKey,
        })
      } catch (error) {
        if ((error as { code?: number }).code !== 11000) throw error
        organization = await this.organizations
          .findOne({ createdBy: actorId, provisioningKey: idempotencyKey })
          .select('+provisioningKey')
      }
    }
    if (!organization) throw new ServiceUnavailableException()
    return this.provision(organization, actorId, correlationId)
  }

  async retry(organizationId: string, correlationId: string = randomUUID()) {
    if (!Types.ObjectId.isValid(organizationId)) throw this.notFound()
    const organization = await this.organizations
      .findOne({
        _id: organizationId,
        status: {
          $in: [
            OrganizationStatus.PROVISIONING,
            OrganizationStatus.PROVISIONING_FAILED,
          ],
        },
      })
      .select('+provisioningKey')
    if (!organization) throw this.notFound()
    return this.provision(
      organization,
      String(organization.createdBy),
      correlationId,
    )
  }

  async profile(organizationId: string, actor: Actor) {
    const membership = await this.requireOrganizationAdmin(
      organizationId,
      actor,
    )
    const organization = await this.organizations.findOne({
      _id: organizationId,
      status: OrganizationStatus.ACTIVE,
    })
    if (!organization) throw this.notFound()
    return this.profileView(organization, membership)
  }

  async rename(
    organizationId: string,
    actor: Actor,
    displayNameInput: unknown,
    correlationId: string = randomUUID(),
  ) {
    const actorId = this.actorId(actor)
    const membership = await this.requireOrganizationAdmin(
      organizationId,
      actor,
    )
    const displayName = this.normalizeDisplayName(displayNameInput)
    const organization = await this.organizations.findOne({
      _id: organizationId,
      status: OrganizationStatus.ACTIVE,
    })
    if (!organization) throw this.notFound()
    if (organization.displayName === displayName) {
      return this.profileView(organization, membership)
    }

    const oldDisplayValue = organization.displayName
    organization.displayName = displayName
    await organization.save()
    await this.auditEvents.create({
      organizationId: organization._id,
      actorUserId: actorId,
      action: OrganizationAuditAction.ORGANIZATION_RENAMED,
      outcome: AuditOutcome.SUCCESS,
      targetType: Organization.name,
      targetId: String(organization._id),
      oldDisplayValue,
      newDisplayValue: displayName,
      correlationId,
      operationKey: randomUUID(),
    })
    return this.profileView(organization, membership)
  }

  private async provision(
    organization: OrganizationDocument,
    creatorId: string,
    correlationId: string,
  ) {
    if (organization.status === OrganizationStatus.ACTIVE) {
      const membership = await this.memberships.findOne({
        organizationId: organization._id,
        userId: creatorId,
        status: MembershipStatus.ACTIVE,
      })
      const [grant, creationAudit] = membership
        ? await Promise.all([
            this.grants.findOne({
              organizationId: organization._id,
              membershipId: membership._id,
              role: OrganizationRole.ORGANIZATION_ADMIN,
              status: GrantStatus.ACTIVE,
            }),
            this.auditEvents.findOne({
              organizationId: organization._id,
              action: OrganizationAuditAction.ORGANIZATION_CREATED,
              operationKey: organization.provisioningKey,
            }),
          ])
        : [null, null]
      if (membership && grant && creationAudit) {
        return this.creationView(organization, membership)
      }
      await this.organizations.updateOne(
        { _id: organization._id, status: OrganizationStatus.ACTIVE },
        { $set: { status: OrganizationStatus.PROVISIONING } },
      )
      organization.status = OrganizationStatus.PROVISIONING
    }

    const now = new Date()
    try {
      await this.memberships.updateOne(
        { organizationId: organization._id, userId: creatorId },
        {
          $setOnInsert: {
            organizationId: organization._id,
            userId: creatorId,
            status: MembershipStatus.ACTIVE,
            createdBy: creatorId,
            activatedAt: now,
          },
        },
        { upsert: true },
      )
      const membership = await this.memberships.findOne({
        organizationId: organization._id,
        userId: creatorId,
        status: MembershipStatus.ACTIVE,
      })
      if (!membership) throw new Error('membership-postcondition')

      await this.grants.updateOne(
        {
          organizationId: organization._id,
          membershipId: membership._id,
          role: OrganizationRole.ORGANIZATION_ADMIN,
        },
        {
          $setOnInsert: {
            organizationId: organization._id,
            membershipId: membership._id,
            role: OrganizationRole.ORGANIZATION_ADMIN,
            status: GrantStatus.ACTIVE,
            grantedBy: creatorId,
            grantedAt: now,
          },
        },
        { upsert: true },
      )
      const grant = await this.grants.findOne({
        organizationId: organization._id,
        membershipId: membership._id,
        role: OrganizationRole.ORGANIZATION_ADMIN,
        status: GrantStatus.ACTIVE,
      })
      if (!grant) throw new Error('grant-postcondition')

      await this.auditEvents.updateOne(
        {
          organizationId: organization._id,
          action: OrganizationAuditAction.ORGANIZATION_CREATED,
          operationKey: organization.provisioningKey,
        },
        {
          $setOnInsert: {
            organizationId: organization._id,
            actorUserId: creatorId,
            action: OrganizationAuditAction.ORGANIZATION_CREATED,
            outcome: AuditOutcome.SUCCESS,
            targetType: Organization.name,
            targetId: String(organization._id),
            newDisplayValue: organization.displayName,
            correlationId,
            operationKey: organization.provisioningKey,
          },
        },
        { upsert: true },
      )
      const creationAudit = await this.auditEvents.findOne({
        organizationId: organization._id,
        action: OrganizationAuditAction.ORGANIZATION_CREATED,
        operationKey: organization.provisioningKey,
      })
      if (!creationAudit) throw new Error('audit-postcondition')

      organization.status = OrganizationStatus.ACTIVE
      organization.activatedAt = organization.activatedAt ?? now
      organization.provisioningFailureCode = undefined
      await organization.save()
      return this.creationView(organization, membership)
    } catch {
      await this.organizations.updateOne(
        { _id: organization._id, status: { $ne: OrganizationStatus.ACTIVE } },
        {
          $set: {
            status: OrganizationStatus.PROVISIONING_FAILED,
            provisioningFailureCode: 'PROVISIONING_INCOMPLETE',
          },
        },
      )
      throw new ServiceUnavailableException({
        error: 'Organization provisioning did not complete',
      })
    }
  }

  private async requireOrganizationAdmin(organizationId: string, actor: Actor) {
    if (!Types.ObjectId.isValid(organizationId)) throw this.notFound()
    const membership = await this.organizationPolicy.activeAdminMembership(
      organizationId,
      this.actorId(actor),
    )
    if (!membership) throw this.notFound()
    return membership
  }

  private normalizeDisplayName(input: unknown): string {
    if (typeof input !== 'string') throw this.invalidName()
    const displayName = input.trim()
    const length = Array.from(displayName).length
    if (length < 2 || length > 100) throw this.invalidName()
    return displayName
  }

  private normalizeIdempotencyKey(input: unknown): string {
    if (typeof input !== 'string') throw this.invalidIdempotencyKey()
    const key = input.trim()
    if (key.length < 8 || key.length > 200 || /\s/.test(key)) {
      throw this.invalidIdempotencyKey()
    }
    return key
  }

  private actorId(actor: Actor): string {
    const actorId = String(actor?._id ?? actor?.id ?? '')
    if (!Types.ObjectId.isValid(actorId)) {
      throw new BadRequestException({ error: 'Authenticated user is invalid' })
    }
    return actorId
  }

  private registryView(
    organization: OrganizationDocument,
    canManageProfile: boolean,
  ) {
    return {
      id: String(organization._id),
      displayName: organization.displayName,
      status: organization.status,
      createdAt: organization.createdAt,
      activatedAt: organization.activatedAt ?? null,
      canManageProfile,
    }
  }

  private profileView(
    organization: OrganizationDocument,
    membership: OperatorMembershipDocument,
  ) {
    return {
      id: String(organization._id),
      displayName: organization.displayName,
      status: organization.status,
      createdAt: organization.createdAt,
      updatedAt: organization.updatedAt,
      activatedAt: organization.activatedAt ?? null,
      role: OrganizationRole.ORGANIZATION_ADMIN,
      membershipId: String(membership._id),
    }
  }

  private creationView(
    organization: OrganizationDocument,
    membership: OperatorMembershipDocument,
  ) {
    return {
      organization: this.registryView(organization, true),
      membership: membership
        ? {
            id: String(membership._id),
            role: OrganizationRole.ORGANIZATION_ADMIN,
            status: membership.status,
          }
        : null,
    }
  }

  private invalidName() {
    return new BadRequestException({
      error: 'Organization name must contain 2 to 100 characters',
      field: 'displayName',
    })
  }

  private invalidIdempotencyKey() {
    return new BadRequestException({
      error: 'A valid Idempotency-Key is required',
    })
  }

  private notFound() {
    return new NotFoundException({ error: 'Organization not found' })
  }
}
