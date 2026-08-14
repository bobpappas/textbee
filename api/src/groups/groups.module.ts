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
import { Group, GroupSchema } from './schemas/group.schema'
import {
  RosterMembership,
  RosterMembershipSchema,
} from './schemas/roster-membership.schema'
import {
  RosterBulkImport,
  RosterBulkImportSchema,
} from './schemas/roster-bulk-import.schema'

@Module({
  imports: [
    AuthModule,
    ConsentModule,
    UsersModule,
    OrganizationsModule,
    MongooseModule.forFeature([
      { name: Group.name, schema: GroupSchema },
      { name: Contact.name, schema: ContactSchema },
      { name: GroupOwnerAssignment.name, schema: GroupOwnerAssignmentSchema },
      { name: RosterMembership.name, schema: RosterMembershipSchema },
      { name: RosterBulkImport.name, schema: RosterBulkImportSchema },
      { name: GroupAuditEvent.name, schema: GroupAuditEventSchema },
      { name: OperatorMembership.name, schema: OperatorMembershipSchema },
      { name: User.name, schema: UserSchema },
    ]),
  ],
  controllers: [GroupsController],
  providers: [GroupsService],
  exports: [GroupsService],
})
export class GroupsModule {}
