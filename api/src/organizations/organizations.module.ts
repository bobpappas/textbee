import { forwardRef, Module } from '@nestjs/common'
import { MongooseModule } from '@nestjs/mongoose'
import { AuthModule } from '../auth/auth.module'
import { UsersModule } from '../users/users.module'
import { OrganizationPolicyService } from './organization-policy.service'
import { OrganizationAdminGuard } from './organization-admin.guard'
import { OrganizationsController } from './organizations.controller'
import { OrganizationsService } from './organizations.service'
import { PlatformAdminGuard } from './platform-admin.guard'
import { PlatformPolicyService } from './platform-policy.service'
import {
  AuthorizationAuditEvent,
  AuthorizationAuditEventSchema,
} from './schemas/authorization-audit-event.schema'
import {
  OperatorGrant,
  OperatorGrantSchema,
} from './schemas/operator-grant.schema'
import {
  OperatorMembership,
  OperatorMembershipSchema,
} from './schemas/operator-membership.schema'
import { Organization, OrganizationSchema } from './schemas/organization.schema'
import { OrganizationContextService } from './organization-context.service'
import { Group, GroupSchema } from '../groups/schemas/group.schema'
import {
  GroupOwnerAssignment,
  GroupOwnerAssignmentSchema,
} from '../groups/schemas/group-owner-assignment.schema'
import {
  GroupSenderAssignment,
  GroupSenderAssignmentSchema,
} from '../groups/schemas/group-sender-assignment.schema'
import { User, UserSchema } from '../users/schemas/user.schema'
import { OperatorAccessService } from './operator-access.service'
import { OrganizationOperationalGuard } from './organization-operational.guard'
import { FirstOrganizationMigrationService } from './first-organization-migration.service'
import { ApiKey, ApiKeySchema } from '../auth/schemas/api-key.schema'
import {
  SmsSafetyUsage,
  SmsSafetyUsageSchema,
} from '../billing/sms-safety-usage.schema'
import { Device, DeviceSchema } from '../gateway/schemas/device.schema'
import { SMS, SMSSchema } from '../gateway/schemas/sms.schema'
import { SMSBatch, SMSBatchSchema } from '../gateway/schemas/sms-batch.schema'
import {
  WebhookNotification,
  WebhookNotificationSchema,
} from '../webhook/schemas/webhook-notification.schema'
import {
  WebhookSubscription,
  WebhookSubscriptionSchema,
} from '../webhook/schemas/webhook-subscription.schema'

@Module({
  imports: [
    forwardRef(() => AuthModule),
    UsersModule,
    MongooseModule.forFeature([
      { name: Organization.name, schema: OrganizationSchema },
      { name: OperatorMembership.name, schema: OperatorMembershipSchema },
      { name: OperatorGrant.name, schema: OperatorGrantSchema },
      { name: Group.name, schema: GroupSchema },
      { name: GroupOwnerAssignment.name, schema: GroupOwnerAssignmentSchema },
      { name: GroupSenderAssignment.name, schema: GroupSenderAssignmentSchema },
      { name: User.name, schema: UserSchema },
      { name: ApiKey.name, schema: ApiKeySchema },
      { name: SmsSafetyUsage.name, schema: SmsSafetyUsageSchema },
      { name: Device.name, schema: DeviceSchema },
      { name: SMS.name, schema: SMSSchema },
      { name: SMSBatch.name, schema: SMSBatchSchema },
      { name: WebhookSubscription.name, schema: WebhookSubscriptionSchema },
      { name: WebhookNotification.name, schema: WebhookNotificationSchema },
      {
        name: AuthorizationAuditEvent.name,
        schema: AuthorizationAuditEventSchema,
      },
    ]),
  ],
  controllers: [OrganizationsController],
  providers: [
    OrganizationsService,
    PlatformPolicyService,
    PlatformAdminGuard,
    OrganizationPolicyService,
    OrganizationAdminGuard,
    OrganizationContextService,
    OperatorAccessService,
    OrganizationOperationalGuard,
    FirstOrganizationMigrationService,
  ],
  exports: [
    OrganizationsService,
    OrganizationPolicyService,
    OrganizationContextService,
    OperatorAccessService,
    OrganizationOperationalGuard,
    FirstOrganizationMigrationService,
  ],
})
export class OrganizationsModule {}
