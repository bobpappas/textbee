import { NotFoundException } from '@nestjs/common'
import { Types } from 'mongoose'
import { GroupMessagingService } from './group-messaging.service'

const sorted = <T>(value: T) => ({ sort: jest.fn().mockResolvedValue(value) })
const limited = <T>(value: T) => ({ limit: jest.fn().mockResolvedValue(value) })

describe('GroupMessagingService', () => {
  const organizationId = new Types.ObjectId()
  const groupId = new Types.ObjectId()
  const userId = new Types.ObjectId()
  const membershipId = new Types.ObjectId()
  const contactOneId = new Types.ObjectId()
  const contactTwoId = new Types.ObjectId()
  const deviceId = new Types.ObjectId()

  function fixture() {
    const groups = {
      findOne: jest.fn().mockResolvedValue({
        _id: groupId,
        organizationId,
        displayName: 'Youth Group',
        status: 'ACTIVE',
      }),
    }
    const contacts = {
      find: jest.fn().mockResolvedValue([
        {
          _id: contactOneId,
          displayName: 'Synthetic One',
          mobileNumber: '+12085550123',
        },
        {
          _id: contactTwoId,
          displayName: 'Synthetic Two',
          mobileNumber: '+12085550124',
        },
      ]),
    }
    const memberships = {
      find: jest.fn().mockReturnValue(
        sorted([
          { _id: new Types.ObjectId(), contactId: contactOneId },
          { _id: new Types.ObjectId(), contactId: contactTwoId },
        ]),
      ),
    }
    const operators = {
      findOne: jest.fn().mockResolvedValue({ _id: membershipId }),
    }
    const owners = { findOne: jest.fn() }
    const devices = {
      find: jest
        .fn()
        .mockReturnValue(
          limited([{ _id: deviceId, user: userId, enabled: true }]),
        ),
    }
    const previews = {
      create: jest.fn().mockImplementation(async (value) => ({
        _id: new Types.ObjectId(),
        ...value,
      })),
    }
    const sends = { findOne: jest.fn() }
    const deliveries = { find: jest.fn() }
    const audit = {}
    const sms = {}
    const policy = {
      activeAdminMembership: jest.fn().mockResolvedValue({ _id: membershipId }),
    }
    const consent = {
      authorizeRecipients: jest.fn().mockResolvedValue([
        { recipient: '+12085550123', eligible: true },
        {
          recipient: '+12085550124',
          eligible: false,
          reason: 'ORGANIZATION_SUPPRESSION',
        },
      ]),
    }
    const gateway = { sendSMS: jest.fn() }
    const selfHostedPolicy = {
      policy: jest.fn().mockReturnValue({ recipientsPerSend: 100 }),
      previewAvailability: jest.fn().mockResolvedValue({
        minuteSegments: 100,
        dailySegments: 900,
        rolling30DaySegments: 9000,
      }),
    }
    const service = new GroupMessagingService(
      groups as any,
      contacts as any,
      memberships as any,
      owners as any,
      operators as any,
      devices as any,
      previews as any,
      sends as any,
      deliveries as any,
      audit as any,
      sms as any,
      policy as any,
      consent as any,
      gateway as any,
      selfHostedPolicy as any,
    )
    return {
      service,
      previews,
      sends,
      deliveries,
      gateway,
      operators,
      policy,
      selfHostedPolicy,
    }
  }

  it('builds a server-authoritative prefixed preview without dispatching', async () => {
    const { service, previews, gateway } = fixture()

    const result = await service.preview(
      String(organizationId),
      String(groupId),
      { _id: userId },
      { body: 'Meeting at 7' },
    )

    expect(result.message).toBe('Youth Group: Meeting at 7')
    expect(result.candidateCount).toBe(2)
    expect(result.eligibleCount).toBe(1)
    expect(result.excluded).toEqual([
      expect.objectContaining({
        displayName: 'Synthetic Two',
        maskedNumber: '***0124',
        reason: 'ORGANIZATION_SUPPRESSION',
      }),
    ])
    expect(previews.create).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Youth Group: Meeting at 7' }),
    )
    expect(gateway.sendSMS).not.toHaveBeenCalled()
  })

  it('uses the same unavailable response when organization membership is inactive', async () => {
    const { service, operators } = fixture()
    operators.findOne.mockResolvedValue(null)

    await expect(
      service.preview(
        String(organizationId),
        String(groupId),
        { _id: userId },
        { body: 'Hello' },
      ),
    ).rejects.toBeInstanceOf(NotFoundException)
  })

  it('disables confirmation when any local capacity window is exhausted', async () => {
    const { service, selfHostedPolicy } = fixture()
    selfHostedPolicy.previewAvailability.mockResolvedValue({
      minuteSegments: 0,
      dailySegments: 900,
      rolling30DaySegments: 9000,
    })

    const result = await service.preview(
      String(organizationId),
      String(groupId),
      { _id: userId },
      { body: 'Meeting at 7' },
    )

    expect(result).toMatchObject({
      capacityAvailable: false,
      canConfirm: false,
    })
  })

  it('returns an existing send for the same request without dispatching twice', async () => {
    const { service, sends, deliveries, gateway } = fixture()
    const previewId = new Types.ObjectId()
    sends.findOne.mockResolvedValue({
      _id: new Types.ObjectId(),
      organizationId,
      groupId,
      previewId,
      requestId: 'stable-request',
      groupName: 'Youth Group',
      message: 'Youth Group: Meeting at 7',
      status: 'QUEUED',
      candidateCount: 1,
    })
    deliveries.find.mockReturnValue(sorted([]))

    const result = await service.confirm(
      String(organizationId),
      String(groupId),
      String(previewId),
      { _id: userId },
      'stable-request',
    )

    expect(result.status).toBe('QUEUED')
    expect(gateway.sendSMS).not.toHaveBeenCalled()
  })
})
