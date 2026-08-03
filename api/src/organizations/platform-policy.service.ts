import { Injectable } from '@nestjs/common'
import { UserRole } from '../users/user-roles.enum'

export const PLATFORM_ORGANIZATIONS_MANAGE =
  'platform:organizations:manage' as const

@Injectable()
export class PlatformPolicyService {
  hasCapability(
    user: { role?: string } | undefined,
    capability: typeof PLATFORM_ORGANIZATIONS_MANAGE,
    authenticatedWithApiKey = false,
  ): boolean {
    if (authenticatedWithApiKey) return false
    return (
      capability === PLATFORM_ORGANIZATIONS_MANAGE &&
      user?.role === UserRole.ADMIN
    )
  }
}
