import { Injectable } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model, Types } from 'mongoose'
import {
  GrantStatus,
  MembershipStatus,
  OrganizationRole,
} from './organization.enums'
import { OperatorGrant } from './schemas/operator-grant.schema'
import { OperatorMembership } from './schemas/operator-membership.schema'

@Injectable()
export class OrganizationPolicyService {
  constructor(
    @InjectModel(OperatorMembership.name)
    private readonly memberships: Model<OperatorMembership>,
    @InjectModel(OperatorGrant.name)
    private readonly grants: Model<OperatorGrant>,
  ) {}

  async activeAdminMembership(organizationId: string, userId: string) {
    if (
      !Types.ObjectId.isValid(organizationId) ||
      !Types.ObjectId.isValid(userId)
    ) {
      return null
    }
    const organizationObjectId = new Types.ObjectId(organizationId)
    const userObjectId = new Types.ObjectId(userId)
    const membership = await this.memberships.findOne({
      organizationId: organizationObjectId,
      userId: userObjectId,
      status: MembershipStatus.ACTIVE,
    })
    if (!membership) return null

    const grant = await this.grants.findOne({
      organizationId: organizationObjectId,
      membershipId: membership._id,
      role: OrganizationRole.ORGANIZATION_ADMIN,
      status: GrantStatus.ACTIVE,
    })
    return grant ? membership : null
  }

  async manageableOrganizationIds(organizationIds: string[], userId: string) {
    if (!Types.ObjectId.isValid(userId) || organizationIds.length === 0) {
      return new Set<string>()
    }
    const memberships = await this.memberships.find({
      organizationId: {
        $in: organizationIds
          .filter((id) => Types.ObjectId.isValid(id))
          .map((id) => new Types.ObjectId(id)),
      },
      userId: new Types.ObjectId(userId),
      status: MembershipStatus.ACTIVE,
    })
    const membershipIds = memberships.map((membership) => membership._id)
    const grants = await this.grants.find({
      membershipId: { $in: membershipIds },
      role: OrganizationRole.ORGANIZATION_ADMIN,
      status: GrantStatus.ACTIVE,
    })
    const grantedMemberships = new Set(
      grants.map((grant) => String(grant.membershipId)),
    )
    return new Set(
      memberships
        .filter((membership) => grantedMemberships.has(String(membership._id)))
        .map((membership) => String(membership.organizationId)),
    )
  }
}
