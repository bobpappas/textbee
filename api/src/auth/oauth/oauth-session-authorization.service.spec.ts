import { OAuthApprovalState } from './oauth-authentication.enums'
import { OAuthSessionAuthorizationService } from './oauth-session-authorization.service'

describe('OAuthSessionAuthorizationService', () => {
  const approvals = { exists: jest.fn() }
  const service = new OAuthSessionAuthorizationService(approvals as any)

  beforeEach(() => approvals.exists.mockReset())

  it('accepts only a bound approval at the JWT revision', async () => {
    approvals.exists.mockResolvedValue({ _id: 'approval-1' })

    await expect(
      service.isCurrent(
        {
          sub: 'user-1',
          oauthProvider: 'google',
          authorizationRevision: 4,
        },
        'user-1',
      ),
    ).resolves.toBe(true)
    expect(approvals.exists).toHaveBeenCalledWith({
      providerKey: 'google',
      userId: 'user-1',
      state: OAuthApprovalState.BOUND,
      authorizationRevision: 4,
    })
  })

  it.each([
    [{ sub: 'user-1' }, 'user-1'],
    [
      { sub: 'user-1', oauthProvider: 'google', authorizationRevision: 0 },
      'user-1',
    ],
    [
      { sub: 'another', oauthProvider: 'google', authorizationRevision: 1 },
      'user-1',
    ],
  ])('rejects incomplete or mismatched claims', async (claims, userId) => {
    await expect(service.isCurrent(claims, userId)).resolves.toBe(false)
    expect(approvals.exists).not.toHaveBeenCalled()
  })

  it('rejects a revision that no longer exists', async () => {
    approvals.exists.mockResolvedValue(null)
    await expect(
      service.isCurrent(
        {
          sub: 'user-1',
          oauthProvider: 'google',
          authorizationRevision: 1,
        },
        'user-1',
      ),
    ).resolves.toBe(false)
  })
})
