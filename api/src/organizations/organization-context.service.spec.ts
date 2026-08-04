import { BadRequestException, ForbiddenException } from '@nestjs/common'
import { Types } from 'mongoose'
import {
  GrantStatus,
  MembershipStatus,
  OrganizationCapability,
  OrganizationContextState,
  OrganizationRole,
  OrganizationStatus,
} from './organization.enums'
import { OrganizationContextService } from './organization-context.service'

describe('OrganizationContextService', () => {
  const userId = new Types.ObjectId()
  const organizationId = new Types.ObjectId()
  const membershipId = new Types.ObjectId()
  let organizations: any
  let memberships: any
  let grants: any
  let groupOwners: any
  let groups: any
  let service: OrganizationContextService

  beforeEach(() => {
    organizations = { find: jest.fn() }
    memberships = { find: jest.fn() }
    grants = { find: jest.fn() }
    groupOwners = { find: jest.fn().mockResolvedValue([]) }
    groups = { exists: jest.fn() }
    service = new OrganizationContextService(
      organizations,
      memberships,
      grants,
      groupOwners,
      groups,
    )
  })

  const activeMembership = (overrides: Record<string, unknown> = {}) => ({
    _id: membershipId,
    organizationId,
    userId,
    status: MembershipStatus.ACTIVE,
    ...overrides,
  })
  const activeOrganization = (overrides: Record<string, unknown> = {}) => ({
    _id: organizationId,
    displayName: 'Boise Church of Christ',
    status: OrganizationStatus.ACTIVE,
    ...overrides,
  })

  it('returns one active organization with normalized capabilities', async () => {
    memberships.find.mockResolvedValue([activeMembership()])
    organizations.find.mockResolvedValue([activeOrganization()])
    grants.find.mockResolvedValue([
      { role: OrganizationRole.ORGANIZATION_ADMIN, status: GrantStatus.ACTIVE },
      { role: OrganizationRole.ORGANIZATION_ADMIN, status: GrantStatus.ACTIVE },
      { role: 'UNKNOWN_ROLE', status: GrantStatus.ACTIVE },
    ])

    await expect(service.current({ _id: userId })).resolves.toEqual({
      state: OrganizationContextState.ACTIVE,
      organization: {
        id: String(organizationId),
        displayName: 'Boise Church of Christ',
      },
      membership: { id: String(membershipId), status: MembershipStatus.ACTIVE },
      capabilities: [
        OrganizationCapability.GROUP_JOIN_SETTINGS_MANAGE,
        OrganizationCapability.GROUP_OWNERS_MANAGE,
        OrganizationCapability.GROUP_ROSTER_MANAGE,
        OrganizationCapability.GROUPS_MANAGE,
        OrganizationCapability.GROUPS_READ,
        OrganizationCapability.PROFILE_MANAGE,
      ],
      roleLabel: 'Organization administrator',
    })
  })

  it('returns no access without querying or leaking organizations', async () => {
    memberships.find.mockResolvedValue([])

    await expect(service.current({ _id: userId })).resolves.toEqual({
      state: OrganizationContextState.NO_ACCESS,
      organization: null,
      membership: null,
      capabilities: [],
      roleLabel: null,
    })
    expect(organizations.find).not.toHaveBeenCalled()
    expect(grants.find).not.toHaveBeenCalled()
  })

  it('does not silently select among multiple active organizations', async () => {
    const secondOrganizationId = new Types.ObjectId()
    memberships.find.mockResolvedValue([
      activeMembership(),
      activeMembership({
        _id: new Types.ObjectId(),
        organizationId: secondOrganizationId,
      }),
    ])
    organizations.find.mockResolvedValue([
      activeOrganization(),
      activeOrganization({
        _id: secondOrganizationId,
        displayName: 'Another organization',
      }),
    ])

    await expect(service.current({ _id: userId })).resolves.toEqual({
      state: OrganizationContextState.SELECTION_REQUIRED,
      organization: null,
      membership: null,
      capabilities: [],
      roleLabel: null,
    })
    expect(grants.find).not.toHaveBeenCalled()
  })

  it('ignores inactive organizations and grants conservatively', async () => {
    memberships.find.mockResolvedValue([activeMembership()])
    organizations.find.mockResolvedValue([])

    await expect(service.current({ _id: userId })).resolves.toMatchObject({
      state: OrganizationContextState.NO_ACCESS,
      organization: null,
      capabilities: [],
    })

    organizations.find.mockResolvedValue([activeOrganization()])
    grants.find.mockResolvedValue([
      {
        role: OrganizationRole.ORGANIZATION_ADMIN,
        status: GrantStatus.INACTIVE,
      },
    ])
    await expect(service.current({ _id: userId })).resolves.toMatchObject({
      state: OrganizationContextState.ACTIVE,
      capabilities: [],
      roleLabel: 'Organization member',
    })
  })

  it('grants bounded group capabilities only for an active owned group', async () => {
    const groupId = new Types.ObjectId()
    memberships.find.mockResolvedValue([activeMembership()])
    organizations.find.mockResolvedValue([activeOrganization()])
    grants.find.mockResolvedValue([])
    groupOwners.find.mockResolvedValue([
      { groupId, status: GrantStatus.ACTIVE },
    ])
    groups.exists.mockResolvedValue({ _id: groupId })

    await expect(service.current({ _id: userId })).resolves.toMatchObject({
      capabilities: [
        OrganizationCapability.GROUP_JOIN_SETTINGS_MANAGE,
        OrganizationCapability.GROUP_ROSTER_MANAGE,
        OrganizationCapability.GROUPS_READ,
      ],
      roleLabel: 'Group owner',
    })
  })

  it('queries only active memberships and active organizations', async () => {
    memberships.find.mockResolvedValue([])
    await service.current({ _id: userId })
    expect(memberships.find).toHaveBeenCalledWith({
      userId: new Types.ObjectId(String(userId)),
      status: MembershipStatus.ACTIVE,
    })

    memberships.find.mockResolvedValue([activeMembership()])
    organizations.find.mockResolvedValue([])
    await service.current({ _id: userId })
    expect(organizations.find).toHaveBeenCalledWith({
      _id: { $in: [organizationId] },
      status: OrganizationStatus.ACTIVE,
    })
  })

  it('keeps platform role and API-key authentication from creating context', async () => {
    memberships.find.mockResolvedValue([])
    await expect(
      service.current({ _id: userId, role: 'ADMIN' } as any),
    ).resolves.toMatchObject({ state: OrganizationContextState.NO_ACCESS })
    await expect(service.current({ _id: userId }, true)).rejects.toBeInstanceOf(
      ForbiddenException,
    )
  })

  it('rejects an invalid authenticated user before querying records', async () => {
    await expect(service.current({ id: 'forged' })).rejects.toBeInstanceOf(
      BadRequestException,
    )
    expect(memberships.find).not.toHaveBeenCalled()
  })
})
