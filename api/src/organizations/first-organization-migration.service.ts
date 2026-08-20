import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { InjectConnection, InjectModel } from '@nestjs/mongoose'
import { Connection, Model, Types } from 'mongoose'
import { ApiKey } from '../auth/schemas/api-key.schema'
import { SmsSafetyUsage } from '../billing/sms-safety-usage.schema'
import { Device } from '../gateway/schemas/device.schema'
import { SMSBatch } from '../gateway/schemas/sms-batch.schema'
import { SMS } from '../gateway/schemas/sms.schema'
import { User } from '../users/schemas/user.schema'
import { WebhookNotification } from '../webhook/schemas/webhook-notification.schema'
import { WebhookSubscription } from '../webhook/schemas/webhook-subscription.schema'
import {
  AuditOutcome,
  GrantStatus,
  MembershipStatus,
  OrganizationAuditAction,
  OrganizationRole,
  OrganizationStatus,
} from './organization.enums'
import { AuthorizationAuditEvent } from './schemas/authorization-audit-event.schema'
import { OperatorGrant } from './schemas/operator-grant.schema'
import { OperatorMembership } from './schemas/operator-membership.schema'
import { Organization } from './schemas/organization.schema'

export type FirstOrganizationMigrationInput = {
  organizationId: string
  administratorEmails: string[]
  apply: boolean
  backupConfirmed?: boolean
  rollbackPath?: string
}

@Injectable()
export class FirstOrganizationMigrationService {
  constructor(
    @InjectConnection() private readonly connection: Connection,
    @InjectModel(Organization.name)
    private readonly organizations: Model<Organization>,
    @InjectModel(OperatorMembership.name)
    private readonly memberships: Model<OperatorMembership>,
    @InjectModel(OperatorGrant.name)
    private readonly grants: Model<OperatorGrant>,
    @InjectModel(AuthorizationAuditEvent.name)
    private readonly audits: Model<AuthorizationAuditEvent>,
    @InjectModel(User.name) private readonly users: Model<User>,
    @InjectModel(Device.name) private readonly devices: Model<Device>,
    @InjectModel(ApiKey.name) private readonly apiKeys: Model<ApiKey>,
    @InjectModel(SMS.name) private readonly messages: Model<SMS>,
    @InjectModel(SMSBatch.name) private readonly batches: Model<SMSBatch>,
    @InjectModel(WebhookSubscription.name)
    private readonly webhooks: Model<WebhookSubscription>,
    @InjectModel(WebhookNotification.name)
    private readonly notifications: Model<WebhookNotification>,
    @InjectModel(SmsSafetyUsage.name)
    private readonly usage: Model<SmsSafetyUsage>,
  ) {}

  async run(input: FirstOrganizationMigrationInput) {
    const validated = await this.validate(input)
    const before = await this.summary(validated.organizationId)
    if (!input.apply)
      return {
        mode: 'DRY_RUN',
        organizationId: input.organizationId,
        ...before,
      }
    if (!input.backupConfirmed || !input.rollbackPath?.trim()) {
      throw new BadRequestException({
        error:
          'Apply requires --backup-confirmed and a documented --rollback-path',
      })
    }

    await this.connection.transaction(async (session) => {
      await this.organizations.updateOne(
        { _id: validated.organizationId, status: OrganizationStatus.ACTIVE },
        { $inc: { authorizationRevision: 1 } },
        { session },
      )
      const options = { session }
      await this.devices.updateMany(
        { organizationId: { $exists: false } },
        { $set: { organizationId: validated.organizationId } },
        options,
      )
      await this.apiKeys.updateMany(
        { organizationId: { $exists: false } },
        {
          $set: {
            organizationId: validated.organizationId,
            purpose: 'GATEWAY',
            scopes: ['gateway:operate'],
          },
        },
        options,
      )
      for (const model of [
        this.messages,
        this.batches,
        this.webhooks,
        this.notifications,
        this.usage,
      ] as Array<Model<any>>) {
        await model.updateMany(
          { organizationId: { $exists: false } },
          { $set: { organizationId: validated.organizationId } },
          options,
        )
      }
      await this.audits.updateOne(
        {
          organizationId: validated.organizationId,
          action: OrganizationAuditAction.FIRST_ORGANIZATION_RESOURCES_MIGRATED,
          operationKey: `b014-first-organization:${validated.organizationId}`,
        },
        {
          $setOnInsert: {
            organizationId: validated.organizationId,
            actorUserId: validated.actorUserId,
            action:
              OrganizationAuditAction.FIRST_ORGANIZATION_RESOURCES_MIGRATED,
            outcome: AuditOutcome.SUCCESS,
            targetType: Organization.name,
            targetId: String(validated.organizationId),
            oldState: 'LEGACY_USER_OWNERSHIP',
            newState: 'ORGANIZATION_SCOPED',
            reason: 'Approved B014 first-organization resource migration',
            correlationId: `b014-first-organization:${validated.organizationId}`,
            operationKey: `b014-first-organization:${validated.organizationId}`,
          },
        },
        { upsert: true, session },
      )
    })

    const after = await this.summary(validated.organizationId)
    if (Object.values(after.unassigned).some((count) => count !== 0)) {
      throw new ConflictException({
        error: 'Migration postcondition failed; rerun with identical inputs',
      })
    }
    return {
      mode: 'APPLY',
      organizationId: input.organizationId,
      backupConfirmed: true,
      rollbackPath: input.rollbackPath,
      before,
      after,
    }
  }

  private async validate(input: FirstOrganizationMigrationInput) {
    if (!Types.ObjectId.isValid(input.organizationId))
      throw new NotFoundException({ error: 'Organization not found' })
    const organizationId = new Types.ObjectId(input.organizationId)
    const organization = await this.organizations.findOne({
      _id: organizationId,
      status: OrganizationStatus.ACTIVE,
    })
    if (!organization)
      throw new NotFoundException({ error: 'Organization not found' })
    const emails = [
      ...new Set(
        input.administratorEmails
          .map((email) => email.trim().toLowerCase())
          .filter(Boolean),
      ),
    ]
    if (!emails.length)
      throw new BadRequestException({
        error: 'At least one exact administrator email is required',
      })
    const users = await this.users.find({
      email: { $in: emails },
      isBanned: { $ne: true },
    })
    if (users.length !== emails.length)
      throw new ConflictException({
        error: 'Expected administrator identities are missing or ambiguous',
      })
    const memberships = await this.memberships.find({
      organizationId,
      userId: { $in: users.map((user) => user._id) },
      status: MembershipStatus.ACTIVE,
    })
    const grants = await this.grants.find({
      organizationId,
      membershipId: { $in: memberships.map((membership) => membership._id) },
      role: OrganizationRole.ORGANIZATION_ADMIN,
      status: GrantStatus.ACTIVE,
    })
    if (memberships.length !== emails.length || grants.length !== emails.length)
      throw new ConflictException({
        error: 'Every expected administrator must have an active usable grant',
      })

    const unowned = await Promise.all([
      this.devices.countDocuments({
        user: { $exists: false },
        organizationId: { $exists: false },
      }),
      this.apiKeys.countDocuments({
        user: { $exists: false },
        organizationId: { $exists: false },
      }),
      this.messages.countDocuments({
        user: { $exists: false },
        organizationId: { $exists: false },
      }),
      this.batches.countDocuments({
        user: { $exists: false },
        organizationId: { $exists: false },
      }),
      this.webhooks.countDocuments({
        user: { $exists: false },
        organizationId: { $exists: false },
      }),
    ])
    if (unowned.some(Boolean))
      throw new ConflictException({
        error: 'Unowned legacy resources prevent a safe migration',
      })
    return { organizationId, actorUserId: users[0]._id! }
  }

  private async summary(organizationId: Types.ObjectId) {
    const entries = [
      ['devices', this.devices],
      ['apiKeys', this.apiKeys],
      ['messages', this.messages],
      ['batches', this.batches],
      ['webhooks', this.webhooks],
      ['webhookNotifications', this.notifications],
      ['usage', this.usage],
    ] as Array<[string, Model<any>]>
    const assigned: Record<string, number> = {}
    const unassigned: Record<string, number> = {}
    for (const [name, model] of entries) {
      assigned[name] = await model.countDocuments({ organizationId })
      unassigned[name] = await model.countDocuments({
        organizationId: { $exists: false },
      })
    }
    return { assigned, unassigned }
  }
}
