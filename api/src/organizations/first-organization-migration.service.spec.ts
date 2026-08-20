import { BadRequestException } from '@nestjs/common'
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

  beforeEach(() => {
    resources = Array.from({ length: 7 }, resource)
    audits = { updateOne: jest.fn().mockResolvedValue({ upsertedCount: 1 }) }
    service = new FirstOrganizationMigrationService(
      {
        transaction: jest.fn(async (callback) => callback({ id: 'session' })),
      } as any,
      {
        findOne: jest.fn().mockResolvedValue({ _id: organizationId }),
        updateOne: jest.fn(),
      } as any,
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

  it('requires backup and rollback evidence before apply', async () => {
    await expect(
      service.run({
        organizationId: String(organizationId),
        administratorEmails: ['admin@example.test'],
        apply: true,
      }),
    ).rejects.toBeInstanceOf(BadRequestException)
  })

  it('applies idempotent scoped updates and one stable audit operation', async () => {
    await expect(
      service.run({
        organizationId: String(organizationId),
        administratorEmails: ['admin@example.test'],
        apply: true,
        backupConfirmed: true,
        rollbackPath: 'restore the verified pre-migration snapshot',
      }),
    ).resolves.toMatchObject({ mode: 'APPLY', backupConfirmed: true })

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
})
