import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { AuthGuard } from '../auth/guards/auth.guard'
import { OrganizationNameDto } from './organization.dto'
import { OrganizationsService } from './organizations.service'
import { PlatformAdminGuard } from './platform-admin.guard'
import { OrganizationAdminGuard } from './organization-admin.guard'
import { OrganizationContextService } from './organization-context.service'
import { OperatorAccessService } from './operator-access.service'

@ApiTags('organizations')
@ApiBearerAuth()
@Controller()
export class OrganizationsController {
  constructor(
    private readonly organizationsService: OrganizationsService,
    private readonly organizationContext: OrganizationContextService,
    private readonly operatorAccess?: OperatorAccessService,
  ) {}

  @Get('organizations/current-context')
  @UseGuards(AuthGuard)
  async currentContext(@Request() request) {
    return {
      data: await this.organizationContext.current(
        request.user,
        Boolean(request.apiKey),
      ),
    }
  }

  @Post('organizations/:organizationId/operators')
  @UseGuards(AuthGuard, OrganizationAdminGuard)
  async addOperator(
    @Param('organizationId') organizationId: string,
    @Request() request,
    @Body() input: unknown,
  ) {
    return {
      data: await this.operatorAccess!.add(organizationId, request.user, input),
    }
  }

  @Patch('organizations/:organizationId/operators/:membershipId/status')
  @UseGuards(AuthGuard, OrganizationAdminGuard)
  async changeOperatorStatus(
    @Param('organizationId') organizationId: string,
    @Param('membershipId') membershipId: string,
    @Request() request,
    @Body() input: { status?: string },
  ) {
    return {
      data: await this.operatorAccess!.changeStatus(
        organizationId,
        membershipId,
        request.user,
        input?.status ?? '',
        input,
      ),
    }
  }

  @Patch(
    'organizations/:organizationId/operators/:membershipId/organization-admin',
  )
  @UseGuards(AuthGuard, OrganizationAdminGuard)
  async changeOrganizationAdmin(
    @Param('organizationId') organizationId: string,
    @Param('membershipId') membershipId: string,
    @Request() request,
    @Body() input: { enabled?: boolean },
  ) {
    if (typeof input?.enabled !== 'boolean') {
      throw new BadRequestException({ error: 'enabled must be boolean' })
    }
    return {
      data: await this.operatorAccess!.changeAdmin(
        organizationId,
        membershipId,
        request.user,
        input.enabled,
        input,
      ),
    }
  }

  @Get('platform/organizations')
  @UseGuards(AuthGuard, PlatformAdminGuard)
  async list(@Request() request) {
    return { data: await this.organizationsService.list(request.user) }
  }

  @Post('platform/organizations')
  @UseGuards(AuthGuard, PlatformAdminGuard)
  async create(
    @Request() request,
    @Body() input: OrganizationNameDto,
    @Headers('idempotency-key') idempotencyKey: string,
    @Headers('x-request-id') requestId?: string,
  ) {
    return {
      data: await this.organizationsService.create(
        request.user,
        input?.displayName,
        idempotencyKey,
        requestId,
      ),
    }
  }

  @Post('platform/organizations/:organizationId/retry-provisioning')
  @UseGuards(AuthGuard, PlatformAdminGuard)
  async retry(
    @Param('organizationId') organizationId: string,
    @Headers('x-request-id') requestId?: string,
  ) {
    return {
      data: await this.organizationsService.retry(organizationId, requestId),
    }
  }

  @Get('organizations/:organizationId/profile')
  @UseGuards(AuthGuard, OrganizationAdminGuard)
  async profile(
    @Param('organizationId') organizationId: string,
    @Request() request,
  ) {
    return {
      data: await this.organizationsService.profile(
        organizationId,
        request.user,
      ),
    }
  }

  @Patch('organizations/:organizationId/profile')
  @UseGuards(AuthGuard, OrganizationAdminGuard)
  async rename(
    @Param('organizationId') organizationId: string,
    @Request() request,
    @Body() input: OrganizationNameDto,
    @Headers('x-request-id') requestId?: string,
  ) {
    return {
      data: await this.organizationsService.rename(
        organizationId,
        request.user,
        input?.displayName,
        requestId,
      ),
    }
  }
}
