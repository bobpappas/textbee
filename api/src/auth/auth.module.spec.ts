import { MODULE_METADATA } from '@nestjs/common/constants'
import { AuthModule } from './auth.module'
import { OptionalAuthGuard } from './guards/optional-auth.guard'
import { OAuthApprovalService } from './oauth/oauth-approval.service'
import { OAuthSessionAuthorizationService } from './oauth/oauth-session-authorization.service'

describe('AuthModule consumer contract', () => {
  const providers: unknown[] =
    Reflect.getMetadata(MODULE_METADATA.PROVIDERS, AuthModule) ?? []
  const exported: unknown[] =
    Reflect.getMetadata(MODULE_METADATA.EXPORTS, AuthModule) ?? []

  it('exports the session dependency required by its exported optional guard', () => {
    expect(providers).toContain(OptionalAuthGuard)
    expect(exported).toContain(OptionalAuthGuard)
    expect(providers).toContain(OAuthSessionAuthorizationService)
    expect(exported).toContain(OAuthSessionAuthorizationService)
  })

  it('does not expose unrelated OAuth administration behavior', () => {
    expect(exported).not.toContain(OAuthApprovalService)
  })
})
