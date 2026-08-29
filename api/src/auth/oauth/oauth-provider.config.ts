import { OAuthProviderConfiguration } from './oauth-provider.types'

const PROVIDER_KEY = /^[a-z][a-z0-9-]{0,62}$/

export class OAuthProviderConfigurationError extends Error {
  constructor() {
    super('OAuth provider configuration is invalid')
  }
}

export const parseOAuthProviderConfigurations = (
  raw = process.env.OAUTH_PROVIDER_CONFIG,
): OAuthProviderConfiguration[] => {
  if (raw === undefined || raw.trim() === '') return []

  let input: unknown
  try {
    input = JSON.parse(raw)
  } catch {
    throw new OAuthProviderConfigurationError()
  }
  if (!Array.isArray(input)) throw new OAuthProviderConfigurationError()

  return input.map((entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new OAuthProviderConfigurationError()
    }
    const value = entry as Record<string, unknown>
    if (
      typeof value.key !== 'string' ||
      !PROVIDER_KEY.test(value.key) ||
      typeof value.enabled !== 'boolean' ||
      !value.settings ||
      typeof value.settings !== 'object' ||
      Array.isArray(value.settings)
    ) {
      throw new OAuthProviderConfigurationError()
    }
    return {
      key: value.key,
      enabled: value.enabled,
      settings: Object.freeze({
        ...(value.settings as Record<string, unknown>),
      }),
    }
  })
}
