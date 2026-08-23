import { Module } from '@nestjs/common'
import { MongooseModule } from '@nestjs/mongoose'
import { AuthModule } from '../auth/auth.module'
import { BillingModule } from '../billing/billing.module'
import { ConsentModule } from '../consent/consent.module'
import { GatewayModule } from '../gateway/gateway.module'
import { Device, DeviceSchema } from '../gateway/schemas/device.schema'
import { SMS, SMSSchema } from '../gateway/schemas/sms.schema'
import { Contact, ContactSchema } from '../groups/schemas/contact.schema'
import {
  GroupAuditEvent,
  GroupAuditEventSchema,
} from '../groups/schemas/group-audit-event.schema'
import {
  GroupMessageDelivery,
  GroupMessageDeliverySchema,
} from '../groups/schemas/group-message-delivery.schema'
import {
  GroupMessageSend,
  GroupMessageSendSchema,
} from '../groups/schemas/group-message-send.schema'
import {
  GroupOwnerAssignment,
  GroupOwnerAssignmentSchema,
} from '../groups/schemas/group-owner-assignment.schema'
import {
  GroupSenderAssignment,
  GroupSenderAssignmentSchema,
} from '../groups/schemas/group-sender-assignment.schema'
import { Group, GroupSchema } from '../groups/schemas/group.schema'
import {
  RosterMembership,
  RosterMembershipSchema,
} from '../groups/schemas/roster-membership.schema'
import { OrganizationsModule } from '../organizations/organizations.module'
import {
  OperatorMembership,
  OperatorMembershipSchema,
} from '../organizations/schemas/operator-membership.schema'
import { User, UserSchema } from '../users/schemas/user.schema'
import { CommunicationsController } from './communications.controller'
import { CommunicationsListener } from './communications.listener'
import { CommunicationsService } from './communications.service'
import {
  CommunicationAuditEvent,
  CommunicationAuditEventSchema,
} from './schemas/communication-audit-event.schema'
import {
  CommunicationReplyPreview,
  CommunicationReplyPreviewSchema,
} from './schemas/communication-reply-preview.schema'
import {
  ConversationEntry,
  ConversationEntrySchema,
} from './schemas/conversation-entry.schema'
import {
  ConversationReadState,
  ConversationReadStateSchema,
} from './schemas/conversation-read-state.schema'
import {
  ConversationWorkState,
  ConversationWorkStateSchema,
} from './schemas/conversation-work-state.schema'
import { Conversation, ConversationSchema } from './schemas/conversation.schema'

@Module({
  imports: [
    AuthModule,
    BillingModule,
    ConsentModule,
    GatewayModule,
    OrganizationsModule,
    MongooseModule.forFeature([
      { name: Conversation.name, schema: ConversationSchema },
      { name: ConversationEntry.name, schema: ConversationEntrySchema },
      { name: ConversationReadState.name, schema: ConversationReadStateSchema },
      { name: ConversationWorkState.name, schema: ConversationWorkStateSchema },
      {
        name: CommunicationAuditEvent.name,
        schema: CommunicationAuditEventSchema,
      },
      {
        name: CommunicationReplyPreview.name,
        schema: CommunicationReplyPreviewSchema,
      },
      { name: Contact.name, schema: ContactSchema },
      { name: Group.name, schema: GroupSchema },
      { name: RosterMembership.name, schema: RosterMembershipSchema },
      { name: GroupOwnerAssignment.name, schema: GroupOwnerAssignmentSchema },
      { name: GroupSenderAssignment.name, schema: GroupSenderAssignmentSchema },
      { name: OperatorMembership.name, schema: OperatorMembershipSchema },
      { name: User.name, schema: UserSchema },
      { name: Device.name, schema: DeviceSchema },
      { name: SMS.name, schema: SMSSchema },
      { name: GroupMessageSend.name, schema: GroupMessageSendSchema },
      { name: GroupMessageDelivery.name, schema: GroupMessageDeliverySchema },
      { name: GroupAuditEvent.name, schema: GroupAuditEventSchema },
    ]),
  ],
  controllers: [CommunicationsController],
  providers: [CommunicationsService, CommunicationsListener],
  exports: [CommunicationsService],
})
export class CommunicationsModule {}
