import { runOAuthProviderContract } from './oauth-provider.contract'
import { OAuthIdentityProvider } from './oauth-provider.types'

class SyntheticOAuthProvider implements OAuthIdentityProvider {
  readonly key = 'synthetic'

  validateConfiguration(settings: Readonly<Record<string, unknown>>) {
    if (settings.audience !== 'textbee-contract') {
      throw new Error('synthetic audience is missing')
    }
  }

  async verify(credential: string) {
    if (credential !== 'synthetic-valid') {
      throw new Error(`unsafe credential detail: ${credential}`)
    }
    return {
      providerKey: this.key,
      subject: 'synthetic-stable-subject',
      normalizedEmail: ' Contract@Example.com ',
      emailVerified: true as const,
      auditMetadata: { issuer: 'synthetic.test' },
    }
  }
}

runOAuthProviderContract('synthetic', {
  createAdapter: () => new SyntheticOAuthProvider(),
  validSettings: { audience: 'textbee-contract' },
  incompleteSettings: {},
  validCredential: 'synthetic-valid',
  invalidCredential: 'must-not-appear-in-error',
})
