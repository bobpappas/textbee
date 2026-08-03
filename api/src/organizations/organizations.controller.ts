import {
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

@ApiTags('organizations')
@ApiBearerAuth()
@Controller()
export class OrganizationsController {
  constructor(
    private readonly organizationsService: OrganizationsService,
    private readonly organizationContext: OrganizationContextService,
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
