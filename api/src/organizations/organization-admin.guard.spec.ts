import { ExecutionContext, NotFoundException } from '@nestjs/common'
import { OrganizationAdminGuard } from './organization-admin.guard'

const contextFor = (request: any): ExecutionContext =>
  ({
    switchToHttp: () => ({ getRequest: () => request }),
  }) as unknown as ExecutionContext

describe('OrganizationAdminGuard', () => {
  const policy = { activeAdminMembership: jest.fn() }
  const guard = new OrganizationAdminGuard(policy as any)

  beforeEach(() => policy.activeAdminMembership.mockReset())

  it('accepts a scoped membership and attaches it for downstream use', async () => {
    const membership = { _id: 'membership-1' }
    policy.activeAdminMembership.mockResolvedValue(membership)
    const request = {
      user: { _id: '507f1f77bcf86cd799439011' },
      params: { organizationId: '507f1f77bcf86cd799439012' },
    }
    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true)
    expect(request).toHaveProperty('organizationMembership', membership)
  })

  it('returns the same non-disclosing result for absent authority and API-key auth', async () => {
    policy.activeAdminMembership.mockResolvedValue(null)
    await expect(
      guard.canActivate(
        contextFor({
          user: { _id: 'user' },
          params: { organizationId: 'org' },
        }),
      ),
    ).rejects.toBeInstanceOf(NotFoundException)

    await expect(
      guard.canActivate(
        contextFor({
          apiKey: { _id: 'key' },
          user: { _id: 'user' },
          params: { organizationId: 'org' },
        }),
      ),
    ).rejects.toBeInstanceOf(NotFoundException)
    expect(policy.activeAdminMembership).toHaveBeenCalledTimes(1)
  })
})
