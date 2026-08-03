import { Types } from 'mongoose'
import { OrganizationPolicyService } from './organization-policy.service'

describe('OrganizationPolicyService', () => {
  const organizationId = new Types.ObjectId()
  const userId = new Types.ObjectId()
  const membershipId = new Types.ObjectId()
  let memberships: { findOne: jest.Mock; find: jest.Mock }
  let grants: { findOne: jest.Mock; find: jest.Mock }
  let policy: OrganizationPolicyService

  beforeEach(() => {
    memberships = { findOne: jest.fn(), find: jest.fn() }
    grants = { findOne: jest.fn(), find: jest.fn() }
    policy = new OrganizationPolicyService(memberships as any, grants as any)
  })

  it('requires a membership and grant scoped to the same organization', async () => {
    memberships.findOne.mockResolvedValue({
      _id: membershipId,
      organizationId,
      userId,
    })
    grants.findOne.mockResolvedValue({ membershipId, organizationId })

    await expect(
      policy.activeAdminMembership(String(organizationId), String(userId)),
    ).resolves.toMatchObject({ _id: membershipId })
    expect(grants.findOne).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId, membershipId }),
    )
  })

  it('denies missing grants and malformed identifiers', async () => {
    memberships.findOne.mockResolvedValue({ _id: membershipId })
    grants.findOne.mockResolvedValue(null)
    await expect(
      policy.activeAdminMembership(String(organizationId), String(userId)),
    ).resolves.toBeNull()
    await expect(
      policy.activeAdminMembership('other', 'user'),
    ).resolves.toBeNull()
  })

  it('computes manageable registry rows only from granted active memberships', async () => {
    const otherOrganizationId = new Types.ObjectId()
    const otherMembershipId = new Types.ObjectId()
    memberships.find.mockResolvedValue([
      { _id: membershipId, organizationId },
      { _id: otherMembershipId, organizationId: otherOrganizationId },
    ])
    grants.find.mockResolvedValue([{ membershipId, organizationId }])

    const result = await policy.manageableOrganizationIds(
      [String(organizationId), String(otherOrganizationId)],
      String(userId),
    )
    expect(result).toEqual(new Set([String(organizationId)]))
  })
})
