import { UserRole } from '../../users/user-roles.enum'
import { OAuthApprovalState } from './oauth-authentication.enums'
import { OAuthApprovalService } from './oauth-approval.service'

const document = (values: Record<string, unknown>) => ({
  _id: 'approval-1',
  auditEventIds: [],
  save: jest.fn().mockResolvedValue(undefined),
  ...values,
})

const build = () => {
  let created: any
  const approvals: any = jest.fn().mockImplementation(function (values) {
    created = Object.assign(this, document(values))
    return created
  })
  approvals.findOne = jest.fn()
  approvals.countDocuments = jest.fn()
  approvals.updateOne = jest.fn().mockResolvedValue(undefined)
  approvals.find = jest.fn()
  const bindings = { deleteOne: jest.fn().mockResolvedValue(undefined) }
  const audits = {
    create: jest.fn().mockResolvedValue({ _id: 'audit-1' }),
  }
  const providers = { isEnabled: jest.fn().mockReturnValue(true) }
  return {
    service: new OAuthApprovalService(
      approvals,
      bindings as any,
      audits as any,
      providers as any,
    ),
    approvals,
    bindings,
    audits,
    providers,
    created: () => created,
  }
}

describe('OAuthApprovalService private command boundary', () => {
  it('creates one pending exact-email approval without a user or session', async () => {
    const context = build()
    context.approvals.findOne.mockResolvedValue(null)

    await expect(
      context.service.approve({
        provider: 'google',
        email: ' Operator@External.Example ',
        role: UserRole.REGULAR,
        reason: 'bounded beta operator',
      }),
    ).resolves.toMatchObject({
      provider: 'google',
      email: 'o***@external.example',
      state: OAuthApprovalState.PENDING,
      authorizationRevision: 1,
    })
    expect(context.created()).toMatchObject({
      normalizedEmail: 'operator@external.example',
      actorKind: 'PRIVATE_SHELL_ADMIN',
    })
    expect(context.audits.create).toHaveBeenCalled()
  })

  it('is idempotent for the same active role', async () => {
    const context = build()
    const existing = document({
      providerKey: 'google',
      normalizedEmail: 'operator@example.com',
      role: UserRole.REGULAR,
      state: OAuthApprovalState.PENDING,
      authorizationRevision: 2,
    })
    context.approvals.findOne.mockResolvedValue(existing)

    await context.service.approve({
      provider: 'google',
      email: 'operator@example.com',
      role: UserRole.REGULAR,
      reason: 'same approval',
    })
    expect(existing.save).not.toHaveBeenCalled()
    expect(context.audits.create).not.toHaveBeenCalled()
  })

  it('requires explicit platform-authority confirmation', async () => {
    const context = build()
    await expect(
      context.service.approve({
        provider: 'google',
        email: 'admin@example.com',
        role: UserRole.ADMIN,
        reason: 'restore platform authority',
      }),
    ).rejects.toThrow('--confirm-platform-admin')
    expect(context.approvals.findOne).not.toHaveBeenCalled()
  })

  it('rejects revocation of the last usable platform administrator and audits denial', async () => {
    const context = build()
    context.approvals.findOne.mockResolvedValue(
      document({
        providerKey: 'google',
        normalizedEmail: 'admin@example.com',
        role: UserRole.ADMIN,
        state: OAuthApprovalState.BOUND,
        authorizationRevision: 3,
      }),
    )
    context.approvals.countDocuments.mockResolvedValue(1)

    await expect(
      context.service.revoke('google', 'admin@example.com', 'routine revoke'),
    ).rejects.toThrow('last usable platform administrator')
    expect(context.audits.create).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: 'DENIED', action: 'COMMAND_DENIED' }),
    )
  })

  it('resets a confirmed binding and increments the session revision', async () => {
    const context = build()
    const approval: any = document({
      providerKey: 'google',
      normalizedEmail: 'operator@example.com',
      role: UserRole.REGULAR,
      state: OAuthApprovalState.BOUND,
      boundSubject: 'subject-1',
      userId: 'user-1',
      boundAt: new Date(),
      authorizationRevision: 5,
    })
    context.approvals.findOne.mockResolvedValue(approval)

    await expect(
      context.service.resetBinding(
        'google',
        'operator@example.com',
        'subject recovery',
        true,
      ),
    ).resolves.toMatchObject({
      state: OAuthApprovalState.PENDING,
      authorizationRevision: 6,
    })
    expect(context.bindings.deleteOne).toHaveBeenCalledWith({
      approvalId: 'approval-1',
    })
    expect(approval.boundSubject).toBeUndefined()
    expect(approval.userId).toBeUndefined()
  })
})
