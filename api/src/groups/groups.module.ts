import { Module } from '@nestjs/common'
import { MongooseModule } from '@nestjs/mongoose'
import { AuthModule } from '../auth/auth.module'
import { ConsentModule } from '../consent/consent.module'
import { OrganizationsModule } from '../organizations/organizations.module'
import {
  OperatorMembership,
  OperatorMembershipSchema,
} from '../organizations/schemas/operator-membership.schema'
import { UsersModule } from '../users/users.module'
import { BillingModule } from '../billing/billing.module'
import { GatewayModule } from '../gateway/gateway.module'
import { Device, DeviceSchema } from '../gateway/schemas/device.schema'
import { SMS, SMSSchema } from '../gateway/schemas/sms.schema'
import { GroupMessagingService } from './group-messaging.service'
import { User, UserSchema } from '../users/schemas/user.schema'
import { GroupsController } from './groups.controller'
import { GroupsService } from './groups.service'
import { Contact, ContactSchema } from './schemas/contact.schema'
import {
  GroupAuditEvent,
  GroupAuditEventSchema,
} from './schemas/group-audit-event.schema'
import {
  GroupOwnerAssignment,
  GroupOwnerAssignmentSchema,
} from './schemas/group-owner-assignment.schema'
import {
  GroupSenderAssignment,
  GroupSenderAssignmentSchema,
} from './schemas/group-sender-assignment.schema'
import { Group, GroupSchema } from './schemas/group.schema'
import {
  RosterMembership,
  RosterMembershipSchema,
} from './schemas/roster-membership.schema'
import {
  RosterBulkImport,
  RosterBulkImportSchema,
} from './schemas/roster-bulk-import.schema'
import {
  GroupMessagePreview,
  GroupMessagePreviewSchema,
} from './schemas/group-message-preview.schema'
import {
  GroupMessageSend,
  GroupMessageSendSchema,
} from './schemas/group-message-send.schema'
import {
  GroupMessageDelivery,
  GroupMessageDeliverySchema,
} from './schemas/group-message-delivery.schema'

@Module({
  imports: [
    AuthModule,
    ConsentModule,
    UsersModule,
    OrganizationsModule,
    BillingModule,
    GatewayModule,
    MongooseModule.forFeature([
      { name: Group.name, schema: GroupSchema },
      { name: Contact.name, schema: ContactSchema },
      { name: GroupOwnerAssignment.name, schema: GroupOwnerAssignmentSchema },
      { name: GroupSenderAssignment.name, schema: GroupSenderAssignmentSchema },
      { name: RosterMembership.name, schema: RosterMembershipSchema },
      { name: RosterBulkImport.name, schema: RosterBulkImportSchema },
      { name: GroupAuditEvent.name, schema: GroupAuditEventSchema },
      { name: OperatorMembership.name, schema: OperatorMembershipSchema },
      { name: User.name, schema: UserSchema },
      { name: Device.name, schema: DeviceSchema },
      { name: SMS.name, schema: SMSSchema },
      { name: GroupMessagePreview.name, schema: GroupMessagePreviewSchema },
      { name: GroupMessageSend.name, schema: GroupMessageSendSchema },
      { name: GroupMessageDelivery.name, schema: GroupMessageDeliverySchema },
    ]),
  ],
  controllers: [GroupsController],
  providers: [GroupsService, GroupMessagingService],
  exports: [GroupsService, GroupMessagingService],
})
export class GroupsModule {}
