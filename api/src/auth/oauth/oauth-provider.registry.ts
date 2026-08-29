import { Inject, Injectable, UnauthorizedException } from '@nestjs/common'
import {
  normalizeOAuthEmail,
  OAuthIdentityProvider,
  OAuthProviderConfiguration,
  VerifiedOAuthIdentity,
} from './oauth-provider.types'

const GENERIC_FAILURE = 'Authentication unavailable'
const SAFE_METADATA_KEY = /^[a-z][a-zA-Z0-9]{0,63}$/
const SENSITIVE_METADATA_KEY = /(token|credential|secret|assertion|password)/i

export const OAUTH_PROVIDER_CONFIGURATIONS = Symbol(
  'OAUTH_PROVIDER_CONFIGURATIONS',
)
export const OAUTH_PROVIDER_ADAPTERS = Symbol('OAUTH_PROVIDER_ADAPTERS')

@Injectable()
export class OAuthProviderRegistry {
  private readonly enabled = new Map<
    string,
    {
      adapter: OAuthIdentityProvider
      configuration: OAuthProviderConfiguration
    }
  >()

  constructor(
    @Inject(OAUTH_PROVIDER_CONFIGURATIONS)
    configurations: readonly OAuthProviderConfiguration[],
    @Inject(OAUTH_PROVIDER_ADAPTERS)
    adapters: readonly OAuthIdentityProvider[],
  ) {
    const adaptersByKey = new Map<string, OAuthIdentityProvider>()
    for (const adapter of adapters) {
      if (adaptersByKey.has(adapter.key)) this.configurationFailure()
      adaptersByKey.set(adapter.key, adapter)
    }

    const configuredKeys = new Set<string>()
    for (const configuration of configurations) {
      if (configuredKeys.has(configuration.key)) this.configurationFailure()
      configuredKeys.add(configuration.key)
      if (!configuration.enabled) continue

      const adapter = adaptersByKey.get(configuration.key)
      if (!adapter) this.configurationFailure()
      try {
        adapter.validateConfiguration(configuration.settings)
      } catch {
        this.configurationFailure()
      }
      this.enabled.set(configuration.key, { adapter, configuration })
    }
  }

  async verify(providerKey: string, credential: string) {
    const provider = this.enabled.get(providerKey)
    if (
      !provider ||
      typeof credential !== 'string' ||
      credential.length === 0
    ) {
      throw new UnauthorizedException(GENERIC_FAILURE)
    }

    let identity: VerifiedOAuthIdentity
    try {
      identity = await provider.adapter.verify(
        credential,
        provider.configuration.settings,
      )
    } catch {
      throw new UnauthorizedException(GENERIC_FAILURE)
    }
    return this.validateIdentity(providerKey, identity)
  }

  isEnabled(providerKey: string) {
    return this.enabled.has(providerKey)
  }

  private validateIdentity(
    providerKey: string,
    identity: VerifiedOAuthIdentity,
  ): VerifiedOAuthIdentity {
    const normalizedEmail =
      typeof identity?.normalizedEmail === 'string'
        ? normalizeOAuthEmail(identity.normalizedEmail)
        : ''
    if (
      identity?.providerKey !== providerKey ||
      typeof identity.subject !== 'string' ||
      identity.subject.trim() === '' ||
      identity.emailVerified !== true ||
      normalizedEmail === '' ||
      !normalizedEmail.includes('@') ||
      !this.safeMetadata(identity.auditMetadata)
    ) {
      throw new UnauthorizedException(GENERIC_FAILURE)
    }
    return Object.freeze({
      providerKey,
      subject: identity.subject,
      normalizedEmail,
      emailVerified: true as const,
      auditMetadata: Object.freeze({ ...identity.auditMetadata }),
    })
  }

  private safeMetadata(
    metadata: Readonly<Record<string, string | number | boolean>>,
  ) {
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
      return false
    }
    return Object.entries(metadata).every(
      ([key, value]) =>
        SAFE_METADATA_KEY.test(key) &&
        !SENSITIVE_METADATA_KEY.test(key) &&
        ['string', 'number', 'boolean'].includes(typeof value),
    )
  }

  private configurationFailure(): never {
    throw new Error('OAuth provider registry configuration is invalid')
  }
}
