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


describe('new group sender unread baseline', () => {
  const organizationId = new Types.ObjectId()
  const conversationId = new Types.ObjectId()
  const groupId = new Types.ObjectId()
  const membershipId = new Types.ObjectId()
  const userId = new Types.ObjectId()
  const assignedAt = new Date('2026-10-09T12:00:00Z')
  const oldEntry = { _id: new Types.ObjectId(), direction: 'INBOUND', groupId, eventAt: new Date('2026-10-08T12:00:00Z'), createdAt: new Date('2026-10-08T12:00:00Z') }
  const newEntry = { ...oldEntry, _id: new Types.ObjectId(), createdAt: new Date('2026-10-09T12:01:00Z') }
  function fixture(entries = [oldEntry], states: any[] = [], role = 'sender', timestamp: Date | undefined = assignedAt) {
    const service = Object.create(CommunicationsService.prototype) as any
    Object.assign(service, {
      operators: { findOne: jest.fn().mockResolvedValue({ _id: membershipId, organizationId }) },
      policy: { activeAdminMembership: jest.fn().mockResolvedValue(role === 'admin' ? {} : null) },
      owners: { find: jest.fn().mockResolvedValue(role === 'owner' ? [{ groupId }] : []) },
      senders: { find: jest.fn().mockResolvedValue([{ groupId, createdAt: timestamp, changedAt: new Date('2026-10-10T12:00:00Z') }]) },
      reads: { find: jest.fn().mockResolvedValue(states) },
      work: { findOne: jest.fn().mockResolvedValue({ resolved: true }) },
      conversations: { find: jest.fn().mockReturnValue({ sort: () => ({ limit: async () => [{ _id: conversationId, organizationId, displayName: 'Synthetic contact', canonicalNumber: '+12085550100', lastActivityAt: newEntry.createdAt }] }) }) },
    })
    service.visibleEntries = jest.fn().mockResolvedValue(entries)
    service.entryView = jest.fn(async entry => entry)
    service.workView = jest.fn(state => state)
    const list = (view = 'all') => service.list(String(organizationId), { _id: userId }, { groupId: String(groupId), view })
    return { service, list }
  }
  it('retains historical conversations in All but excludes them from Unread for a new sender', async () => {
    const { list } = fixture()
    const all = await list()
    expect(all.items).toHaveLength(1)
    expect(all.items[0].unreadCount).toBe(0)
    expect(all.items[0].workState.resolved).toBe(true)
    expect((await list('unread')).items).toHaveLength(0)
  })
  it('counts newly received messages even with old phone timestamps or later role edits', async () => {
    const { list } = fixture([oldEntry, newEntry])
    expect((await list('unread')).items[0].unreadCount).toBe(1)
  })
  it('honors explicit Mark unread on history and Mark read on new messages', async () => {
    const { service, list } = fixture([oldEntry, newEntry], [{ entryId: oldEntry._id, read: false }, { entryId: newEntry._id, read: true }])
    expect((await list()).items[0].unreadCount).toBe(1)
    expect(service.reads.find.mock.calls[0][0]).not.toHaveProperty('read')
  })
  it.each(['owner', 'admin'])('does not reset existing %s unread behavior', async role => {
    const { list } = fixture([oldEntry], [], role)
    expect((await list()).items[0].unreadCount).toBe(1)
  })
  it('treats a message received exactly at assignment as unread', async () => {
    const { list } = fixture([{ ...oldEntry, createdAt: assignedAt }])
    expect((await list()).items[0].unreadCount).toBe(1)
  })
})
