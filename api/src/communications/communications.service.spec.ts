import { Types } from 'mongoose'
import { CommunicationsService } from './communications.service'

describe('communications work-state concurrency', () => {
  const organizationId = new Types.ObjectId()
  const conversationId = new Types.ObjectId()
  const groupId = new Types.ObjectId()
  const userId = new Types.ObjectId()
  const membershipId = new Types.ObjectId()
  const stateId = new Types.ObjectId()

  function fixture(updated: Record<string, unknown> | null) {
    const state = {
      _id: stateId,
      organizationId,
      conversationId,
      groupId,
      version: 3,
      resolved: false,
    }
    const current = { ...state, version: 4, resolved: true }
    const work = {
      findOneAndUpdate: jest.fn().mockResolvedValue(updated),
      findOne: jest.fn().mockResolvedValue(current),
    }
    const audits = { create: jest.fn().mockResolvedValue(undefined) }
    const service = Object.create(CommunicationsService.prototype) as any
    Object.assign(service, {
      work,
      audits,
      conversations: {
        findOne: jest.fn().mockResolvedValue({
          _id: conversationId,
          organizationId,
        }),
      },
    })
    service.access = jest.fn().mockResolvedValue({
      userId,
      membership: { _id: membershipId, organizationId },
      admin: true,
      ownerGroupIds: new Set(),
      senderGroupIds: new Set(),
    })
    service.requireGroupAccess = jest.fn()
    service.visibleEntries = jest.fn().mockResolvedValue([{ _id: 'entry' }])
    service.ensureWorkState = jest.fn().mockResolvedValue(state)
    return { service, work, audits, current }
  }

  it('uses the submitted version in the atomic update predicate', async () => {
    const updated = {
      _id: stateId,
      organizationId,
      conversationId,
      groupId,
      version: 4,
      resolved: true,
      resolvedBy: userId,
    }
    const { service, work, audits } = fixture(updated)

    await expect(
      service.updateWorkState(
        String(organizationId),
        String(conversationId),
        String(groupId),
        { _id: userId },
        { action: 'resolve', version: 3 },
      ),
    ).resolves.toEqual(expect.objectContaining({ version: 4, resolved: true }))

    expect(work.findOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ _id: stateId, version: 3 }),
      expect.objectContaining({ $inc: { version: 1 } }),
      { new: true },
    )
    expect(audits.create).toHaveBeenCalledTimes(1)
  })

  it('returns the current state when another writer wins the version race', async () => {
    const { service, audits, current } = fixture(null)

    await expect(
      service.updateWorkState(
        String(organizationId),
        String(conversationId),
        String(groupId),
        { _id: userId },
        { action: 'resolve', version: 3 },
      ),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'COMMUNICATION_STATE_STALE',
        currentState: expect.objectContaining({
          version: current.version,
          resolved: current.resolved,
        }),
      }),
    })

    expect(audits.create).not.toHaveBeenCalled()
  })
})
