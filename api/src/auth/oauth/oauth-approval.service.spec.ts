import { UserRole } from '../../users/user-roles.enum'
import { OAuthApprovalState } from './oauth-authentication.enums'
import { OAuthApprovalService } from './oauth-approval.service'

const query = <T>(resolve: () => T | Promise<T>) => ({
  session: jest.fn(async () => resolve()),
})

const approvalDocument = (values: Record<string, any>): any => ({
  _id: values._id || `approval-${Math.random()}`,
  auditEventIds: [],
  save: jest.fn().mockResolvedValue(undefined),
  ...values,
})

const build = (
  initialApprovals: any[] = [],
  initialUsers?: any[],
  initialBindings?: any[],
) => {
  const records: any[] = initialApprovals.map(approvalDocument)
  const approvals: any = jest.fn().mockImplementation(function (values) {
    const created = Object.assign(this, approvalDocument(values))
    records.push(created)
    return created
  })
  approvals.findOne = jest.fn((filter) =>
    query(() =>
      records.find(
        (approval) =>
          approval.providerKey === filter.providerKey &&
          approval.normalizedEmail === filter.normalizedEmail &&
          (!filter.state?.$ne || approval.state !== filter.state.$ne),
      ),
    ),
  )
  approvals.countDocuments = jest.fn((filter) =>
    query(
      () =>
        records.filter((approval) =>
          Object.entries(filter).every(
            ([key, value]) => approval[key] === value,
          ),
        ).length,
    ),
  )
  approvals.find = jest.fn((filter = {}) => {
    const matches = records.filter((approval) =>
      Object.entries(filter).every(([key, value]: [string, any]) =>
        value?.$exists ? approval[key] !== undefined : approval[key] === value,
      ),
    )
    return {
      sort: jest.fn().mockResolvedValue(matches),
      select: jest.fn(() => query(() => matches)),
    }
  })

  const userRecords =
    initialUsers ??
    records
      .filter((approval) => approval.userId)
      .map((approval) => ({ _id: approval.userId, isBanned: false }))
  const users = {
    find: jest.fn((filter) => ({
      distinct: jest.fn(() =>
        query(() =>
          userRecords
            .filter(
              (user) =>
                filter._id.$in.includes(user._id) && user.isBanned !== true,
            )
            .map((user) => ({ equals: (value: any) => value === user._id })),
        ),
      ),
    })),
  }

  const bindingRecords =
    initialBindings ??
    records
      .filter((approval) => approval.boundSubject && approval.userId)
      .map((approval) => ({
        providerKey: approval.providerKey,
        providerSubject: approval.boundSubject,
        approvalId: approval._id,
        userId: approval.userId,
      }))
  const bindings = {
    find: jest.fn((filter) => ({
      select: jest.fn(() =>
        query(() =>
          bindingRecords.filter((binding) =>
            filter.approvalId.$in.includes(binding.approvalId),
          ),
        ),
      ),
    })),
    deleteOne: jest.fn().mockResolvedValue(undefined),
  }
  const auditEvents: any[] = []
  const audits: any = jest.fn().mockImplementation(function (values) {
    Object.assign(this, values, {
      _id: `audit-${auditEvents.length + 1}`,
      save: jest.fn(async () => {
        auditEvents.push(this)
      }),
    })
  })
  const invariant = {
    _id: 'authority-invariant',
    scope: 'platform-administrator',
    serializationRevision: 0,
    bootstrapCompleted: false,
    save: jest.fn().mockResolvedValue(undefined),
  }
  const authorityInvariant = {
    updateOne: jest.fn().mockResolvedValue(undefined),
    findOneAndUpdate: jest.fn(async () => {
      invariant.serializationRevision += 1
      return invariant
    }),
  }
  let transactionTail = Promise.resolve<void>(undefined)
  const connection = {
    transaction: jest.fn((callback) => {
      const result = transactionTail.then(() => callback({ id: 'session' }))
      transactionTail = result.then(
        () => undefined,
        () => undefined,
      )
      return result
    }),
  }
  const providers = { isEnabled: jest.fn().mockReturnValue(true) }
  return {
    service: new OAuthApprovalService(
      connection as any,
      approvals,
      bindings as any,
      audits,
      authorityInvariant as any,
      users as any,
      providers as any,
    ),
    records,
    approvals,
    bindings,
    audits,
    auditEvents,
    invariant,
    authorityInvariant,
    users,
    connection,
  }
}

const boundAdmin = (email: string) => ({
  _id: `approval-${email}`,
  providerKey: 'google',
  normalizedEmail: email,
  role: UserRole.ADMIN,
  state: OAuthApprovalState.BOUND,
  boundSubject: `subject-${email}`,
  userId: `user-${email}`,
  boundAt: new Date(),
  authorizationRevision: 3,
  actorKind: 'PRIVATE_SHELL_ADMIN',
  reason: 'existing administrator',
})

describe('OAuthApprovalService private command boundary', () => {
  it('creates one pending exact-email approval and links its audit atomically', async () => {
    const context = build()

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

    expect(context.records[0]).toMatchObject({
      normalizedEmail: 'operator@external.example',
      actorKind: 'PRIVATE_SHELL_ADMIN',
      auditEventIds: ['audit-1'],
    })
    expect(context.records[0].save).toHaveBeenCalledWith({
      session: { id: 'session' },
    })
    expect(context.auditEvents[0]).toMatchObject({
      actorKind: 'PRIVATE_SHELL_ADMIN',
      authorizationRevision: 1,
    })
    expect(context.connection.transaction).toHaveBeenCalledTimes(1)
  })

  it('is idempotent for the same active role', async () => {
    const context = build([
      {
        providerKey: 'google',
        normalizedEmail: 'operator@example.com',
        role: UserRole.REGULAR,
        state: OAuthApprovalState.PENDING,
        authorizationRevision: 2,
      },
    ])

    await context.service.approve({
      provider: 'google',
      email: 'operator@example.com',
      role: UserRole.REGULAR,
      reason: 'same approval',
    })
    expect(context.records[0].save).not.toHaveBeenCalled()
    expect(context.auditEvents).toHaveLength(0)
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
    expect(context.connection.transaction).not.toHaveBeenCalled()
  })

  it('labels the one-time explicit initial bootstrap distinctly', async () => {
    const context = build()
    const command = {
      provider: 'google',
      email: 'admin@example.com',
      role: UserRole.ADMIN,
      reason: 'initial platform bootstrap',
      confirmPlatformAdmin: true,
      systemBootstrap: true,
    }

    await context.service.approve(command)
    await expect(context.service.approve(command)).resolves.toMatchObject({
      role: UserRole.ADMIN,
    })
    expect(context.invariant.bootstrapCompleted).toBe(true)
    expect(context.records[0].actorKind).toBe('SYSTEM_BOOTSTRAP')
    expect(context.auditEvents[0].actorKind).toBe('SYSTEM_BOOTSTRAP')
    expect(context.auditEvents).toHaveLength(1)
  })

  it('rejects and audits demotion of the last usable platform administrator', async () => {
    const context = build([boundAdmin('admin@example.com')])

    await expect(
      context.service.approve({
        provider: 'google',
        email: 'admin@example.com',
        role: UserRole.REGULAR,
        reason: 'routine demotion',
      }),
    ).rejects.toThrow('last usable platform administrator')
    expect(context.records[0]).toMatchObject({
      role: UserRole.ADMIN,
      state: OAuthApprovalState.BOUND,
      authorizationRevision: 3,
    })
    expect(context.auditEvents[0]).toMatchObject({
      outcome: 'DENIED',
      action: 'COMMAND_DENIED',
      reason: 'routine demotion',
    })
  })

  it('does not count a stale administrator binding as a usable replacement', async () => {
    const active = boundAdmin('active@example.com')
    const stale = boundAdmin('stale@example.com')
    const context = build(
      [active, stale],
      [{ _id: active.userId, isBanned: false }],
    )

    await expect(
      context.service.revoke('google', 'active@example.com', 'routine revoke'),
    ).rejects.toThrow('last usable platform administrator')
    expect(context.records[0].state).toBe(OAuthApprovalState.BOUND)
    expect(context.auditEvents[0]).toMatchObject({ outcome: 'DENIED' })
  })

  it('does not count a banned administrator binding as a usable replacement', async () => {
    const active = boundAdmin('active@example.com')
    const banned = boundAdmin('banned@example.com')
    const context = build(
      [active, banned],
      [
        { _id: active.userId, isBanned: false },
        { _id: banned.userId, isBanned: true },
      ],
    )

    await expect(
      context.service.resetBinding(
        'google',
        'active@example.com',
        'routine reset',
        true,
      ),
    ).rejects.toThrow('last usable platform administrator')
    expect(context.records[0].state).toBe(OAuthApprovalState.BOUND)
    expect(context.auditEvents[0]).toMatchObject({ outcome: 'DENIED' })
  })

  it('does not count an administrator whose identity binding is missing', async () => {
    const active = boundAdmin('active@example.com')
    const unbound = boundAdmin('unbound@example.com')
    const context = build(
      [active, unbound],
      [
        { _id: active.userId, isBanned: false },
        { _id: unbound.userId, isBanned: false },
      ],
      [
        {
          providerKey: active.providerKey,
          providerSubject: active.boundSubject,
          approvalId: active._id,
          userId: active.userId,
        },
      ],
    )

    await expect(
      context.service.revoke('google', 'active@example.com', 'routine revoke'),
    ).rejects.toThrow('last usable platform administrator')
    expect(context.records[0].state).toBe(OAuthApprovalState.BOUND)
    expect(context.auditEvents[0]).toMatchObject({ outcome: 'DENIED' })
  })

  it('allows removal of an unusable administrator binding', async () => {
    const active = boundAdmin('active@example.com')
    const banned = boundAdmin('banned@example.com')
    const context = build(
      [active, banned],
      [
        { _id: active.userId, isBanned: false },
        { _id: banned.userId, isBanned: true },
      ],
    )

    await expect(
      context.service.revoke(
        'google',
        'banned@example.com',
        'remove banned binding',
      ),
    ).resolves.toMatchObject({ state: OAuthApprovalState.REVOKED })
  })

  it('serializes competing revoke, reset, and demotion operations', async () => {
    const context = build([
      boundAdmin('one@example.com'),
      boundAdmin('two@example.com'),
      boundAdmin('three@example.com'),
    ])

    const results = await Promise.allSettled([
      context.service.revoke('google', 'one@example.com', 'competing revoke'),
      context.service.resetBinding(
        'google',
        'two@example.com',
        'competing reset',
        true,
      ),
      context.service.approve({
        provider: 'google',
        email: 'three@example.com',
        role: UserRole.REGULAR,
        reason: 'competing demotion',
      }),
    ])

    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(2)
    expect(
      results.filter((result) => result.status === 'rejected'),
    ).toHaveLength(1)
    expect(
      context.records.filter(
        (approval) =>
          approval.role === UserRole.ADMIN &&
          approval.state === OAuthApprovalState.BOUND,
      ),
    ).toHaveLength(1)
    expect(
      context.auditEvents.filter((event) => event.outcome === 'DENIED'),
    ).toHaveLength(1)
    expect(context.invariant.serializationRevision).toBe(3)
  })

  it('resets a confirmed non-admin binding and increments the session revision', async () => {
    const context = build([
      {
        providerKey: 'google',
        normalizedEmail: 'operator@example.com',
        role: UserRole.REGULAR,
        state: OAuthApprovalState.BOUND,
        boundSubject: 'subject-1',
        userId: 'user-1',
        boundAt: new Date(),
        authorizationRevision: 5,
      },
    ])

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
    expect(context.bindings.deleteOne).toHaveBeenCalledWith(
      { approvalId: context.records[0]._id },
      { session: { id: 'session' } },
    )
    expect(context.auditEvents[0].authorizationRevision).toBe(6)
  })
})
