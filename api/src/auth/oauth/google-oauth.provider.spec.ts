import { OAuthProviderRegistry } from './oauth-provider.registry'
import { GoogleOAuthProvider } from './google-oauth.provider'
import { runOAuthProviderContract } from './oauth-provider.contract'

const audience = 'textbee-client.apps.googleusercontent.com'
const payload = {
  iss: 'https://accounts.google.com',
  sub: 'google-subject-1',
  email: 'Approved@External.Example',
  email_verified: true,
}

const verifier = (result: unknown = payload) => ({
  verifyIdToken: jest.fn(async () => ({ getPayload: () => result })),
})

runOAuthProviderContract('google', {
  createAdapter: () => new GoogleOAuthProvider(verifier() as any),
  validSettings: { audience },
  incompleteSettings: {},
  validCredential: 'synthetic-google-id-token',
  invalidCredential: '',
})

describe('GoogleOAuthProvider', () => {
  it('delegates signature, expiry, and audience verification to the supported library', async () => {
    const client = verifier()
    const registry = new OAuthProviderRegistry(
      [{ key: 'google', enabled: true, settings: { audience } }],
      [new GoogleOAuthProvider(client as any)],
    )

    await expect(registry.verify('google', 'opaque-id-token')).resolves.toEqual(
      {
        providerKey: 'google',
        subject: 'google-subject-1',
        normalizedEmail: 'approved@external.example',
        emailVerified: true,
        auditMetadata: { issuer: 'https://accounts.google.com' },
      },
    )
    expect(client.verifyIdToken).toHaveBeenCalledWith({
      idToken: 'opaque-id-token',
      audience,
    })
  })

  it.each([
    ['untrusted issuer', { ...payload, iss: 'https://issuer.example' }],
    ['missing subject', { ...payload, sub: undefined }],
    ['missing email', { ...payload, email: undefined }],
    ['unverified email', { ...payload, email_verified: false }],
  ])('rejects %s with one generic public failure', async (_name, claims) => {
    const registry = new OAuthProviderRegistry(
      [{ key: 'google', enabled: true, settings: { audience } }],
      [new GoogleOAuthProvider(verifier(claims) as any)],
    )
    await expect(registry.verify('google', 'opaque')).rejects.toMatchObject({
      message: 'Authentication unavailable',
    })
  })

  it('fails closed when Google verification or key refresh is unavailable', async () => {
    const client = {
      verifyIdToken: jest.fn(async () => {
        throw new Error('Google key endpoint unavailable; token=secret')
      }),
    }
    const registry = new OAuthProviderRegistry(
      [{ key: 'google', enabled: true, settings: { audience } }],
      [new GoogleOAuthProvider(client as any)],
    )
    await expect(
      registry.verify('google', 'must-not-leak'),
    ).rejects.toMatchObject({ message: 'Authentication unavailable' })
  })

  it('uses the verifier for every token so library key rotation caching remains authoritative', async () => {
    const client = verifier()
    const provider = new GoogleOAuthProvider(client as any)
    await provider.verify('first', { audience })
    await provider.verify('second', { audience })
    expect(client.verifyIdToken).toHaveBeenNthCalledWith(1, {
      idToken: 'first',
      audience,
    })
    expect(client.verifyIdToken).toHaveBeenNthCalledWith(2, {
      idToken: 'second',
      audience,
    })
  })
})
