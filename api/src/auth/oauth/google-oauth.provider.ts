import { Inject, Injectable, Optional } from '@nestjs/common'
import { OAuth2Client } from 'google-auth-library'
import {
  OAuthIdentityProvider,
  OAuthProviderSettings,
} from './oauth-provider.types'

export const GOOGLE_OAUTH_CLIENT = Symbol('GOOGLE_OAUTH_CLIENT')

type GoogleTokenVerifier = Pick<OAuth2Client, 'verifyIdToken'>

@Injectable()
export class GoogleOAuthProvider implements OAuthIdentityProvider {
  readonly key = 'google'

  constructor(
    @Optional()
    @Inject(GOOGLE_OAUTH_CLIENT)
    private readonly client: GoogleTokenVerifier = new OAuth2Client(),
  ) {}

  validateConfiguration(settings: OAuthProviderSettings): void {
    if (
      typeof settings.audience !== 'string' ||
      !/^[A-Za-z0-9._-]+\.apps\.googleusercontent\.com$/.test(settings.audience)
    ) {
      throw new Error('invalid Google OAuth configuration')
    }
  }

  async verify(credential: string, settings: OAuthProviderSettings) {
    this.validateConfiguration(settings)
    const ticket = await this.client.verifyIdToken({
      idToken: credential,
      audience: settings.audience as string,
    })
    const payload = ticket.getPayload()
    if (
      !payload ||
      (payload.iss !== 'accounts.google.com' &&
        payload.iss !== 'https://accounts.google.com') ||
      typeof payload.sub !== 'string' ||
      payload.sub.trim() === '' ||
      typeof payload.email !== 'string' ||
      payload.email_verified !== true
    ) {
      throw new Error('invalid Google identity')
    }

    return {
      providerKey: this.key,
      subject: payload.sub,
      normalizedEmail: payload.email,
      emailVerified: true as const,
      auditMetadata: {
        issuer: payload.iss,
      },
    }
  }
}
