import { Module } from '@nestjs/common'
import { MongooseModule } from '@nestjs/mongoose'
import { AuthModule } from '../auth/auth.module'
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

@Module({
  imports: [
    AuthModule,
    MongooseModule.forFeature([
      { name: Organization.name, schema: OrganizationSchema },
      { name: OperatorMembership.name, schema: OperatorMembershipSchema },
      { name: OperatorGrant.name, schema: OperatorGrantSchema },
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
  ],
  exports: [OrganizationsService, OrganizationPolicyService],
})
export class OrganizationsModule {}
