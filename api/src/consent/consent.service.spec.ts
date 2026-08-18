import { BadRequestException, ConflictException } from '@nestjs/common'
import { Types } from 'mongoose'
import { GroupStatus, RosterMembershipStatus } from '../groups/group.enums'
import { ConsentService } from './consent.service'

describe('ConsentService', () => {
  const organizationId = new Types.ObjectId()
  const groupId = new Types.ObjectId()
  const contactId = new Types.ObjectId()
  const inboundSmsId = new Types.ObjectId()
  const actorUserId = new Types.ObjectId()
  const sender = '+12085550123'
  const receivingNumber = '+12085550100'

  let consents: any
  let suppressions: any
  let audit: any
  let responseWindows: any
  let groups: any
  let contacts: any
  let memberships: any
  let operators: any
  let sms: any
  let service: ConsentService

  beforeEach(() => {
    process.env.TEXTBEE_DEFAULT_RECEIVING_NUMBER = receivingNumber
    consents = {
      updateOne: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
      updateMany: jest.fn().mockResolvedValue({ modifiedCount: 2 }),
      findOne: jest.fn().mockResolvedValue(null),
      exists: jest.fn().mockResolvedValue(true),
      replaceOne: jest.fn(),
      deleteOne: jest.fn(),
    }
    suppressions = {
      exists: jest.fn().mockResolvedValue(false),
      updateOne: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
      findOne: jest.fn().mockResolvedValue(null),
    }
    audit = {
      create: jest.fn().mockResolvedValue({}),
      updateOne: jest.fn().mockResolvedValue({}),
    }
    responseWindows = { create: jest.fn().mockResolvedValue({}) }
    groups = { find: jest.fn().mockResolvedValue([]) }
    contacts = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn(),
      deleteOne: jest.fn(),
    }
    memberships = {
      updateMany: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
      updateOne: jest.fn().mockResolvedValue({}),
      findOne: jest.fn().mockResolvedValue(null),
      exists: jest.fn().mockResolvedValue(true),
      replaceOne: jest.fn(),
      deleteOne: jest.fn(),
    }
    operators = { find: jest.fn().mockResolvedValue([]) }
    sms = { updateMany: jest.fn().mockResolvedValue({}) }
    service = new ConsentService(
      consents,
      suppressions,
      audit,
      responseWindows,
      groups,
      contacts,
      memberships,
      operators,
      sms,
    )
  })

  afterEach(() => {
    delete process.env.TEXTBEE_DEFAULT_RECEIVING_NUMBER
  })

  it.each([
    [' stop ', 'STOP'],
    ['OpT   OuT', 'OPT OUT'],
    [' join   unifiedya ', 'JOIN UNIFIEDYA'],
  ])('normalizes command case and whitespace for %s', (input, expected) => {
    expect(service.normalizeCommand(input)).toBe(expected)
  })

  it('requires affirmative operator consent', async () => {
    await expect(
      service.recordOperatorConsent({
        organizationId,
        groupId,
        contactId,
        mobileNumber: sender,
        actorUserId,
        affirmed: false,
      }),
    ).rejects.toBeInstanceOf(BadRequestException)
    expect(consents.updateOne).not.toHaveBeenCalled()
  })

  it('does not let an operator override recipient suppression', async () => {
    suppressions.exists.mockResolvedValue(true)
    await expect(
      service.recordOperatorConsent({
        organizationId,
        groupId,
        contactId,
        mobileNumber: sender,
        actorUserId,
        affirmed: true,
      }),
    ).rejects.toBeInstanceOf(ConflictException)
    expect(consents.updateOne).not.toHaveBeenCalled()
  })

  it('rolls back consent when STOP wins the race with recording', async () => {
    suppressions.exists.mockResolvedValueOnce(false).mockResolvedValueOnce(true)

    await expect(
      service.recordOperatorConsent({
        organizationId,
        groupId,
        contactId,
        mobileNumber: sender,
        actorUserId,
        affirmed: true,
      }),
    ).rejects.toBeInstanceOf(ConflictException)
    expect(consents.updateOne).toHaveBeenCalled()
    expect(consents.deleteOne).toHaveBeenCalledWith({
      organizationId,
      groupId,
      contactId,
    })
    expect(audit.create).not.toHaveBeenCalled()
  })

  it('records actor, server time, scope, and optional method note for manual consent', async () => {
    await service.recordOperatorConsent({
      organizationId,
      groupId,
      contactId,
      mobileNumber: sender,
      actorUserId,
      affirmed: true,
      methodNote: 'In-person request',
    })
    expect(consents.updateOne).toHaveBeenCalledWith(
      {
        organizationId,
        groupId,
        contactId,
        status: { $ne: 'ACTIVE' },
      },
      expect.objectContaining({
        $set: expect.objectContaining({
          mobileNumber: sender,
          source: 'OPERATOR_AFFIRMATION',
          status: 'ACTIVE',
          actorUserId,
          methodNote: 'In-person request',
          consentedAt: expect.any(Date),
        }),
      }),
      { upsert: true },
    )
  })

  it('preserves active evidence and audit history on a retry', async () => {
    consents.findOne.mockResolvedValue({
      status: 'ACTIVE',
      source: 'TEXT_TO_JOIN',
      consentedAt: new Date('2026-08-01T12:00:00Z'),
    })

    await expect(
      service.recordOperatorConsent({
        organizationId,
        groupId,
        contactId,
        mobileNumber: sender,
        actorUserId,
        affirmed: true,
        methodNote: 'Should not replace prior evidence',
      }),
    ).resolves.toEqual({ recorded: false })
    expect(consents.updateOne).not.toHaveBeenCalled()
    expect(audit.create).not.toHaveBeenCalled()
  })

  it('archives ended evidence before recording a new effective consent', async () => {
    const endedAt = new Date('2026-08-02T12:00:00Z')
    const consentedAt = new Date('2026-08-01T12:00:00Z')
    consents.findOne.mockResolvedValue({
      status: 'ENDED',
      source: 'TEXT_TO_JOIN',
      consentedAt,
      receivingNumber,
      inboundSmsId,
      endedAt,
      endedByCommand: 'STOP',
    })

    await service.recordOperatorConsent({
      organizationId,
      groupId,
      contactId,
      mobileNumber: sender,
      actorUserId,
      affirmed: true,
    })

    expect(consents.updateOne).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId, groupId, contactId }),
      expect.objectContaining({
        $push: {
          evidenceHistory: expect.objectContaining({
            source: 'TEXT_TO_JOIN',
            status: 'ENDED',
            consentedAt,
            receivingNumber,
            inboundSmsId,
            endedAt,
            endedByCommand: 'STOP',
          }),
        },
      }),
      { upsert: true },
    )
  })

  it('treats a concurrent active insert as the same effective transition', async () => {
    consents.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ status: 'ACTIVE' })
    consents.updateOne.mockRejectedValue({ code: 11000 })

    await expect(
      service.recordOperatorConsent({
        organizationId,
        groupId,
        contactId,
        mobileNumber: sender,
        actorUserId,
        affirmed: true,
      }),
    ).resolves.toEqual({ recorded: false })
    expect(audit.create).not.toHaveBeenCalled()
  })

  it.each([
    'STOP',
    ' quit ',
    'End',
    'revoke',
    'OPT   OUT',
    'cancel',
    'unsubscribe',
  ])(
    'processes %s as an organization-wide opt-out before ordinary routing',
    async (body) => {
      groups.find.mockResolvedValue([
        {
          _id: groupId,
          organizationId,
          receivingNumber,
          joinCode: 'UNIFIEDYA',
          status: GroupStatus.ACTIVE,
        },
      ])
      const result = await service.processInbound({
        sender,
        body,
        inboundSmsId,
        receivedAt: new Date(),
      })
      expect(result.handled).toBe(true)
      expect(result.command).toBe('STOP')
      expect(result.acknowledgment?.kind).toBe('STOP')
      expect(suppressions.updateOne).toHaveBeenCalledWith(
        { organizationId, mobileNumber: sender },
        expect.objectContaining({
          $set: expect.objectContaining({ status: 'ACTIVE' }),
        }),
        { upsert: true },
      )
      expect(consents.updateMany).toHaveBeenCalledWith(
        { organizationId, mobileNumber: sender, status: 'ACTIVE' },
        expect.objectContaining({
          $set: expect.objectContaining({
            status: 'ENDED',
            endedByCommand: 'STOP',
          }),
        }),
      )
      expect(sms.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ recipient: sender, status: 'pending' }),
        expect.objectContaining({
          $set: expect.objectContaining({ errorCode: 'RECIPIENT_SUPPRESSED' }),
        }),
      )
    },
  )

  it('makes repeated STOP idempotent and does not repeat its acknowledgment', async () => {
    groups.find.mockResolvedValue([{ organizationId }])
    suppressions.exists.mockResolvedValue(true)
    const result = await service.processInbound({
      sender,
      body: 'STOP',
      inboundSmsId,
      receivedAt: new Date(),
    })
    expect(result.acknowledgment).toBeUndefined()
    expect(suppressions.updateOne).not.toHaveBeenCalled()
    expect(audit.updateOne).toHaveBeenCalledWith(
      { organizationId, inboundSmsId, action: 'STOP' },
      expect.objectContaining({
        $setOnInsert: expect.objectContaining({ result: 'ALREADY_SUPPRESSED' }),
      }),
      { upsert: true },
    )
  })

  it('ends suppression on START without reactivating consent or membership', async () => {
    groups.find.mockResolvedValue([{ organizationId }])
    const result = await service.processInbound({
      sender,
      body: ' START ',
      inboundSmsId,
      receivedAt: new Date(),
    })
    expect(result.acknowledgment?.kind).toBe('START')
    expect(result.acknowledgment?.body).toContain('not rejoined any groups')
    expect(suppressions.updateOne).toHaveBeenCalledWith(
      { organizationId, mobileNumber: sender, status: 'ACTIVE' },
      expect.any(Object),
    )
    expect(consents.updateOne).not.toHaveBeenCalled()
    expect(memberships.updateOne).not.toHaveBeenCalled()
  })

  it('activates one existing contact, membership, and TEXT_TO_JOIN consent', async () => {
    const contact = { _id: contactId, displayName: 'Existing person' }
    groups.find.mockResolvedValue([
      {
        _id: groupId,
        organizationId,
        receivingNumber,
        joinCode: 'UNIFIEDYA',
        displayName: 'Unified Youth',
        status: GroupStatus.ACTIVE,
      },
    ])
    contacts.findOne.mockResolvedValue(contact)
    const result = await service.processInbound({
      sender,
      body: ' join   unifiedya ',
      inboundSmsId,
      receivedAt: new Date(),
    })
    expect(result.acknowledgment?.body).toBe(
      'Boise Church of Christ: You joined Unified Youth. Msg frequency varies. Msg & data rates may apply. Reply STOP to stop all church texts; HELP for help.',
    )
    expect(contacts.create).not.toHaveBeenCalled()
    expect(memberships.updateOne).toHaveBeenCalledWith(
      { organizationId, groupId, contactId },
      expect.objectContaining({
        $set: expect.objectContaining({
          status: RosterMembershipStatus.ACTIVE,
          changedByInboundSmsId: inboundSmsId,
        }),
      }),
      { upsert: true },
    )
    expect(consents.updateOne).toHaveBeenCalledWith(
      { organizationId, groupId, contactId },
      expect.objectContaining({
        $set: expect.objectContaining({
          source: 'TEXT_TO_JOIN',
          status: 'ACTIVE',
          receivingNumber,
          inboundSmsId,
        }),
      }),
      { upsert: true },
    )
  })

  it('creates the deterministic provisional contact name for a new JOIN sender', async () => {
    const contact = { _id: contactId, displayName: 'SMS contact ending 0123' }
    groups.find.mockResolvedValue([
      {
        _id: groupId,
        organizationId,
        receivingNumber,
        joinCode: 'NEWS',
        displayName: 'News',
        status: GroupStatus.ACTIVE,
      },
    ])
    contacts.create.mockResolvedValue(contact)
    await service.processInbound({
      sender,
      body: 'JOIN NEWS',
      inboundSmsId,
      receivedAt: new Date(),
    })
    expect(contacts.create).toHaveBeenCalledWith({
      organizationId,
      displayName: 'SMS contact ending 0123',
      mobileNumber: sender,
      createdByInboundSmsId: inboundSmsId,
    })
  })

  it('does not mutate contacts or membership when JOIN is suppressed', async () => {
    groups.find.mockResolvedValue([
      {
        _id: groupId,
        organizationId,
        receivingNumber,
        joinCode: 'NEWS',
        displayName: 'News',
        status: GroupStatus.ACTIVE,
      },
    ])
    suppressions.exists.mockResolvedValue(true)
    const result = await service.processInbound({
      sender,
      body: 'JOIN NEWS',
      inboundSmsId,
      receivedAt: new Date(),
    })
    expect(result.acknowledgment).toBeUndefined()
    expect(contacts.findOne).not.toHaveBeenCalled()
    expect(memberships.updateOne).not.toHaveBeenCalled()
  })

  it('does not route JOIN when the destination configuration is absent', async () => {
    delete process.env.TEXTBEE_DEFAULT_RECEIVING_NUMBER
    const result = await service.processInbound({
      sender,
      body: 'JOIN NEWS',
      inboundSmsId,
      receivedAt: new Date(),
    })
    expect(result).toEqual({ handled: false })
    expect(groups.find).not.toHaveBeenCalled()
  })

  it('enforces suppression before active consent at dispatch', async () => {
    operators.find.mockResolvedValue([{ organizationId }])
    suppressions.findOne.mockResolvedValue({ organizationId })
    const [decision] = await service.authorizeRecipients(actorUserId, [sender])
    expect(decision).toEqual({
      recipient: sender,
      eligible: false,
      reason: 'ORGANIZATION_SUPPRESSION',
      organizationId: String(organizationId),
    })
    expect(consents.findOne).not.toHaveBeenCalled()
  })

  it('permits only the final STOP acknowledgment while suppression is active', async () => {
    operators.find.mockResolvedValue([{ organizationId }])
    suppressions.findOne.mockResolvedValue({ organizationId })
    const [decision] = await service.authorizeRecipients(
      actorUserId,
      [sender],
      {
        kind: 'ACKNOWLEDGMENT',
        organizationId: String(organizationId),
        acknowledgmentKind: 'STOP',
      },
    )
    expect(decision).toEqual({
      recipient: sender,
      eligible: true,
      organizationId: String(organizationId),
    })
    expect(consents.findOne).not.toHaveBeenCalled()
  })
})
