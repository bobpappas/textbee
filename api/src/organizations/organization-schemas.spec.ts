import { AuthorizationAuditEventSchema } from './schemas/authorization-audit-event.schema'
import { OperatorGrantSchema } from './schemas/operator-grant.schema'
import { OperatorMembershipSchema } from './schemas/operator-membership.schema'
import { OrganizationSchema } from './schemas/organization.schema'

describe('organization persistence constraints', () => {
  it('uniquely scopes provisioning requests to their creator', () => {
    expect(OrganizationSchema.indexes()).toContainEqual([
      { createdBy: 1, provisioningKey: 1 },
      { unique: true },
    ])
  })

  it('prevents duplicate memberships and organization-admin grants', () => {
    expect(OperatorMembershipSchema.path('organizationId').instance).toBe(
      'ObjectId',
    )
    expect(OperatorMembershipSchema.path('userId').instance).toBe('ObjectId')
    expect(OperatorMembershipSchema.indexes()).toContainEqual([
      { organizationId: 1, userId: 1 },
      { unique: true },
    ])
    expect(OperatorGrantSchema.indexes()).toContainEqual([
      { organizationId: 1, membershipId: 1, role: 1 },
      { unique: true },
    ])
  })

  it('deduplicates audit operations', () => {
    expect(AuthorizationAuditEventSchema.indexes()).toContainEqual([
      { organizationId: 1, action: 1, operationKey: 1 },
      { unique: true },
    ])
  })
})
