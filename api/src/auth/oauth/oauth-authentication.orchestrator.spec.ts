import { JwtService } from '@nestjs/jwt'
import { UserRole } from '../../users/user-roles.enum'
import { OAuthApprovalState } from './oauth-authentication.enums'
import { OAuthAuthenticationOrchestrator } from './oauth-authentication.orchestrator'
import { OAuthProviderRegistry } from './oauth-provider.registry'
import { OAuthIdentityProvider } from './oauth-provider.types'

const query = <T>(value: T) => ({
  session: jest.fn().mockResolvedValue(value),
})

const syntheticAdapter = (): OAuthIdentityProvider => ({
  key: 'synthetic',
  validateConfiguration: jest.fn(),
  verify: jest.fn(async (credential) => {
    if (credential !== 'valid') throw new Error('invalid synthetic credential')
    return {
      providerKey: 'synthetic',
      subject: 'stable-subject',
      normalizedEmail: 'approved@example.com',
      emailVerified: true as const,
      auditMetadata: { issuer: 'synthetic.test' },
    }
  }),
})

const build = (approval: any) => {
  const connection = {
    transaction: jest.fn(async (callback) => callback({ id: 'session' })),
  }
  const approvals = {
    findOne: jest.fn(() => query(approval)),
    findOneAndUpdate: jest.fn(async (_filter, update) => ({
      ...approval,
      ...update.$set,
    })),
    updateOne: jest.fn().mockResolvedValue(undefined),
  }

  let savedUser: any
  const users: any = jest.fn().mockImplementation(function (document) {
    savedUser = Object.assign(this, document, {
      _id: 'user-1',
      save: jest.fn().mockResolvedValue(undefined),
      toObject: jest.fn(function () {
        return {
          _id: this._id,
          email: this.email,
          name: this.name,
          role: this.role,
        }
      }),
    })
  })
  users.findOne = jest.fn(() => query(null))
  users.findById = jest.fn(() => query(null))

  let savedBinding: any
  const bindings: any = jest.fn().mockImplementation(function (document) {
    savedBinding = Object.assign(this, document, {
      _id: 'binding-1',
      save: jest.fn().mockResolvedValue(undefined),
    })
  })
  bindings.findOne = jest.fn(() => query(null))

  let savedAudit: any
  const audits: any = jest.fn().mockImplementation(function (document) {
    savedAudit = Object.assign(this, document, {
      _id: 'audit-1',
      save: jest.fn().mockResolvedValue(undefined),
    })
  })
  audits.create = jest.fn().mockResolvedValue(undefined)

  const jwtService = { sign: jest.fn().mockReturnValue('signed-session') }
  const orchestrator = new OAuthAuthenticationOrchestrator(
    connection as any,
    approvals as any,
    bindings,
    audits,
    users,
    jwtService as unknown as JwtService,
  )
  return {
    orchestrator,
    connection,
    approvals,
    bindings,
    audits,
    users,
    jwtService,
    savedUser: () => savedUser,
    savedBinding: () => savedBinding,
    savedAudit: () => savedAudit,
  }
}

const pendingApproval = () => ({
  _id: 'approval-1',
  providerKey: 'synthetic',
  normalizedEmail: 'approved@example.com',
  role: UserRole.REGULAR,
  state: OAuthApprovalState.PENDING,
  authorizationRevision: 3,
})

describe('OAuthAuthenticationOrchestrator', () => {
  it('runs a synthetic verified identity through approval, binding, user, audit, and session', async () => {
    const registry = new OAuthProviderRegistry(
      [
        {
          key: 'synthetic',
          enabled: true,
          settings: { audience: 'test' },
        },
      ],
      [syntheticAdapter()],
    )
    const identity = await registry.verify('synthetic', 'valid')
    const context = build(pendingApproval())

    await expect(context.orchestrator.authenticate(identity)).resolves.toEqual({
      accessToken: 'signed-session',
      user: {
        _id: 'user-1',
        email: 'approved@example.com',
        name: 'approved',
        role: UserRole.REGULAR,
      },
    })

    expect(context.savedBinding()).toMatchObject({
      providerKey: 'synthetic',
      providerSubject: 'stable-subject',
      approvalId: 'approval-1',
      userId: 'user-1',
    })
    expect(context.savedUser().save).toHaveBeenCalled()
    expect(context.savedAudit()).toMatchObject({
      providerKey: 'synthetic',
      approvalId: 'approval-1',
      userId: 'user-1',
      verificationMetadata: { issuer: 'synthetic.test' },
    })
    expect(context.jwtService.sign).toHaveBeenCalledWith({
      email: 'approved@example.com',
      sub: 'user-1',
      oauthProvider: 'synthetic',
      authorizationRevision: 3,
    })
  })

  it('denies an unapproved identity without creating a user, binding, role, or session', async () => {
    const context = build(null)

    await expect(
      context.orchestrator.authenticate({
        providerKey: 'synthetic',
        subject: 'stable-subject',
        normalizedEmail: 'unapproved@example.com',
        emailVerified: true,
        auditMetadata: {},
      }),
    ).rejects.toMatchObject({ message: 'Authentication unavailable' })

    expect(context.users).not.toHaveBeenCalled()
    expect(context.bindings).not.toHaveBeenCalled()
    expect(context.approvals.findOneAndUpdate).not.toHaveBeenCalled()
    expect(context.jwtService.sign).not.toHaveBeenCalled()
  })

  it('does not use matching email to attach a second provider identity', async () => {
    const context = build(pendingApproval())
    context.users.findOne.mockReturnValueOnce(query({ _id: 'existing-user' }))

    await expect(
      context.orchestrator.authenticate({
        providerKey: 'synthetic',
        subject: 'new-provider-subject',
        normalizedEmail: 'approved@example.com',
        emailVerified: true,
        auditMetadata: {},
      }),
    ).rejects.toMatchObject({ message: 'Authentication unavailable' })

    expect(context.users).not.toHaveBeenCalled()
    expect(context.bindings).not.toHaveBeenCalled()
    expect(context.jwtService.sign).not.toHaveBeenCalled()
  })

  it('rejects a different subject for an already-bound approval', async () => {
    const context = build({
      ...pendingApproval(),
      state: OAuthApprovalState.BOUND,
      boundSubject: 'original-subject',
      userId: 'user-1',
    })

    await expect(
      context.orchestrator.authenticate({
        providerKey: 'synthetic',
        subject: 'takeover-subject',
        normalizedEmail: 'approved@example.com',
        emailVerified: true,
        auditMetadata: {},
      }),
    ).rejects.toMatchObject({ message: 'Authentication unavailable' })

    expect(context.users.findById).not.toHaveBeenCalled()
    expect(context.jwtService.sign).not.toHaveBeenCalled()
  })
})
