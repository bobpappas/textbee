import {
  BadRequestException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common'
import { Types } from 'mongoose'
import { GroupsService } from './groups.service'

describe('GroupsService validation', () => {
  const model = {} as any
  const policy = {} as any
  const service = new GroupsService(
    model,
    model,
    model,
    model,
    model,
    model,
    model,
    policy,
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
      membershipModel as any,
      model,
      policy,
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
      operators as any,
      model,
      scopedPolicy as any,
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
      operators as any,
      model,
      policy,
    )
    await expect(
      scopedService.list('64b7c42f18f0c31f8c9fd111', {
        _id: '64b7c42f18f0c31f8c9fd112',
      }),
    ).rejects.toBeInstanceOf(NotFoundException)
  })
})
