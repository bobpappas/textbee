import { UnauthorizedException } from '@nestjs/common'
import {
  OAuthProviderConfigurationError,
  parseOAuthProviderConfigurations,
} from './oauth-provider.config'
import { OAuthProviderRegistry } from './oauth-provider.registry'
import { OAuthIdentityProvider } from './oauth-provider.types'

const synthetic = (
  overrides: Partial<OAuthIdentityProvider> = {},
): OAuthIdentityProvider => ({
  key: 'synthetic',
  validateConfiguration: jest.fn((settings) => {
    if (settings.audience !== 'textbee-test') throw new Error('bad audience')
  }),
  verify: jest.fn(async () => ({
    providerKey: 'synthetic',
    subject: 'subject-1',
    normalizedEmail: ' Operator@Example.com ',
    emailVerified: true as const,
    auditMetadata: { issuer: 'synthetic.test', keyVersion: 2 },
  })),
  ...overrides,
})

const enabled = [
  { key: 'synthetic', enabled: true, settings: { audience: 'textbee-test' } },
]

describe('OAuthProviderRegistry', () => {
  it('returns one normalized provider-neutral identity', async () => {
    const registry = new OAuthProviderRegistry(enabled, [synthetic()])

    await expect(
      registry.verify('synthetic', 'valid-credential'),
    ).resolves.toEqual({
      providerKey: 'synthetic',
      subject: 'subject-1',
      normalizedEmail: 'operator@example.com',
      emailVerified: true,
      auditMetadata: { issuer: 'synthetic.test', keyVersion: 2 },
    })
  })

  it.each([
    ['unknown', 'unknown', enabled, [synthetic()]],
    [
      'disabled',
      'synthetic',
      [{ ...enabled[0], enabled: false }],
      [synthetic()],
    ],
  ])(
    'rejects an %s provider with the same generic result',
    async (_case, key, configs, adapters) => {
      const registry = new OAuthProviderRegistry(configs, adapters)

      await expect(registry.verify(key, 'credential')).rejects.toMatchObject({
        message: 'Authentication unavailable',
      })
    },
  )

  it('rejects duplicate configuration before verification', () => {
    expect(
      () => new OAuthProviderRegistry([...enabled, ...enabled], [synthetic()]),
    ).toThrow('OAuth provider registry configuration is invalid')
  })

  it('rejects duplicate adapters before verification', () => {
    expect(
      () => new OAuthProviderRegistry(enabled, [synthetic(), synthetic()]),
    ).toThrow('OAuth provider registry configuration is invalid')
  })

  it('rejects missing adapters and incomplete adapter configuration', () => {
    expect(() => new OAuthProviderRegistry(enabled, [])).toThrow(
      'OAuth provider registry configuration is invalid',
    )
    expect(
      () =>
        new OAuthProviderRegistry(
          [{ ...enabled[0], settings: {} }],
          [synthetic()],
        ),
    ).toThrow('OAuth provider registry configuration is invalid')
  })

  it.each([
    { subject: '' },
    { emailVerified: false },
    { providerKey: 'another-provider' },
    { auditMetadata: { token: 'must-not-survive' } },
  ])(
    'rejects an invalid or unsafe identity without leaking detail: %p',
    async (identity) => {
      const adapter = synthetic({
        verify: jest.fn(
          async () =>
            ({
              providerKey: 'synthetic',
              subject: 'subject-1',
              normalizedEmail: 'operator@example.com',
              emailVerified: true,
              auditMetadata: {},
              ...identity,
            }) as any,
        ),
      })
      const registry = new OAuthProviderRegistry(enabled, [adapter])

      await expect(registry.verify('synthetic', 'credential')).rejects.toEqual(
        new UnauthorizedException('Authentication unavailable'),
      )
    },
  )

  it('sanitizes adapter failures', async () => {
    const registry = new OAuthProviderRegistry(enabled, [
      synthetic({
        verify: jest.fn(async () => {
          throw new Error('credential abc123 failed')
        }),
      }),
    ])

    await expect(registry.verify('synthetic', 'abc123')).rejects.toMatchObject({
      message: 'Authentication unavailable',
    })
  })
})

describe('parseOAuthProviderConfigurations', () => {
  it('uses an empty registry when configuration is absent', () => {
    expect(parseOAuthProviderConfigurations('')).toEqual([])
  })

  it('parses provider settings without changing them', () => {
    expect(
      parseOAuthProviderConfigurations(
        '[{"key":"synthetic","enabled":true,"settings":{"audience":"textbee-test"}}]',
      ),
    ).toEqual(enabled)
  })

  it('requires exactly one enabled Google provider in production', () => {
    expect(() => parseOAuthProviderConfigurations('', 'production')).toThrow(
      OAuthProviderConfigurationError,
    )
    expect(() =>
      parseOAuthProviderConfigurations(
        '[{"key":"synthetic","enabled":true,"settings":{}}]',
        'production',
      ),
    ).toThrow(OAuthProviderConfigurationError)
    expect(
      parseOAuthProviderConfigurations(
        '[{"key":"google","enabled":true,"settings":{"audience":"client.apps.googleusercontent.com"}}]',
        'production',
      ),
    ).toHaveLength(1)
  })

  it.each(['not-json', '{}', '[{"key":"UPPER","enabled":true,"settings":{}}]'])(
    'rejects malformed configuration without echoing it: %s',
    (raw) => {
      expect(() => parseOAuthProviderConfigurations(raw)).toThrow(
        OAuthProviderConfigurationError,
      )
      try {
        parseOAuthProviderConfigurations(raw)
      } catch (error) {
        expect((error as Error).message).toBe(
          'OAuth provider configuration is invalid',
        )
      }
    },
  )
})
