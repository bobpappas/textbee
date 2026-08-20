import { ConflictException } from '@nestjs/common'
import { Types } from 'mongoose'
import { AuditOutcome, MembershipStatus } from './organization.enums'
import { OperatorAccessService } from './operator-access.service'

const query = <T>(value: T) => ({ session: jest.fn().mockResolvedValue(value) })

describe('OperatorAccessService', () => {
  const organizationId = new Types.ObjectId()
  const actorId = new Types.ObjectId()
  const targetUserId = new Types.ObjectId()
  const membershipId = new Types.ObjectId()
  let memberships: any
  let grants: any
  let audits: any
  let users: any
  let service: OperatorAccessService

  beforeEach(() => {
    memberships = {
      findOne: jest.fn(),
      updateOne: jest.fn(),
      exists: jest.fn(),
    }
    grants = {
      findOne: jest.fn(),
      find: jest.fn(),
      exists: jest.fn(),
      updateOne: jest.fn(),
    }
    audits = { create: jest.fn(), updateOne: jest.fn() }
    users = { findOne: jest.fn(), find: jest.fn() }
    const connection = {
      transaction: jest.fn(async (callback) => callback({ id: 'session' })),
    }
    service = new OperatorAccessService(
      connection as any,
      { updateOne: jest.fn() } as any,
      memberships,
      grants,
      audits,
      users,
      { find: jest.fn() } as any,
      { find: jest.fn() } as any,
      { find: jest.fn() } as any,
      {
        activeAdminMembership: jest.fn().mockResolvedValue({ _id: actorId }),
      } as any,
    )
  })

  it('adds an active membership without fabricating an organization grant', async () => {
    users.findOne.mockResolvedValue({
      _id: targetUserId,
      email: 'operator@example.com',
    })
    memberships.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce({
      _id: membershipId,
      status: MembershipStatus.ACTIVE,
    })

    await expect(
      service.add(
        String(organizationId),
        { _id: actorId },
        {
          email: ' Operator@Example.com ',
          reason: 'Approved for group assignment',
        },
      ),
    ).resolves.toEqual({
      membershipId: String(membershipId),
      status: MembershipStatus.ACTIVE,
    })

    expect(memberships.updateOne).toHaveBeenCalledWith(
      { organizationId, userId: targetUserId },
      expect.objectContaining({
        $set: expect.objectContaining({ status: MembershipStatus.ACTIVE }),
      }),
      { upsert: true },
    )
    expect(grants.updateOne).not.toHaveBeenCalled()
  })

  it('commits a denied audit and preserves the last usable administrator', async () => {
    const membership = {
      _id: membershipId,
      organizationId,
      status: MembershipStatus.ACTIVE,
      save: jest.fn(),
    }
    memberships.findOne.mockReturnValue(query(membership))
    grants.exists.mockReturnValue(query({ _id: new Types.ObjectId() }))
    grants.find.mockReturnValue(query([]))

    await expect(
      service.changeStatus(
        String(organizationId),
        String(membershipId),
        { _id: actorId },
        MembershipStatus.SUSPENDED,
        { reason: 'Temporary access removal' },
      ),
    ).rejects.toBeInstanceOf(ConflictException)

    expect(membership.save).not.toHaveBeenCalled()
    expect(audits.create).toHaveBeenCalledWith(
      [expect.objectContaining({ outcome: AuditOutcome.DENIED })],
      { session: { id: 'session' } },
    )
  })
})
