import { UserRole } from '../users/user-roles.enum'
import {
  PLATFORM_ORGANIZATIONS_MANAGE,
  PlatformPolicyService,
} from './platform-policy.service'

describe('PlatformPolicyService', () => {
  const policy = new PlatformPolicyService()

  it('maps the legacy ADMIN role through one platform capability check', () => {
    expect(
      policy.hasCapability(
        { role: UserRole.ADMIN },
        PLATFORM_ORGANIZATIONS_MANAGE,
      ),
    ).toBe(true)
  })

  it('denies ordinary users and API-key authentication', () => {
    expect(
      policy.hasCapability(
        { role: UserRole.REGULAR },
        PLATFORM_ORGANIZATIONS_MANAGE,
      ),
    ).toBe(false)
    expect(
      policy.hasCapability(
        { role: UserRole.ADMIN },
        PLATFORM_ORGANIZATIONS_MANAGE,
        true,
      ),
    ).toBe(false)
  })
})
