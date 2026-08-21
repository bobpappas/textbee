import { Module } from '@nestjs/common'
import { MongooseModule } from '@nestjs/mongoose'
import { ApiKey, ApiKeySchema } from '../auth/schemas/api-key.schema'
import {
  SmsSafetyUsage,
  SmsSafetyUsageSchema,
} from '../billing/sms-safety-usage.schema'
import { Device, DeviceSchema } from '../gateway/schemas/device.schema'
import { SMSBatch, SMSBatchSchema } from '../gateway/schemas/sms-batch.schema'
import { SMS, SMSSchema } from '../gateway/schemas/sms.schema'
import { User, UserSchema } from '../users/schemas/user.schema'
import {
  WebhookNotification,
  WebhookNotificationSchema,
} from '../webhook/schemas/webhook-notification.schema'
import {
  WebhookSubscription,
  WebhookSubscriptionSchema,
} from '../webhook/schemas/webhook-subscription.schema'
import { FirstOrganizationMigrationService } from './first-organization-migration.service'
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

@Module({
  imports: [
    MongooseModule.forRoot(process.env.MONGO_URI),
    MongooseModule.forFeature([
      { name: Organization.name, schema: OrganizationSchema },
      { name: OperatorMembership.name, schema: OperatorMembershipSchema },
      { name: OperatorGrant.name, schema: OperatorGrantSchema },
      {
        name: AuthorizationAuditEvent.name,
        schema: AuthorizationAuditEventSchema,
      },
      { name: User.name, schema: UserSchema },
      { name: Device.name, schema: DeviceSchema },
      { name: ApiKey.name, schema: ApiKeySchema },
      { name: SMS.name, schema: SMSSchema },
      { name: SMSBatch.name, schema: SMSBatchSchema },
      { name: WebhookSubscription.name, schema: WebhookSubscriptionSchema },
      { name: WebhookNotification.name, schema: WebhookNotificationSchema },
      { name: SmsSafetyUsage.name, schema: SmsSafetyUsageSchema },
    ]),
  ],
  providers: [FirstOrganizationMigrationService],
})
export class FirstOrganizationMigrationModule {}
