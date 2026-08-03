import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model, Types } from 'mongoose'
import {
  GrantStatus,
  MembershipStatus,
  OrganizationCapability,
  OrganizationContextState,
  OrganizationRole,
  OrganizationStatus,
} from './organization.enums'
import { OperatorGrant } from './schemas/operator-grant.schema'
import { OperatorMembership } from './schemas/operator-membership.schema'
import { Organization } from './schemas/organization.schema'

type Actor = { _id?: Types.ObjectId | string; id?: string }

@Injectable()
export class OrganizationContextService {
  constructor(
    @InjectModel(Organization.name)
    private readonly organizations: Model<Organization>,
    @InjectModel(OperatorMembership.name)
    private readonly memberships: Model<OperatorMembership>,
    @InjectModel(OperatorGrant.name)
    private readonly grants: Model<OperatorGrant>,
  ) {}

  async current(actor: Actor, authenticatedWithApiKey = false) {
    if (authenticatedWithApiKey) {
      throw new ForbiddenException({ error: 'Forbidden' })
    }
    const userId = this.actorId(actor)
    const memberships = await this.memberships.find({
      userId: new Types.ObjectId(userId),
      status: MembershipStatus.ACTIVE,
    })
    if (memberships.length === 0) {
      return this.emptyContext(OrganizationContextState.NO_ACCESS)
    }

    const organizationIds = memberships.map(
      (membership) => membership.organizationId,
    )
    const organizations = await this.organizations.find({
      _id: { $in: organizationIds },
      status: OrganizationStatus.ACTIVE,
    })
    const organizationsById = new Map(
      organizations
        .filter(
          (organization) => organization.status === OrganizationStatus.ACTIVE,
        )
        .map((organization) => [String(organization._id), organization]),
    )
    const activeMemberships = memberships.filter(
      (membership) =>
        membership.status === MembershipStatus.ACTIVE &&
        organizationsById.has(String(membership.organizationId)),
    )

    if (activeMemberships.length === 0) {
      return this.emptyContext(OrganizationContextState.NO_ACCESS)
    }
    if (activeMemberships.length > 1) {
      return this.emptyContext(OrganizationContextState.SELECTION_REQUIRED)
    }

    const membership = activeMemberships[0]
    const organization = organizationsById.get(
      String(membership.organizationId),
    )!
    const grants = await this.grants.find({
      organizationId: organization._id,
      membershipId: membership._id,
      status: GrantStatus.ACTIVE,
    })
    const roles = new Set(
      grants
        .filter((grant) => grant.status === GrantStatus.ACTIVE)
        .map((grant) => String(grant.role)),
    )
    const capabilities = new Set<OrganizationCapability>()
    if (roles.has(OrganizationRole.ORGANIZATION_ADMIN)) {
      capabilities.add(OrganizationCapability.PROFILE_MANAGE)
    }

    return {
      state: OrganizationContextState.ACTIVE,
      organization: {
        id: String(organization._id),
        displayName: organization.displayName,
      },
      membership: {
        id: String(membership._id),
        status: MembershipStatus.ACTIVE,
      },
      capabilities: [...capabilities].sort(),
      roleLabel: roles.has(OrganizationRole.ORGANIZATION_ADMIN)
        ? 'Organization administrator'
        : 'Organization member',
    }
  }

  private emptyContext(state: OrganizationContextState) {
    return {
      state,
      organization: null,
      membership: null,
      capabilities: [],
      roleLabel: null,
    }
  }

  private actorId(actor: Actor): string {
    const actorId = String(actor?._id ?? actor?.id ?? '')
    if (!Types.ObjectId.isValid(actorId)) {
      throw new BadRequestException({ error: 'Authenticated user is invalid' })
    }
    return actorId
  }
}
