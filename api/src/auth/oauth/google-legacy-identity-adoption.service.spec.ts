import { GoogleLegacyIdentityAdoptionService } from './google-legacy-identity-adoption.service'

const identity = {
  providerKey: 'google',
  subject: 'subject-1',
  normalizedEmail: 'operator@example.com',
  emailVerified: true as const,
  auditMetadata: {},
}

describe('GoogleLegacyIdentityAdoptionService', () => {
  const bindings = { exists: jest.fn() }
  const service = new GoogleLegacyIdentityAdoptionService(bindings as any)

  beforeEach(() => bindings.exists.mockReset().mockResolvedValue(null))

  it('adopts an unbound legacy user with no conflicting Google subject', async () => {
    await expect(
      service.canAdopt(identity, { _id: 'user-1' } as any),
    ).resolves.toBe(true)
    expect(bindings.exists).toHaveBeenCalledWith({ userId: 'user-1' })
  })

  it('accepts an equal stored Google subject', async () => {
    await expect(
      service.canAdopt(identity, {
        _id: 'user-1',
        googleId: 'subject-1',
      } as any),
    ).resolves.toBe(true)
  })

  it('rejects a conflicting subject or any existing provider binding', async () => {
    await expect(
      service.canAdopt(identity, {
        _id: 'user-1',
        googleId: 'different',
      } as any),
    ).resolves.toBe(false)
    bindings.exists.mockResolvedValue({ _id: 'binding-1' })
    await expect(
      service.canAdopt(identity, { _id: 'user-1' } as any),
    ).resolves.toBe(false)
  })
})
