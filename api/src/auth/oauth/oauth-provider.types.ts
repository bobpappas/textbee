export type OAuthProviderSettings = Readonly<Record<string, unknown>>

export interface OAuthProviderConfiguration {
  key: string
  enabled: boolean
  settings: OAuthProviderSettings
}

export interface VerifiedOAuthIdentity {
  providerKey: string
  subject: string
  normalizedEmail: string
  emailVerified: true
  auditMetadata: Readonly<Record<string, string | number | boolean>>
}

export interface OAuthIdentityProvider {
  readonly key: string

  validateConfiguration(settings: OAuthProviderSettings): void

  verify(
    credential: string,
    settings: OAuthProviderSettings,
  ): Promise<VerifiedOAuthIdentity>
}

export const normalizeOAuthEmail = (email: string): string =>
  email.trim().toLocaleLowerCase('und')
