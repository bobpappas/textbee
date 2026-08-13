import { Module } from '@nestjs/common'
import { MongooseModule } from '@nestjs/mongoose'
import { Contact, ContactSchema } from '../groups/schemas/contact.schema'
import { Group, GroupSchema } from '../groups/schemas/group.schema'
import {
  RosterMembership,
  RosterMembershipSchema,
} from '../groups/schemas/roster-membership.schema'
import {
  OperatorMembership,
  OperatorMembershipSchema,
} from '../organizations/schemas/operator-membership.schema'
import { SMS, SMSSchema } from '../gateway/schemas/sms.schema'
import { ConsentService } from './consent.service'
import {
  CommandResponseWindow,
  CommandResponseWindowSchema,
} from './schemas/command-response-window.schema'
import {
  ConsentAuditEvent,
  ConsentAuditEventSchema,
} from './schemas/consent-audit-event.schema'
import {
  GroupConsent,
  GroupConsentSchema,
} from './schemas/group-consent.schema'
import {
  OrganizationSuppression,
  OrganizationSuppressionSchema,
} from './schemas/organization-suppression.schema'

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: GroupConsent.name, schema: GroupConsentSchema },
      {
        name: OrganizationSuppression.name,
        schema: OrganizationSuppressionSchema,
      },
      { name: ConsentAuditEvent.name, schema: ConsentAuditEventSchema },
      { name: CommandResponseWindow.name, schema: CommandResponseWindowSchema },
      { name: Group.name, schema: GroupSchema },
      { name: Contact.name, schema: ContactSchema },
      { name: RosterMembership.name, schema: RosterMembershipSchema },
      { name: OperatorMembership.name, schema: OperatorMembershipSchema },
      { name: SMS.name, schema: SMSSchema },
    ]),
  ],
  providers: [ConsentService],
  exports: [ConsentService, MongooseModule],
})
export class ConsentModule {}
