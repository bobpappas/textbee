import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common'
import { Types } from 'mongoose'
import { GroupsService } from './groups.service'

describe('GroupsService validation', () => {
  const model = {} as any
  const policy = {} as any
  const consent = {} as any
  const service = new GroupsService(
    model,
    model,
    model,
    model,
    model,
    model,
    model,
    model,
    policy,
    consent,
  )

  it.each([
    ['208-555-0123', '+12085550123'],
    ['(208) 555-0123', '+12085550123'],
    ['+1 208 555 0123', '+12085550123'],
    ['1.208.555.0123', '+12085550123'],
  ])('normalizes equivalent US phone input %s', (input, expected) => {
    expect(service.normalizePhone(input)).toBe(expected)
  })

  it.each([
    '+44 20 7946 0958',
    '911',
    '208-555-0123 x4',
    '108-555-0123',
    '208-155-0123',
  ])('rejects structurally invalid or non-US phone input %s', (input) => {
    expect(() => service.normalizePhone(input)).toThrow(BadRequestException)
  })

  it('canonicalizes join codes and rejects punctuation or spaces', () => {
    expect(service.normalizeJoinCode(' unifiedya ')).toBe('UNIFIEDYA')
    expect(() => service.normalizeJoinCode('unified ya')).toThrow(
      BadRequestException,
    )
    expect(() => service.normalizeJoinCode('a')).toThrow(BadRequestException)
    expect(() => service.normalizeJoinCode('group!')).toThrow(
      BadRequestException,
    )
  })

  it('parses the exact bulk-add CSV contract including quoted fields', () => {
    expect(
      service.parseBulkCsv(
        'display_name,mobile_number,consent_note\n"Synthetic, Person",208-555-0123,"Asked in person"\n\n',
      ),
    ).toEqual([
      {
        rowNumber: 2,
        displayName: 'Synthetic, Person',
        mobileNumber: '208-555-0123',
        consentNote: 'Asked in person',
        malformed: false,
      },
    ])
  })

  it.each([
    'display_name,mobile_number,unknown\nPerson,208-555-0123,value',
    'display_name,display_name,mobile_number\nPerson,Other,208-555-0123',
    'display_name,consent_note\nPerson,Asked',
    ' display_name,mobile_number\nPerson,208-555-0123',
    'display_name,mobile_number\n"Unclosed,208-555-0123',
  ])('rejects malformed or unsupported CSV input', (csv) => {
    expect(() => service.parseBulkCsv(csv)).toThrow(BadRequestException)
  })

  it('does not expose a receiving number when deployment configuration is absent', async () => {
    const previous = process.env.TEXTBEE_DEFAULT_RECEIVING_NUMBER
    delete process.env.TEXTBEE_DEFAULT_RECEIVING_NUMBER
    const membershipModel = {
      findOne: jest.fn().mockResolvedValue({ _id: 'membership' }),
    }
    const configuredService = new GroupsService(
      model,
      model,
      model,
      model,
      model,
      model,
      membershipModel as any,
      model,
      policy,
      consent,
    )
    await expect(
      configuredService.receivingNumbers('64b7c42f18f0c31f8c9fd111', {
        _id: '64b7c42f18f0c31f8c9fd112',
      }),
    ).resolves.toEqual([])
    expect(() =>
      (configuredService as any).resolveReceivingNumber('deployment-default'),
    ).toThrow(ServiceUnavailableException)
    if (previous) process.env.TEXTBEE_DEFAULT_RECEIVING_NUMBER = previous
  })

  it('limits a non-admin group list inside organization and active owner scope', async () => {
    const organizationId = new Types.ObjectId()
    const userId = new Types.ObjectId()
    const membershipId = new Types.ObjectId()
    const groupId = new Types.ObjectId()
    const groups = {
      find: jest
        .fn()
        .mockReturnValue({ sort: jest.fn().mockResolvedValue([]) }),
    }
    const owners = {
      find: jest.fn().mockResolvedValue([{ groupId }]),
    }
    const operators = {
      findOne: jest.fn().mockResolvedValue({ _id: membershipId }),
    }
    const scopedPolicy = {
      activeAdminMembership: jest.fn().mockResolvedValue(null),
    }
    const scopedService = new GroupsService(
      groups as any,
      model,
      owners as any,
      model,
      model,
      model,
      operators as any,
      model,
      scopedPolicy as any,
      consent,
    )

    await scopedService.list(String(organizationId), { _id: userId })
    expect(owners.find).toHaveBeenCalledWith({
      organizationId,
      membershipId,
      status: 'ACTIVE',
    })
    expect(groups.find).toHaveBeenCalledWith({
      organizationId,
      status: 'ACTIVE',
      _id: { $in: [groupId] },
    })
  })

  it('uses the same non-disclosing result for missing organization membership', async () => {
    const operators = { findOne: jest.fn().mockResolvedValue(null) }
    const scopedService = new GroupsService(
      model,
      model,
      model,
      model,
      model,
      model,
      operators as any,
      model,
      policy,
      consent,
    )
    await expect(
      scopedService.list('64b7c42f18f0c31f8c9fd111', {
        _id: '64b7c42f18f0c31f8c9fd112',
      }),
    ).rejects.toBeInstanceOf(NotFoundException)
  })

  it('keeps bulk failure details redacted while auditing the persistence stage', async () => {
    const organizationId = new Types.ObjectId()
    const groupId = new Types.ObjectId()
    const actorId = new Types.ObjectId()
    const previewId = new Types.ObjectId()
    const preview = {
      _id: previewId,
      status: 'PREVIEW',
      rows: [
        {
          rowNumber: 2,
          displayName: 'Synthetic Person',
          mobileNumber: '+12085551309',
          classification: 'READY_NEW_CONTACT',
          reason: 'A new organization contact will be created',
        },
      ],
      expiresAt: new Date(),
      save: jest.fn().mockResolvedValue(undefined),
    }
    const audit = { updateOne: jest.fn().mockResolvedValue({}) }
    const diagnosticService = new GroupsService(
      model,
      model,
      model,
      model,
      audit as any,
      model,
      model,
      model,
      policy,
      consent,
    )
    jest.spyOn(diagnosticService as any, 'requireGroup').mockResolvedValue({
      group: { _id: groupId, organizationId, status: 'ACTIVE' },
    })
    jest
      .spyOn(diagnosticService as any, 'findBulkImport')
      .mockResolvedValue(preview)
    jest
      .spyOn(diagnosticService as any, 'classifyBulkRow')
      .mockResolvedValue(preview.rows[0])
    jest
      .spyOn(diagnosticService, 'addPerson')
      .mockImplementation(async (...args: any[]) => {
        args[6]('AUDIT')
        throw new Error('duplicate-key details')
      })

    const result = await diagnosticService.applyBulkAdd(
      String(organizationId),
      String(groupId),
      String(previewId),
      { _id: actorId },
      { consentAffirmed: true },
      'apply-correlation',
    )

    expect(result.rows).toEqual([
      expect.objectContaining({
        rowNumber: 2,
        redactedNumber: '***1309',
        outcome: 'FAILED',
        reason: 'The row could not be completed and may be retried',
      }),
    ])
    expect(JSON.stringify(result)).not.toContain('+12085551309')
    expect(JSON.stringify(result)).not.toContain('duplicate-key details')
    expect(audit.updateOne).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'ROSTER_BULK_ROW_FAILED' }),
      expect.objectContaining({
        $setOnInsert: expect.objectContaining({
          reason: 'Persistence stage: AUDIT',
        }),
      }),
      { upsert: true },
    )
  })

  it('creates a contact and membership without fabricating consent', async () => {
    const organizationId = new Types.ObjectId()
    const groupId = new Types.ObjectId()
    const contactId = new Types.ObjectId()
    const membershipId = new Types.ObjectId()
    const actorId = new Types.ObjectId()
    const group = {
      _id: groupId,
      organizationId,
      status: 'ACTIVE',
      joinCode: 'UNIFIEDYA',
    }
    const contact = {
      _id: contactId,
      displayName: 'Synthetic Person',
      mobileNumber: '+12085550123',
    }
    const contacts = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue(contact),
      deleteOne: jest.fn(),
    }
    const memberships = {
      findOne: jest
        .fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ _id: membershipId }),
      updateOne: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
      deleteOne: jest.fn(),
    }
    const audit = {
      updateOne: jest.fn().mockResolvedValue({}),
      deleteMany: jest.fn(),
    }
    const consent = {
      isSuppressed: jest.fn().mockResolvedValue(false),
      recordOperatorConsent: jest.fn(),
    }
    const addService = new GroupsService(
      model,
      contacts as any,
      model,
      memberships as any,
      audit as any,
      model,
      model,
      model,
      policy,
      consent as any,
    )
    jest.spyOn(addService as any, 'requireGroup').mockResolvedValue({ group })

    await expect(
      addService.addPerson(
        String(organizationId),
        String(groupId),
        { _id: actorId },
        {
          displayName: 'Synthetic Person',
          mobileNumber: '(208) 555-0123',
          consentAffirmed: false,
        },
        'request-1',
      ),
    ).resolves.toEqual({
      id: String(membershipId),
      contactId: String(contactId),
      displayName: 'Synthetic Person',
      mobileNumber: '+12085550123',
      displayNumber: '(208) 555-0123',
      reusedContact: false,
    })
    expect(contacts.create).toHaveBeenCalledWith({
      organizationId,
      displayName: 'Synthetic Person',
      mobileNumber: '+12085550123',
      createdBy: String(actorId),
    })
    expect(memberships.updateOne).toHaveBeenCalledWith(
      { organizationId, groupId, contactId },
      expect.objectContaining({
        $set: expect.objectContaining({ status: 'ACTIVE' }),
      }),
      { upsert: true },
    )
    expect(consent.recordOperatorConsent).not.toHaveBeenCalled()
    expect(audit.updateOne).toHaveBeenCalledTimes(2)
  })

  it('reuses an active membership and records consent only when affirmed', async () => {
    const organizationId = new Types.ObjectId()
    const groupId = new Types.ObjectId()
    const contactId = new Types.ObjectId()
    const membershipId = new Types.ObjectId()
    const actorId = new Types.ObjectId()
    const group = {
      _id: groupId,
      organizationId,
      status: 'ACTIVE',
      joinCode: 'UNIFIEDYA',
    }
    const contact = {
      _id: contactId,
      displayName: 'Existing Person',
      mobileNumber: '+12085550123',
    }
    const contacts = { findOne: jest.fn().mockResolvedValue(contact) }
    const memberships = {
      findOne: jest.fn().mockResolvedValue({
        _id: membershipId,
        status: 'ACTIVE',
      }),
      updateOne: jest.fn(),
    }
    const consent = {
      isSuppressed: jest.fn().mockResolvedValue(false),
      recordOperatorConsent: jest.fn().mockResolvedValue({ recorded: true }),
    }
    const addService = new GroupsService(
      model,
      contacts as any,
      model,
      memberships as any,
      model,
      model,
      model,
      model,
      policy,
      consent as any,
    )
    jest.spyOn(addService as any, 'requireGroup').mockResolvedValue({ group })
    const baseInput = {
      displayName: 'Existing Person',
      mobileNumber: '(208) 555-0123',
    }

    await addService.addPerson(
      String(organizationId),
      String(groupId),
      { _id: actorId },
      { ...baseInput, consentAffirmed: false },
    )
    expect(memberships.updateOne).not.toHaveBeenCalled()
    expect(consent.recordOperatorConsent).not.toHaveBeenCalled()

    await addService.addPerson(
      String(organizationId),
      String(groupId),
      { _id: actorId },
      {
        ...baseInput,
        consentAffirmed: true,
        consentMethodNote: 'Asked in person',
      },
    )
    expect(consent.recordOperatorConsent).toHaveBeenCalledWith({
      organizationId,
      groupId,
      contactId,
      mobileNumber: '+12085550123',
      actorUserId: String(actorId),
      affirmed: true,
      methodNote: 'Asked in person',
      sourceRow: undefined,
      onPersistenceStage: undefined,
    })
  })

  it('rejects suppression and a consent note without affirmation', async () => {
    const organizationId = new Types.ObjectId()
    const groupId = new Types.ObjectId()
    const actorId = new Types.ObjectId()
    const contactId = new Types.ObjectId()
    const group = {
      _id: groupId,
      organizationId,
      status: 'ACTIVE',
      joinCode: 'UNIFIEDYA',
    }
    const contacts = { findOne: jest.fn(), create: jest.fn() }
    const memberships = { findOne: jest.fn(), updateOne: jest.fn() }
    const consent = {
      isSuppressed: jest.fn().mockResolvedValue(true),
      recordOperatorConsent: jest.fn(),
    }
    const addService = new GroupsService(
      model,
      contacts as any,
      model,
      memberships as any,
      model,
      model,
      model,
      model,
      policy,
      consent as any,
    )
    jest.spyOn(addService as any, 'requireGroup').mockResolvedValue({ group })
    const baseInput = {
      displayName: 'Synthetic Person',
      mobileNumber: '(208) 555-0123',
      consentAffirmed: false,
    }

    await expect(
      addService.addPerson(
        String(organizationId),
        String(groupId),
        { _id: actorId },
        { ...baseInput, consentMethodNote: 'Unproven note' },
      ),
    ).rejects.toBeInstanceOf(BadRequestException)
    expect(consent.isSuppressed).not.toHaveBeenCalled()

    await expect(
      addService.addPerson(
        String(organizationId),
        String(groupId),
        { _id: actorId },
        baseInput,
      ),
    ).rejects.toBeInstanceOf(ConflictException)
    expect(contacts.findOne).not.toHaveBeenCalled()
    expect(contacts.create).not.toHaveBeenCalled()
    expect(memberships.updateOne).not.toHaveBeenCalled()
    expect(consent.recordOperatorConsent).not.toHaveBeenCalled()

    consent.isSuppressed
      .mockReset()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true)
    contacts.findOne.mockResolvedValue({
      _id: contactId,
      displayName: 'Synthetic Person',
      mobileNumber: '+12085550123',
    })
    memberships.findOne.mockResolvedValue({
      _id: new Types.ObjectId(),
      status: 'ACTIVE',
    })
    await expect(
      addService.addPerson(
        String(organizationId),
        String(groupId),
        { _id: actorId },
        baseInput,
      ),
    ).rejects.toBeInstanceOf(ConflictException)
    expect(consent.isSuppressed).toHaveBeenCalledTimes(2)
  })

  it('loads group-scoped contact details without changing membership', async () => {
    const organizationId = new Types.ObjectId()
    const groupId = new Types.ObjectId()
    const contactId = new Types.ObjectId()
    const userId = new Types.ObjectId()
    const group = {
      _id: groupId,
      organizationId,
      status: 'ACTIVE',
      joinCode: 'UNIFIEDYA',
    }
    const contact = {
      _id: contactId,
      displayName: 'Synthetic Person',
      mobileNumber: '+12085550123',
    }
    const groups = { findOne: jest.fn().mockResolvedValue(group) }
    const contacts = { findOne: jest.fn().mockResolvedValue(contact) }
    const memberships = { exists: jest.fn().mockResolvedValue(true) }
    const operators = {
      findOne: jest.fn().mockResolvedValue({ _id: new Types.ObjectId() }),
    }
    const policy = {
      activeAdminMembership: jest.fn().mockResolvedValue({}),
    }
    const consent = {
      isSuppressed: jest.fn().mockResolvedValue(false),
      activeConsentViews: jest.fn().mockResolvedValue(new Map()),
    }
    const scopedService = new GroupsService(
      groups as any,
      contacts as any,
      model,
      memberships as any,
      model,
      model,
      operators as any,
      model,
      policy as any,
      consent as any,
    )

    await expect(
      scopedService.contactDetails(
        String(organizationId),
        String(groupId),
        String(contactId),
        { _id: userId },
      ),
    ).resolves.toEqual({
      contactId: String(contactId),
      displayName: 'Synthetic Person',
      displayNumber: '(208) 555-0123',
      consentStatus: 'MISSING',
    })
    expect(memberships.exists).toHaveBeenCalledWith({
      organizationId,
      groupId,
      contactId,
      status: 'ACTIVE',
    })
    expect(memberships).not.toHaveProperty('updateOne')

    consent.isSuppressed.mockResolvedValue(true)
    await expect(
      scopedService.contactDetails(
        String(organizationId),
        String(groupId),
        String(contactId),
        { _id: userId },
      ),
    ).resolves.toEqual({
      contactId: String(contactId),
      displayName: 'Synthetic Person',
      displayNumber: '(208) 555-0123',
      consentStatus: 'OPTED_OUT',
      recoveryGuidance:
        'Only the recipient can restore messaging by texting START, then JOIN UNIFIEDYA.',
    })
    expect(consent.activeConsentViews).toHaveBeenCalledTimes(1)

    group.status = 'ARCHIVED'
    await expect(
      scopedService.contactDetails(
        String(organizationId),
        String(groupId),
        String(contactId),
        { _id: userId },
      ),
    ).rejects.toBeInstanceOf(NotFoundException)
  })

  it('records consent from server-authoritative contact and group state', async () => {
    const organizationId = new Types.ObjectId()
    const groupId = new Types.ObjectId()
    const contactId = new Types.ObjectId()
    const userId = new Types.ObjectId()
    const group = {
      _id: groupId,
      organizationId,
      status: 'ACTIVE',
      joinCode: 'UNIFIEDYA',
    }
    const contact = {
      _id: contactId,
      displayName: 'Synthetic Person',
      mobileNumber: '+12085550123',
    }
    const groups = { findOne: jest.fn().mockResolvedValue(group) }
    const contacts = { findOne: jest.fn().mockResolvedValue(contact) }
    const memberships = { exists: jest.fn().mockResolvedValue(true) }
    const operators = {
      findOne: jest.fn().mockResolvedValue({ _id: new Types.ObjectId() }),
    }
    const policy = {
      activeAdminMembership: jest.fn().mockResolvedValue({}),
    }
    const consent = {
      recordOperatorConsent: jest.fn().mockResolvedValue({ recorded: true }),
      isSuppressed: jest.fn().mockResolvedValue(false),
      activeConsentViews: jest.fn().mockResolvedValue(
        new Map([
          [
            String(contactId),
            {
              status: 'ACTIVE',
              source: 'OPERATOR_AFFIRMATION',
              consentedAt: new Date('2026-08-18T12:00:00Z'),
            },
          ],
        ]),
      ),
    }
    const scopedService = new GroupsService(
      groups as any,
      contacts as any,
      model,
      memberships as any,
      model,
      model,
      operators as any,
      model,
      policy as any,
      consent as any,
    )

    await scopedService.recordContactConsent(
      String(organizationId),
      String(groupId),
      String(contactId),
      { _id: userId },
      {
        affirmed: true,
        methodNote: 'Asked in person',
        organizationId: 'forged',
        mobileNumber: '+12085550999',
        actorUserId: 'forged',
      },
    )
    expect(consent.recordOperatorConsent).toHaveBeenCalledWith({
      organizationId,
      groupId,
      contactId,
      mobileNumber: '+12085550123',
      actorUserId: String(userId),
      affirmed: true,
      methodNote: 'Asked in person',
    })

    consent.isSuppressed.mockResolvedValue(true)
    await expect(
      scopedService.recordContactConsent(
        String(organizationId),
        String(groupId),
        String(contactId),
        { _id: userId },
        { affirmed: true },
      ),
    ).rejects.toMatchObject({
      response: {
        error:
          'This person opted out. Only the recipient can restore messaging by texting START, then JOIN UNIFIEDYA.',
      },
    })
    expect(consent.recordOperatorConsent).toHaveBeenCalledTimes(1)
  })
})
