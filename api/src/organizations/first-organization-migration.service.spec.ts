import { BadRequestException, ConflictException } from '@nestjs/common'
import { Types } from 'mongoose'
import { FirstOrganizationMigrationService } from './first-organization-migration.service'

describe('FirstOrganizationMigrationService', () => {
  const organizationId = new Types.ObjectId()
  const userId = new Types.ObjectId()
  const membershipId = new Types.ObjectId()
  const resource = () => ({
    countDocuments: jest.fn().mockResolvedValue(0),
    updateMany: jest.fn().mockResolvedValue({ modifiedCount: 0 }),
  })
  let service: FirstOrganizationMigrationService
  let resources: ReturnType<typeof resource>[]
  let audits: any
  let connection: any
  let organizations: any
  let topologyCommand: jest.Mock

  beforeEach(() => {
    resources = Array.from({ length: 7 }, resource)
    audits = { updateOne: jest.fn().mockResolvedValue({ upsertedCount: 1 }) }
    topologyCommand = jest.fn().mockResolvedValue({ setName: 'rs0' })
    connection = {
      db: {
        admin: jest.fn(() => ({
          command: topologyCommand,
        })),
      },
      transaction: jest.fn(async (callback) => callback({ id: 'session' })),
    }
    organizations = {
      findOne: jest.fn().mockResolvedValue({ _id: organizationId }),
      countDocuments: jest.fn().mockResolvedValue(1),
      updateOne: jest.fn(),
    }
    service = new FirstOrganizationMigrationService(
      connection,
      organizations,
      {
        find: jest.fn().mockResolvedValue([{ _id: membershipId }]),
      } as any,
      {
        find: jest.fn().mockResolvedValue([{ membershipId }]),
      } as any,
      audits,
      {
        find: jest
          .fn()
          .mockResolvedValue([{ _id: userId, email: 'admin@example.test' }]),
      } as any,
      resources[0] as any,
      resources[1] as any,
      resources[2] as any,
      resources[3] as any,
      resources[4] as any,
      resources[5] as any,
      resources[6] as any,
    )
  })

  it('uses the same validation path for a secret-safe dry run', async () => {
    await expect(
      service.run({
        organizationId: String(organizationId),
        administratorEmails: [' Admin@Example.test '],
        apply: false,
      }),
    ).resolves.toMatchObject({
      mode: 'DRY_RUN',
      organizationId: String(organizationId),
      assigned: expect.any(Object),
      unassigned: expect.any(Object),
    })
    expect(
      resources.every((model) => model.updateMany.mock.calls.length === 0),
    ).toBe(true)
  })

  it('rejects ambiguous active first-organization state', async () => {
    organizations.countDocuments.mockResolvedValue(2)

    await expect(
      service.run({
        organizationId: String(organizationId),
        administratorEmails: ['admin@example.test'],
        apply: false,
      }),
    ).rejects.toBeInstanceOf(ConflictException)
    expect(connection.transaction).not.toHaveBeenCalled()
  })

  it('requires backup and rollback evidence before apply', async () => {
    await expect(
      service.run({
        organizationId: String(organizationId),
        administratorEmails: ['admin@example.test'],
        apply: true,
      }),
    ).rejects.toBeInstanceOf(BadRequestException)
  })

  it('rejects standalone MongoDB before starting a transaction or writes', async () => {
    topologyCommand.mockResolvedValue({ ok: 1 })

    await expect(
      service.run({
        organizationId: String(organizationId),
        administratorEmails: ['admin@example.test'],
        apply: true,
        backupConfirmed: true,
        rollbackPath: 'credential-free verified restore runbook',
      }),
    ).rejects.toMatchObject({
      response: {
        code: 'MIGRATION_TRANSACTION_TOPOLOGY_REQUIRED',
        error: expect.stringContaining('replica set or sharded cluster'),
      },
    })

    expect(connection.transaction).not.toHaveBeenCalled()
    expect(
      resources.every((model) => model.updateMany.mock.calls.length === 0),
    ).toBe(true)
  })

  it('reports an actionable error when topology cannot be verified', async () => {
    topologyCommand.mockRejectedValue(new Error('raw driver error'))

    await expect(
      service.run({
        organizationId: String(organizationId),
        administratorEmails: ['admin@example.test'],
        apply: true,
        backupConfirmed: true,
        rollbackPath: 'credential-free verified restore runbook',
      }),
    ).rejects.toMatchObject({
      response: {
        code: 'MIGRATION_TRANSACTION_TOPOLOGY_UNVERIFIED',
        error: expect.not.stringContaining('raw driver error'),
      },
    })
    expect(connection.transaction).not.toHaveBeenCalled()
  })

  it('repeats validation inside apply transaction', async () => {
    organizations.countDocuments
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(2)

    await expect(
      service.run({
        organizationId: String(organizationId),
        administratorEmails: ['admin@example.test'],
        apply: true,
        backupConfirmed: true,
        rollbackPath: 'credential-free verified restore runbook',
      }),
    ).rejects.toBeInstanceOf(ConflictException)

    expect(connection.transaction).toHaveBeenCalledTimes(1)
    expect(
      resources.every((model) => model.updateMany.mock.calls.length === 0),
    ).toBe(true)
  })

  it('applies idempotent scoped updates and one stable audit operation', async () => {
    const result = await service.run({
      organizationId: String(organizationId),
      administratorEmails: ['admin@example.test'],
      apply: true,
      backupConfirmed: true,
      rollbackPath: 'credential-free verified restore runbook',
    })

    expect(result).toMatchObject({
      mode: 'APPLY',
      backupConfirmed: true,
      rollbackAcknowledged: true,
    })
    expect(result).not.toHaveProperty('rollbackPath')

    expect(
      resources.every((model) => model.updateMany.mock.calls.length === 1),
    ).toBe(true)
    expect(audits.updateOne).toHaveBeenCalledWith(
      expect.objectContaining({
        operationKey: `b014-first-organization:${organizationId}`,
      }),
      expect.objectContaining({ $setOnInsert: expect.any(Object) }),
      expect.objectContaining({ upsert: true }),
    )
  })

  it('checks unassigned-resource postconditions inside the transaction', async () => {
    resources[0].countDocuments.mockImplementation(
      (filter: Record<string, any>, options?: Record<string, any>) =>
        Promise.resolve(
          options?.session &&
            !('user' in filter) &&
            filter.organizationId?.$exists === false
            ? 1
            : 0,
        ),
    )

    await expect(
      service.run({
        organizationId: String(organizationId),
        administratorEmails: ['admin@example.test'],
        apply: true,
        backupConfirmed: true,
        rollbackPath: 'credential-free verified restore runbook',
      }),
    ).rejects.toBeInstanceOf(ConflictException)

    expect(connection.transaction).toHaveBeenCalledTimes(1)
  })
})
