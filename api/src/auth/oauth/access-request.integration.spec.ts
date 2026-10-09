import mongoose, { Connection, Types } from 'mongoose'
import { JwtService } from '@nestjs/jwt'
import { AccessRequestService } from './access-request.service'
import {
  ACCESS_REQUEST,
  ADMISSION_AUDIT,
  AccessRequestSchema,
  AdmissionAuditSchema,
} from './schemas/access-request.schema'
import {
  OAuthApproval,
  OAuthApprovalSchema,
} from './schemas/oauth-approval.schema'
import {
  OAuthIdentityBinding,
  OAuthIdentityBindingSchema,
} from './schemas/oauth-identity-binding.schema'
import { User, UserSchema } from '../../users/schemas/user.schema'
import { ApiKey, ApiKeySchema } from '../schemas/api-key.schema'
import {
  Organization,
  OrganizationSchema,
} from '../../organizations/schemas/organization.schema'
import {
  OperatorMembership,
  OperatorMembershipSchema,
} from '../../organizations/schemas/operator-membership.schema'
import {
  OperatorGrant,
  OperatorGrantSchema,
} from '../../organizations/schemas/operator-grant.schema'
import { Group, GroupSchema } from '../../groups/schemas/group.schema'
import {
  GroupOwnerAssignment,
  GroupOwnerAssignmentSchema,
} from '../../groups/schemas/group-owner-assignment.schema'
import {
  GroupSenderAssignment,
  GroupSenderAssignmentSchema,
} from '../../groups/schemas/group-sender-assignment.schema'
import { OAuthSessionAuthorizationService } from './oauth-session-authorization.service'
import { parseAdmissionDecision } from './access-request.dto'
import { AuthGuard } from '../guards/auth.guard'

const uri = process.env.B057_TEST_MONGO
const suite = uri ? describe : describe.skip
suite('B057 admission transactions on isolated MongoDB', () => {
  let db: Connection,
    service: AccessRequestService,
    models: any,
    org: any,
    group: any
  const model = (name: string): any => db.models[name]
  const admin = { _id: new Types.ObjectId(), role: 'ADMIN' }
  const identity = {
    providerKey: 'google',
    subject: 'synthetic-subject',
    normalizedEmail: 'applicant@example.test',
    name: 'Synthetic Applicant',
    emailVerified: true as const,
    auditMetadata: {},
  }
  const jwt = new JwtService({ secret: 'isolated-admission-test-secret' })
  beforeAll(async () => {
    if (!/^mongodb:\/\/127\.0\.0\.1:27028\/b057_test\?/.test(uri!))
      throw new Error('Only the disposable B057 test database is allowed')
    db = await mongoose.createConnection(uri!).asPromise()
    models = [
      [ApiKey.name, ApiKeySchema],
      [ACCESS_REQUEST, AccessRequestSchema],
      [ADMISSION_AUDIT, AdmissionAuditSchema],
      [OAuthApproval.name, OAuthApprovalSchema],
      [OAuthIdentityBinding.name, OAuthIdentityBindingSchema],
      [User.name, UserSchema],
      [Organization.name, OrganizationSchema],
      [OperatorMembership.name, OperatorMembershipSchema],
      [OperatorGrant.name, OperatorGrantSchema],
      [Group.name, GroupSchema],
      [GroupOwnerAssignment.name, GroupOwnerAssignmentSchema],
      [GroupSenderAssignment.name, GroupSenderAssignmentSchema],
    ].map(([name, schema]: any) => db.model<any>(name, schema))
    for (const model of models) await model.init()
    service = new AccessRequestService(
      db,
      jwt,
      ...(models as [
        any,
        any,
        any,
        any,
        any,
        any,
        any,
        any,
        any,
        any,
        any,
        any,
      ]),
    )
  })
  beforeEach(async () => {
    for (const model of models) await model.deleteMany({})
    org = await model(Organization.name).create({
      displayName: 'Synthetic Organization',
      status: 'ACTIVE',
      createdBy: admin._id,
      provisioningKey: 'test',
    })
    group = await model(Group.name).create({
      organizationId: org._id,
      displayName: 'Synthetic Group',
      status: 'ACTIVE',
      receivingNumberId: 'synthetic',
      receivingNumber: '+12085550100',
      joinCode: 'TEST',
      createdBy: admin._id,
    })
  })
  afterAll(async () => {
    await db?.close()
  })
  async function request() {
    await service.applicantSession(identity)
    return model(ACCESS_REQUEST).findOne()
  }
  const decision = () => ({
    action: 'approve',
    version: 0,
    reason: 'Synthetic acceptance',
    organizationId: String(org._id),
    groups: [{ groupId: String(group._id), role: 'sender' as const }],
  })
  it('deduplicates concurrent first sign-ins without creating users or approvals', async () => {
    await Promise.all([
      service.applicantSession(identity),
      service.applicantSession(identity),
    ])
    expect(await model(ACCESS_REQUEST).countDocuments()).toBe(1)
    expect(await model(User.name).countDocuments()).toBe(0)
    expect(await model(OAuthApproval.name).countDocuments()).toBe(0)
  })
  it('onboarding token works only for own status and is rejected by ordinary authentication', async () => {
    const result = await service.applicantSession(identity)
    expect(await service.status(result.accessToken)).toEqual({
      state: 'PENDING',
    })
    const sessions = new OAuthSessionAuthorizationService(
      model(OAuthApproval.name) as any,
    )
    const guard = new AuthGuard(
      jwt,
      { findOne: jest.fn() } as any,
      {} as any,
      sessions,
    )
    await expect(
      guard.canActivate({
        switchToHttp: () => ({
          getRequest: () => ({
            headers: { authorization: `Bearer ${result.accessToken}` },
            query: {},
          }),
        }),
      } as any),
    ).rejects.toThrow()
    expect(() => service.applicantId(jwt.sign({ sub: admin._id }))).toThrow()
    expect(() =>
      service.applicantId(
        jwt.sign(
          { purpose: 'onboarding', requestId: new Types.ObjectId() },
          { audience: 'textbee-onboarding', expiresIn: -1 },
        ),
      ),
    ).toThrow()
  })
  it('rejects non-platform admins, malformed grants and extra privilege fields', async () => {
    await expect(service.list({ ...admin, role: 'REGULAR' })).rejects.toThrow()
    await expect(
      service.options({ ...admin, role: 'ORGANIZATION_ADMIN' }),
    ).rejects.toThrow()
    expect(() =>
      parseAdmissionDecision({ ...decision(), platformRole: 'ADMIN' }),
    ).toThrow()
    expect(() =>
      parseAdmissionDecision({
        ...decision(),
        groups: [{ groupId: String(group._id), role: 'admin' }],
      }),
    ).toThrow()
    expect(() =>
      parseAdmissionDecision({ ...decision(), reason: ' ' }),
    ).toThrow()
  })
  it('atomically binds identity and grants exactly one selected group role; retry is idempotent', async () => {
    const req = await request()
    const first = await service.decide(admin, req.id, decision())
    expect(await service.decide(admin, req.id, decision())).toEqual(first)
    const approval = await model(OAuthApproval.name).findOne()
    expect(approval.state).toBe('BOUND')
    expect(approval.role).toBe('REGULAR')
    expect(await model(OAuthIdentityBinding.name).countDocuments()).toBe(1)
    expect(
      await model(OperatorMembership.name).countDocuments({ status: 'ACTIVE' }),
    ).toBe(1)
    expect(
      await model(GroupSenderAssignment.name).countDocuments({
        status: 'ACTIVE',
      }),
    ).toBe(1)
    expect(await model(GroupOwnerAssignment.name).countDocuments()).toBe(0)
    expect(await model(OperatorGrant.name).countDocuments()).toBe(0)
    expect(await model(ADMISSION_AUDIT).countDocuments()).toBe(1)
    expect(await service.applicantSession(identity)).toBeNull()
  })
  it('rolls back writes when a group belongs to another organization', async () => {
    const req = await request()
    await model(Group.name).collection.updateOne(
      { _id: group._id },
      { $set: { organizationId: new Types.ObjectId() } },
    )
    const input = decision()
    await expect(service.decide(admin, req.id, input)).rejects.toThrow()
    expect(await model(User.name).countDocuments()).toBe(0)
    expect((await model(ACCESS_REQUEST).findOne()).state).toBe('PENDING')
    expect(
      (
        await model(Organization.name)
          .findById(org._id)
          .select('+authorizationRevision')
      ).authorizationRevision,
    ).toBe(0)
  })
  it('keeps rejection on repeated login and requires explicit reconsideration', async () => {
    const req = await request()
    await service.decide(admin, req.id, {
      action: 'reject',
      version: 0,
      reason: 'Not expected',
    })
    const login = await service.applicantSession(identity)
    expect(await service.status(login.accessToken)).toEqual({
      state: 'REJECTED',
    })
    await expect(
      service.decide(admin, req.id, { ...decision(), version: 1 }),
    ).rejects.toThrow()
    await service.decide(admin, req.id, {
      action: 'reconsider',
      version: 1,
      reason: 'Reviewed again',
    })
    expect((await model(ACCESS_REQUEST).findOne()).state).toBe('PENDING')
  })
  it('serializes competing decisions so only one succeeds', async () => {
    const req = await request()
    const results = await Promise.allSettled([
      service.decide(admin, req.id, decision()),
      service.decide(admin, req.id, {
        action: 'reject',
        version: 0,
        reason: 'Competing decision',
      }),
    ])
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    expect(await model(ADMISSION_AUDIT).countDocuments()).toBe(1)
  })
  it('revokes sessions and grants; reapproval grants only newly selected roles', async () => {
    const req = await request()
    await service.decide(admin, req.id, decision())
    const approval = await model(OAuthApproval.name).findOne()
    const sessions = new OAuthSessionAuthorizationService(
      model(OAuthApproval.name) as any,
    )
    const claims = {
      sub: String(approval.userId),
      oauthProvider: 'google',
      authorizationRevision: approval.authorizationRevision,
    }
    expect(await sessions.isCurrent(claims, approval.userId)).toBe(true)
    await service.decide(admin, req.id, {
      action: 'revoke',
      version: 1,
      reason: 'Revoke test',
    })
    expect(await sessions.isCurrent(claims, approval.userId)).toBe(false)
    expect(
      await model(GroupSenderAssignment.name).countDocuments({
        status: 'ACTIVE',
      }),
    ).toBe(0)
    expect(
      await model(OperatorMembership.name).countDocuments({ status: 'ACTIVE' }),
    ).toBe(0)
    const login = await service.applicantSession(identity)
    expect(await service.status(login.accessToken)).toEqual({
      state: 'REVOKED',
    })
    await service.decide(admin, req.id, {
      ...decision(),
      version: 2,
      groups: [{ groupId: String(group._id), role: 'owner' }],
    })
    expect(
      await model(GroupOwnerAssignment.name).countDocuments({
        status: 'ACTIVE',
      }),
    ).toBe(1)
    expect(
      await model(GroupSenderAssignment.name).countDocuments({
        status: 'ACTIVE',
      }),
    ).toBe(0)
    expect(await model(User.name).countDocuments()).toBe(1)
  })
  it('does not bypass CLI preapprovals, legacy identity conflicts, or banned users', async () => {
    await model(OAuthApproval.name).create({
      providerKey: 'google',
      normalizedEmail: identity.normalizedEmail,
      role: 'REGULAR',
      state: 'PENDING',
      approvedAt: new Date(),
      actorKind: 'PRIVATE_SHELL_ADMIN',
      reason: 'Existing',
    })
    expect(await service.applicantSession(identity)).toBeNull()
    await model(OAuthApproval.name).deleteMany({})
    await model(User.name).create({
      email: identity.normalizedEmail,
      name: 'Existing',
      isBanned: true,
    })
    await expect(service.applicantSession(identity)).rejects.toThrow()
    expect(await model(ACCESS_REQUEST).countDocuments()).toBe(0)
  })
  it('rolls back revocation of the last organization administrator', async () => {
    const req = await request()
    await service.decide(admin, req.id, decision())
    const member = await model(OperatorMembership.name).findOne()
    await model(OperatorGrant.name).create({
      organizationId: org._id,
      membershipId: member._id,
      role: 'ORGANIZATION_ADMIN',
      status: 'ACTIVE',
      grantedBy: admin._id,
      grantedAt: new Date(),
      changedBy: admin._id,
      changedAt: new Date(),
    })
    await expect(
      service.decide(admin, req.id, {
        action: 'revoke',
        version: 1,
        reason: 'Unsafe revoke',
      }),
    ).rejects.toThrow('Assign another organization administrator')
    expect((await model(OAuthApproval.name).findOne()).state).toBe('BOUND')
    expect((await model(ACCESS_REQUEST).findOne()).state).toBe('APPROVED')
  })
  it('rejects a conflicting Google subject without changing existing access', async () => {
    const req = await request()
    await service.decide(admin, req.id, decision())
    await model(OAuthApproval.name).updateOne({}, { state: 'REVOKED' })
    await expect(
      service.applicantSession({ ...identity, subject: 'different-subject' }),
    ).rejects.toThrow()
    expect(await model(ACCESS_REQUEST).countDocuments()).toBe(1)
  })
  it('reapproves an unbound CLI-revoked identity without creating duplicate approvals', async () => {
    await model(OAuthApproval.name).create({
      providerKey: 'google',
      normalizedEmail: identity.normalizedEmail,
      role: 'REGULAR',
      state: 'REVOKED',
      approvedAt: new Date(),
      actorKind: 'PRIVATE_SHELL_ADMIN',
      reason: 'Old approval revoked',
    })
    const req = await request()
    expect(req.state).toBe('REVOKED')
    await service.decide(admin, req.id, decision())
    expect(await model(OAuthApproval.name).countDocuments()).toBe(1)
    expect((await model(OAuthApproval.name).findOne()).state).toBe('BOUND')
  })
  it('does not restore retained grants from an older CLI revocation', async () => {
    const oldRequest = await request()
    await service.decide(admin, oldRequest.id, decision())
    await model(ACCESS_REQUEST).deleteMany({})
    await model(OAuthApproval.name).updateOne({}, { state: 'REVOKED' })
    const req = await request()
    await service.decide(admin, req.id, { ...decision(), groups: [] })
    expect(
      await model(GroupSenderAssignment.name).countDocuments({
        status: 'ACTIVE',
      }),
    ).toBe(0)
  })
  it('cannot revoke a platform administrator through admission decisions', async () => {
    const req = await request()
    await service.decide(admin, req.id, decision())
    await model(OAuthApproval.name).updateOne({}, { role: 'ADMIN' })
    await expect(
      service.decide(admin, req.id, {
        action: 'revoke',
        version: 1,
        reason: 'Disallowed',
      }),
    ).rejects.toThrow()
    expect((await model(OAuthApproval.name).findOne()).state).toBe('BOUND')
  })
})
