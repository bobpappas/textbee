import { forwardRef, Module } from '@nestjs/common'
import { JwtModule } from '@nestjs/jwt'
import { MongooseModule } from '@nestjs/mongoose'
import { PassportModule } from '@nestjs/passport'
import { UsersModule } from '../users/users.module'
import { AuthController } from './auth.controller'
import { AuthService } from './auth.service'
import { JwtStrategy } from './jwt.strategy'
import { ApiKey, ApiKeySchema } from './schemas/api-key.schema'
import { MailModule } from 'src/mail/mail.module'
import { CommonModule } from '../common/common.module'
import {
  PasswordReset,
  PasswordResetSchema,
} from './schemas/password-reset.schema'
import { AccessLog, AccessLogSchema } from './schemas/access-log.schema'
import {
  EmailVerification,
  EmailVerificationSchema,
} from './schemas/email-verification.schema'
import { AuthGuard } from './guards/auth.guard'
import { OptionalAuthGuard } from './guards/optional-auth.guard'
import { OrganizationsModule } from '../organizations/organizations.module'
import { parseOAuthProviderConfigurations } from './oauth/oauth-provider.config'
import {
  OAUTH_PROVIDER_ADAPTERS,
  OAUTH_PROVIDER_CONFIGURATIONS,
  OAuthProviderRegistry,
} from './oauth/oauth-provider.registry'
import { OAuthAuthenticationOrchestrator } from './oauth/oauth-authentication.orchestrator'
import {
  OAuthApproval,
  OAuthApprovalSchema,
} from './oauth/schemas/oauth-approval.schema'
import {
  OAuthIdentityBinding,
  OAuthIdentityBindingSchema,
} from './oauth/schemas/oauth-identity-binding.schema'
import {
  OAuthAuthenticationAuditEvent,
  OAuthAuthenticationAuditEventSchema,
} from './oauth/schemas/oauth-authentication-audit-event.schema'
import {
  GOOGLE_OAUTH_CLIENT,
  GoogleOAuthProvider,
} from './oauth/google-oauth.provider'
import { OAuth2Client } from 'google-auth-library'
import { OAuthSessionAuthorizationService } from './oauth/oauth-session-authorization.service'
import { OAuthApprovalService } from './oauth/oauth-approval.service'
import { GoogleLegacyIdentityAdoptionService } from './oauth/google-legacy-identity-adoption.service'
import {
  OAuthPlatformAuthorityInvariant,
  OAuthPlatformAuthorityInvariantSchema,
} from './oauth/schemas/oauth-platform-authority-invariant.schema'

@Module({
  imports: [
    MongooseModule.forFeature([
      {
        name: ApiKey.name,
        schema: ApiKeySchema,
      },
      {
        name: PasswordReset.name,
        schema: PasswordResetSchema,
      },
      {
        name: AccessLog.name,
        schema: AccessLogSchema,
      },
      {
        name: EmailVerification.name,
        schema: EmailVerificationSchema,
      },
      {
        name: OAuthApproval.name,
        schema: OAuthApprovalSchema,
      },
      {
        name: OAuthIdentityBinding.name,
        schema: OAuthIdentityBindingSchema,
      },
      {
        name: OAuthAuthenticationAuditEvent.name,
        schema: OAuthAuthenticationAuditEventSchema,
      },
      {
        name: OAuthPlatformAuthorityInvariant.name,
        schema: OAuthPlatformAuthorityInvariantSchema,
      },
    ]),
    UsersModule,
    PassportModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET,
      signOptions: {
        expiresIn: process.env.JWT_EXPIRATION || ('60d' as any),
      },
    }),
    MailModule,
    CommonModule,
    forwardRef(() => OrganizationsModule),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,
    AuthGuard,
    OptionalAuthGuard,
    {
      provide: OAUTH_PROVIDER_CONFIGURATIONS,
      useFactory: parseOAuthProviderConfigurations,
    },
    {
      provide: OAUTH_PROVIDER_ADAPTERS,
      useFactory: (google: GoogleOAuthProvider) => [google],
      inject: [GoogleOAuthProvider],
    },
    { provide: GOOGLE_OAUTH_CLIENT, useFactory: () => new OAuth2Client() },
    GoogleOAuthProvider,
    OAuthSessionAuthorizationService,
    OAuthApprovalService,
    GoogleLegacyIdentityAdoptionService,
    OAuthProviderRegistry,
    OAuthAuthenticationOrchestrator,
  ],
  exports: [
    AuthService,
    JwtModule,
    AuthGuard,
    OptionalAuthGuard,
    OAuthProviderRegistry,
    OAuthAuthenticationOrchestrator,
  ],
})
export class AuthModule {}
