import { ExecutionContext } from '@nestjs/common'
import { CanRegisterDevice } from './can-register-device.guard'

const organizationId = '507f1f77bcf86cd799439011'
const contextFor = (request: any): ExecutionContext =>
  ({
    switchToHttp: () => ({ getRequest: () => request }),
  }) as unknown as ExecutionContext

describe('CanRegisterDevice', () => {
  const policy = { soleAdminOrganizationId: jest.fn() }
  const guard = new CanRegisterDevice(policy as any)

  beforeEach(() => jest.clearAllMocks())

  it('allows a least-privilege organization gateway key', async () => {
    const request = {
      apiKey: {
        organizationId,
        purpose: 'GATEWAY',
        scopes: ['gateway:operate'],
      },
    }

    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true)
    expect(request).toHaveProperty('organizationId', organizationId)
  })

  it.each([
    [{ organizationId, purpose: 'OPERATOR', scopes: ['gateway:operate'] }],
    [{ organizationId, purpose: 'GATEWAY', scopes: [] }],
    [{ purpose: 'GATEWAY', scopes: ['gateway:operate'] }],
  ])(
    'rejects a key without the complete gateway authority tuple',
    async (apiKey) => {
      await expect(
        guard.canActivate(contextFor({ apiKey })),
      ).rejects.toMatchObject({ status: 404 })
    },
  )

  it('allows a human only when exactly one active admin organization resolves', async () => {
    policy.soleAdminOrganizationId.mockResolvedValue(organizationId)
    const request = { user: { id: '507f191e810c19729de860ea' } }

    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true)
    expect(request).toHaveProperty('organizationId', organizationId)
  })
})
