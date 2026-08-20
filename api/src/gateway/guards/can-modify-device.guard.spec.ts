import { HttpException } from '@nestjs/common'
import { ExecutionContext } from '@nestjs/common'
import { CanModifyDevice } from './can-modify-device.guard'
import { GatewayService } from '../gateway.service'
import { UserRole } from '../../users/user-roles.enum'

const VALID_ID = '507f1f77bcf86cd799439011'

const contextFor = (request: any): ExecutionContext =>
  ({
    switchToHttp: () => ({ getRequest: () => request }),
  }) as unknown as ExecutionContext

describe('CanModifyDevice', () => {
  let guard: CanModifyDevice
  let gatewayService: { getDeviceById: jest.Mock }
  let policy: { activeAdminMembership: jest.Mock }

  beforeEach(() => {
    gatewayService = { getDeviceById: jest.fn() }
    policy = { activeAdminMembership: jest.fn() }
    guard = new CanModifyDevice(
      gatewayService as unknown as GatewayService,
      policy as any,
    )
  })

  it('allows the owner of the device', async () => {
    gatewayService.getDeviceById.mockResolvedValue({ user: 'user_1' })
    const request = { params: { id: VALID_ID }, user: { id: 'user_1' } }

    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true)
  })

  it('rejects a non-owner (cross-tenant access)', async () => {
    gatewayService.getDeviceById.mockResolvedValue({ user: 'owner' })
    const request = { params: { id: VALID_ID }, user: { id: 'attacker' } }

    await expect(guard.canActivate(contextFor(request))).rejects.toThrow(
      HttpException,
    )
  })

  it('does not treat the legacy ADMIN role as organization authority', async () => {
    gatewayService.getDeviceById.mockResolvedValue({ user: 'owner' })
    const request = {
      params: { id: VALID_ID },
      user: { id: 'someone-else', role: UserRole.ADMIN },
    }

    await expect(guard.canActivate(contextFor(request))).rejects.toMatchObject({
      status: 404,
    })
  })

  it('allows an active administrator for a migrated device organization', async () => {
    gatewayService.getDeviceById.mockResolvedValue({
      organizationId: VALID_ID,
      user: 'legacy-owner',
    })
    policy.activeAdminMembership.mockResolvedValue({ _id: 'membership' })
    const request = {
      params: { id: VALID_ID },
      user: { id: '507f191e810c19729de860ea' },
    }

    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true)
    expect(request).toHaveProperty('organizationId', VALID_ID)
  })

  it('allows only a same-organization gateway operation key', async () => {
    gatewayService.getDeviceById.mockResolvedValue({
      organizationId: VALID_ID,
      user: 'legacy-owner',
    })
    const request = {
      params: { id: VALID_ID },
      user: { id: 'legacy-owner' },
      apiKey: {
        organizationId: VALID_ID,
        purpose: 'GATEWAY',
        scopes: ['gateway:operate'],
      },
    }

    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true)
    expect(policy.activeAdminMembership).not.toHaveBeenCalled()
  })

  it('hides a migrated device from a cross-organization gateway key', async () => {
    gatewayService.getDeviceById.mockResolvedValue({
      organizationId: VALID_ID,
      user: 'legacy-owner',
    })
    const request = {
      params: { id: VALID_ID },
      apiKey: {
        organizationId: '507f191e810c19729de860ea',
        purpose: 'GATEWAY',
        scopes: ['gateway:operate'],
      },
    }

    await expect(guard.canActivate(contextFor(request))).rejects.toMatchObject({
      status: 404,
    })
  })

  it('throws 400 for an invalid device id', async () => {
    const request = {
      params: { id: 'not-an-objectid' },
      user: { id: 'user_1' },
    }

    await expect(guard.canActivate(contextFor(request))).rejects.toThrow(
      HttpException,
    )
    expect(gatewayService.getDeviceById).not.toHaveBeenCalled()
  })

  it('rejects when the device does not exist', async () => {
    gatewayService.getDeviceById.mockResolvedValue(null)
    const request = { params: { id: VALID_ID }, user: { id: 'user_1' } }

    await expect(guard.canActivate(contextFor(request))).rejects.toThrow(
      HttpException,
    )
  })
})
