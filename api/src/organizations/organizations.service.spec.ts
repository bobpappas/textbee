import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common'
import { Types } from 'mongoose'
import { MembershipStatus, OrganizationStatus } from './organization.enums'
import { OrganizationsService } from './organizations.service'

const selected = (value: unknown) => ({
  select: jest.fn().mockResolvedValue(value),
})

describe('OrganizationsService', () => {
  const actorId = new Types.ObjectId()
  const organizationId = new Types.ObjectId()
  const membershipId = new Types.ObjectId()
  const actor = { _id: actorId }
  let organizations: any
  let memberships: any
  let grants: any
  let auditEvents: any
  let policy: any
  let service: OrganizationsService

  const organization = (overrides: Record<string, unknown> = {}) => ({
    _id: organizationId,
    displayName: 'Boise Church of Christ',
    status: OrganizationStatus.PROVISIONING,
    createdBy: actorId,
    provisioningKey: 'request-key-1',
    createdAt: new Date('2026-08-02T00:00:00Z'),
    save: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  })

  beforeEach(() => {
    organizations = {
      findOne: jest.fn(),
      find: jest.fn(),
      create: jest.fn(),
      updateOne: jest.fn().mockResolvedValue({ acknowledged: true }),
    }
    memberships = {
      updateOne: jest.fn().mockResolvedValue({ acknowledged: true }),
      findOne: jest.fn(),
    }
    grants = {
      updateOne: jest.fn().mockResolvedValue({ acknowledged: true }),
      findOne: jest.fn(),
    }
    auditEvents = {
      updateOne: jest.fn().mockResolvedValue({ acknowledged: true }),
      findOne: jest.fn(),
      create: jest.fn().mockResolvedValue(undefined),
    }
    policy = {
      manageableOrganizationIds: jest.fn(),
      activeAdminMembership: jest.fn(),
    }
    service = new OrganizationsService(
      organizations,
      memberships,
      grants,
      auditEvents,
      policy,
    )
  })

  function completeProvisioning(org = organization()) {
    const membership = {
      _id: membershipId,
      organizationId,
      userId: actorId,
      status: MembershipStatus.ACTIVE,
    }
    memberships.findOne.mockResolvedValue(membership)
    grants.findOne.mockResolvedValue({ _id: new Types.ObjectId() })
    auditEvents.findOne.mockResolvedValue({ _id: new Types.ObjectId() })
    return { org, membership }
  }

  it.each([undefined, '', ' ', 'a', 'a'.repeat(101)])(
    'rejects invalid display names without writes: %p',
    async (displayName) => {
      await expect(
        service.create(actor, displayName, 'request-key-1'),
      ).rejects.toBeInstanceOf(BadRequestException)
      expect(organizations.findOne).not.toHaveBeenCalled()
      expect(organizations.create).not.toHaveBeenCalled()
    },
  )

  it('rejects a missing or unsafe idempotency key before writes', async () => {
    await expect(
      service.create(actor, 'Valid name', 'short'),
    ).rejects.toBeInstanceOf(BadRequestException)
    expect(organizations.findOne).not.toHaveBeenCalled()
  })

  it('creates all provisioning records before activating the organization', async () => {
    const org = organization()
    organizations.findOne.mockReturnValue(selected(null))
    organizations.create.mockResolvedValue(org)
    const { membership } = completeProvisioning(org)

    const result = await service.create(
      actor,
      '  Boise Church of Christ  ',
      'request-key-1',
    )

    expect(memberships.updateOne).toHaveBeenCalledWith(
      { organizationId, userId: String(actorId) },
      expect.any(Object),
      { upsert: true },
    )
    expect(grants.updateOne).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId, membershipId }),
      expect.any(Object),
      { upsert: true },
    )
    expect(auditEvents.updateOne).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId,
        operationKey: 'request-key-1',
      }),
      expect.any(Object),
      { upsert: true },
    )
    expect(org.status).toBe(OrganizationStatus.ACTIVE)
    expect(org.save).toHaveBeenCalled()
    expect(result.membership.id).toBe(String(membership._id))
  })

  it('returns an already active organization for the same request key', async () => {
    const org = organization({ status: OrganizationStatus.ACTIVE })
    organizations.findOne.mockReturnValue(selected(org))
    memberships.findOne.mockResolvedValue({
      _id: membershipId,
      status: MembershipStatus.ACTIVE,
    })
    grants.findOne.mockResolvedValue({ _id: new Types.ObjectId() })
    auditEvents.findOne.mockResolvedValue({ _id: new Types.ObjectId() })

    const result = await service.create(actor, org.displayName, 'request-key-1')
    expect(result.organization.id).toBe(String(organizationId))
    expect(memberships.updateOne).not.toHaveBeenCalled()
  })

  it('repairs a nominally active request whose provisioning postconditions are incomplete', async () => {
    const org = organization({ status: OrganizationStatus.ACTIVE })
    organizations.findOne.mockReturnValue(selected(org))
    const membership = {
      _id: membershipId,
      status: MembershipStatus.ACTIVE,
    }
    memberships.findOne
      .mockResolvedValueOnce(membership)
      .mockResolvedValue(membership)
    grants.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValue({ _id: new Types.ObjectId() })
    auditEvents.findOne.mockResolvedValue({ _id: new Types.ObjectId() })

    const result = await service.create(actor, org.displayName, 'request-key-1')
    expect(organizations.updateOne).toHaveBeenCalledWith(
      { _id: organizationId, status: OrganizationStatus.ACTIVE },
      { $set: { status: OrganizationStatus.PROVISIONING } },
    )
    expect(grants.updateOne).toHaveBeenCalled()
    expect(result.organization.status).toBe(OrganizationStatus.ACTIVE)
  })

  it('rejects reuse of a request key for a different normalized name', async () => {
    organizations.findOne.mockReturnValue(selected(organization()))
    await expect(
      service.create(actor, 'Different organization', 'request-key-1'),
    ).rejects.toBeInstanceOf(ConflictException)
  })

  it('marks partial provisioning failed and keeps it retryable', async () => {
    const org = organization()
    organizations.findOne.mockReturnValue(selected(null))
    organizations.create.mockResolvedValue(org)
    memberships.findOne.mockResolvedValue(null)

    await expect(
      service.create(actor, org.displayName, 'request-key-1'),
    ).rejects.toBeInstanceOf(ServiceUnavailableException)
    expect(organizations.updateOne).toHaveBeenCalledWith(
      { _id: organizationId, status: { $ne: OrganizationStatus.ACTIVE } },
      expect.objectContaining({
        $set: expect.objectContaining({
          status: OrganizationStatus.PROVISIONING_FAILED,
        }),
      }),
    )
  })

  it('retries with the original creator rather than the retrying administrator', async () => {
    const originalCreator = new Types.ObjectId()
    const org = organization({
      createdBy: originalCreator,
      status: OrganizationStatus.PROVISIONING_FAILED,
    })
    organizations.findOne.mockReturnValue(selected(org))
    completeProvisioning(org)

    await service.retry(String(organizationId))
    expect(memberships.updateOne).toHaveBeenCalledWith(
      { organizationId, userId: String(originalCreator) },
      expect.any(Object),
      { upsert: true },
    )
  })

  it('uses the same non-disclosing result for invalid, unknown, and unauthorized profiles', async () => {
    await expect(service.profile('invalid', actor)).rejects.toBeInstanceOf(
      NotFoundException,
    )
    policy.activeAdminMembership.mockResolvedValue(null)
    await expect(
      service.profile(String(organizationId), actor),
    ).rejects.toBeInstanceOf(NotFoundException)
  })

  it('renames only an active authorized organization and appends an audit event', async () => {
    const membership = { _id: membershipId }
    const org = organization({ status: OrganizationStatus.ACTIVE })
    policy.activeAdminMembership.mockResolvedValue(membership)
    organizations.findOne.mockResolvedValue(org)

    const result = await service.rename(
      String(organizationId),
      actor,
      'Renamed Church',
      'request-1',
    )
    expect(org.displayName).toBe('Renamed Church')
    expect(auditEvents.create).toHaveBeenCalledWith(
      expect.objectContaining({
        oldDisplayValue: 'Boise Church of Christ',
        newDisplayValue: 'Renamed Church',
        correlationId: 'request-1',
      }),
    )
    expect(result.role).toBe('ORGANIZATION_ADMIN')
  })

  it('treats an identical normalized rename as a no-op without an audit event', async () => {
    const org = organization({ status: OrganizationStatus.ACTIVE })
    policy.activeAdminMembership.mockResolvedValue({ _id: membershipId })
    organizations.findOne.mockResolvedValue(org)

    await service.rename(String(organizationId), actor, ` ${org.displayName} `)
    expect(org.save).not.toHaveBeenCalled()
    expect(auditEvents.create).not.toHaveBeenCalled()
  })
})
