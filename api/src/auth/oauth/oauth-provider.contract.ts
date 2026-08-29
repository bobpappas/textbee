import { OAuthProviderRegistry } from './oauth-provider.registry'
import {
  OAuthIdentityProvider,
  OAuthProviderSettings,
} from './oauth-provider.types'

export interface OAuthProviderContractHarness {
  createAdapter(): OAuthIdentityProvider
  validSettings: OAuthProviderSettings
  incompleteSettings: OAuthProviderSettings
  validCredential: string
  invalidCredential: string
}

// Every future provider adapter runs this suite before it can be registered.
export const runOAuthProviderContract = (
  providerName: string,
  harness: OAuthProviderContractHarness,
) => {
  describe(`${providerName} OAuth provider contract`, () => {
    const registry = () => {
      const adapter = harness.createAdapter()
      return new OAuthProviderRegistry(
        [
          {
            key: adapter.key,
            enabled: true,
            settings: harness.validSettings,
          },
        ],
        [adapter],
      )
    }

    it('returns a stable subject and verified normalized email', async () => {
      const provider = registry()

      const first = await provider.verify(providerName, harness.validCredential)
      const second = await provider.verify(
        providerName,
        harness.validCredential,
      )

      expect(first.subject).toBeTruthy()
      expect(second.subject).toBe(first.subject)
      expect(first.normalizedEmail).toBe(first.normalizedEmail.toLowerCase())
      expect(first.normalizedEmail).not.toMatch(/^\s|\s$/)
      expect(first.emailVerified).toBe(true)
    })

    it('rejects incomplete provider configuration', () => {
      const adapter = harness.createAdapter()
      expect(
        () =>
          new OAuthProviderRegistry(
            [
              {
                key: adapter.key,
                enabled: true,
                settings: harness.incompleteSettings,
              },
            ],
            [adapter],
          ),
      ).toThrow('OAuth provider registry configuration is invalid')
    })

    it('rejects invalid credentials with a sanitized result', async () => {
      await expect(
        registry().verify(providerName, harness.invalidCredential),
      ).rejects.toMatchObject({ message: 'Authentication unavailable' })
    })
  })
}
