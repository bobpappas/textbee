import { OAuthApprovalSchema } from './schemas/oauth-approval.schema'
import { OAuthIdentityBindingSchema } from './schemas/oauth-identity-binding.schema'
import { OAuthPlatformAuthorityInvariantSchema } from './schemas/oauth-platform-authority-invariant.schema'

const uniqueIndex = (schema: any, keys: Record<string, number>) =>
  schema
    .indexes()
    .find(
      ([candidate, options]) =>
        options.unique && JSON.stringify(candidate) === JSON.stringify(keys),
    )

describe('provider-neutral OAuth persistence', () => {
  it('uniquely approves an exact provider and normalized email pair', () => {
    expect(
      uniqueIndex(OAuthApprovalSchema, { providerKey: 1, normalizedEmail: 1 }),
    ).toBeDefined()
  })

  it('uniquely binds a stable subject within its provider', () => {
    expect(
      uniqueIndex(OAuthIdentityBindingSchema, {
        providerKey: 1,
        providerSubject: 1,
      }),
    ).toBeDefined()
  })

  it('does not permit implicit cross-provider linking to one user', () => {
    expect(uniqueIndex(OAuthIdentityBindingSchema, { userId: 1 })).toBeDefined()
  })

  it('has one durable serialization record per platform-authority scope', () => {
    expect(
      uniqueIndex(OAuthPlatformAuthorityInvariantSchema, { scope: 1 }),
    ).toBeDefined()
  })
})
