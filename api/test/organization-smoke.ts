import { randomUUID } from 'crypto'
import mongoose, { Types } from 'mongoose'
import { OrganizationPolicyService } from '../src/organizations/organization-policy.service'
import { OrganizationContextService } from '../src/organizations/organization-context.service'
import {
  MembershipStatus,
  OrganizationCapability,
  OrganizationContextState,
} from '../src/organizations/organization.enums'
import { OrganizationsService } from '../src/organizations/organizations.service'
import {
  AuthorizationAuditEvent,
  AuthorizationAuditEventSchema,
} from '../src/organizations/schemas/authorization-audit-event.schema'
import {
  OperatorGrant,
  OperatorGrantSchema,
} from '../src/organizations/schemas/operator-grant.schema'
import {
  OperatorMembership,
  OperatorMembershipSchema,
} from '../src/organizations/schemas/operator-membership.schema'
import {
  Organization,
  OrganizationSchema,
} from '../src/organizations/schemas/organization.schema'

async function main() {
  const sourceUri =
    process.env.ORGANIZATION_SMOKE_MONGO_URI ||
    'mongodb://textbee-dev-user:textbee-dev-password@127.0.0.1:27018/textbee?authSource=admin'
  const databaseName = `textbee_organization_smoke_${randomUUID().replace(/-/g, '')}`
  const uri = new URL(sourceUri)
  uri.pathname = `/${databaseName}`

  const connection = await mongoose.createConnection(uri.toString()).asPromise()
  try {
    const organizations = connection.model(
      Organization.name,
      OrganizationSchema,
    )
    const memberships = connection.model(
      OperatorMembership.name,
      OperatorMembershipSchema,
    )
    const grants = connection.model(OperatorGrant.name, OperatorGrantSchema)
    const auditEvents = connection.model(
      AuthorizationAuditEvent.name,
      AuthorizationAuditEventSchema,
    )
    await Promise.all([
      organizations.init(),
      memberships.init(),
      grants.init(),
      auditEvents.init(),
    ])

    const gatewaySentinel = await connection.collection('devices').insertOne({
      kind: 'b020-smoke-sentinel',
    })
    const messageSentinel = await connection.collection('sms').insertOne({
      kind: 'b020-smoke-sentinel',
    })
    const before = {
      devices: await connection.collection('devices').countDocuments(),
      messages: await connection.collection('sms').countDocuments(),
    }

    const policy = new OrganizationPolicyService(memberships, grants)
    const service = new OrganizationsService(
      organizations,
      memberships,
      grants,
      auditEvents,
      policy,
    )
    const actor = { _id: new Types.ObjectId() }
    const key = `b020-smoke-${randomUUID()}`
    const created = await service.create(actor, 'B020 Smoke Organization', key)
    const repeated = await service.create(actor, 'B020 Smoke Organization', key)
    if (created.organization.id !== repeated.organization.id) {
      throw new Error('Idempotent create returned another organization')
    }

    const refreshedService = new OrganizationsService(
      organizations,
      memberships,
      grants,
      auditEvents,
      policy,
    )
    const activeMembership = await policy.activeAdminMembership(
      created.organization.id,
      String(actor._id),
    )
    if (!activeMembership) {
      const persistedMemberships = await memberships.find().lean()
      const persistedGrants = await grants.find().lean()
      const directMembership = await memberships.findOne({
        organizationId: created.organization.id,
        userId: actor._id,
        status: 'ACTIVE',
      })
      const directGrant = directMembership
        ? await grants.findOne({
            organizationId: created.organization.id,
            membershipId: directMembership._id,
            role: 'ORGANIZATION_ADMIN',
            status: 'ACTIVE',
          })
        : null
      throw new Error(
        `Organization policy rejected persisted records: ${JSON.stringify({
          actorId: String(actor._id),
          organizationId: created.organization.id,
          directMembership: Boolean(directMembership),
          directGrant: Boolean(directGrant),
          memberships: persistedMemberships.map((item) => ({
            id: String(item._id),
            organizationId: String(item.organizationId),
            userId: String(item.userId),
            status: item.status,
          })),
          grants: persistedGrants.map((item) => ({
            organizationId: String(item.organizationId),
            membershipId: String(item.membershipId),
            role: item.role,
            status: item.status,
          })),
        })}`,
      )
    }
    const contextService = new OrganizationContextService(
      organizations,
      memberships,
      grants,
      connection.model('GroupOwnerAssignment') as any,
      connection.model('Group') as any,
    )
    const activeContext = await contextService.current(actor)
    if (
      activeContext.state !== OrganizationContextState.ACTIVE ||
      activeContext.organization?.id !== created.organization.id ||
      !activeContext.capabilities.includes(
        OrganizationCapability.PROFILE_MANAGE,
      )
    ) {
      throw new Error('Current organization context did not resolve')
    }
    await memberships.updateOne(
      { _id: activeMembership._id },
      { $set: { status: MembershipStatus.SUSPENDED } },
    )
    const revokedContext = await contextService.current(actor)
    if (revokedContext.state !== OrganizationContextState.NO_ACCESS) {
      throw new Error('Suspended membership still produced context')
    }
    await memberships.updateOne(
      { _id: activeMembership._id },
      { $set: { status: MembershipStatus.ACTIVE } },
    )
    const profile = await refreshedService.profile(
      created.organization.id,
      actor,
    )
    if (profile.displayName !== 'B020 Smoke Organization') {
      throw new Error('Organization did not persist across service refresh')
    }
    const renamed = await refreshedService.rename(
      created.organization.id,
      actor,
      'B020 Renamed Organization',
    )
    if (renamed.displayName !== 'B020 Renamed Organization') {
      throw new Error('Organization rename was not persisted')
    }

    const counts = await Promise.all([
      organizations.countDocuments(),
      memberships.countDocuments(),
      grants.countDocuments(),
      auditEvents.countDocuments(),
    ])
    if (counts.join(',') !== '1,1,1,2') {
      throw new Error(
        `Unexpected organization record counts: ${counts.join(',')}`,
      )
    }
    const after = {
      devices: await connection.collection('devices').countDocuments(),
      messages: await connection.collection('sms').countDocuments(),
    }
    if (
      before.devices !== after.devices ||
      before.messages !== after.messages
    ) {
      throw new Error('Existing gateway or message records changed')
    }
    if (
      !(await connection
        .collection('devices')
        .findOne({ _id: gatewaySentinel.insertedId })) ||
      !(await connection
        .collection('sms')
        .findOne({ _id: messageSentinel.insertedId }))
    ) {
      throw new Error('Gateway or message sentinel was removed')
    }

    process.stdout.write(
      'Organization smoke passed: B020 persistence and B022 context/revocation verified; gateway/message sentinels unchanged.\n',
    )
  } finally {
    await connection.dropDatabase()
    await connection.close()
  }
}

main().catch((error) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : String(error)}\n`,
  )
  process.exitCode = 1
})
