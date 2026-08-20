import {
  Body,
  Request,
  Param,
  Post,
  Patch,
  Delete,
  Controller,
  Get,
  UseGuards,
  Query,
} from '@nestjs/common'
import { WebhookService } from './webhook.service'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { CreateWebhookDto, UpdateWebhookDto } from './webhook.dto'
import { AuthGuard } from 'src/auth/guards/auth.guard'
import { OrganizationOperationalGuard } from '../organizations/organization-operational.guard'

@ApiTags('webhooks')
@ApiBearerAuth()
@Controller('webhooks')
export class WebhookController {
  constructor(private readonly webhookService: WebhookService) {}

  @Get()
  @UseGuards(AuthGuard, OrganizationOperationalGuard)
  async getWebhooks(@Request() req) {
    const data = await this.webhookService.findWebhooksForUser({
      user: req.user,
      organizationId: req.organizationId,
    })
    return { data }
  }
  @Get('notifications')
  @UseGuards(AuthGuard, OrganizationOperationalGuard)
  async getWebhookNotifications(
    @Request() req,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('status') status?: string,
    @Query('eventType') eventType?: string,
    @Query('deviceId') deviceId?: string,
    @Query('start') start?: Date,
    @Query('end') end?: Date,
    @Query('webhookSubscriptionId') webhookSubscriptionId?: string,
  ) {
    const data = await this.webhookService.findWebhookNotificationsForUser({
      user: req.user,
      organizationId: req.organizationId,
      page,
      limit,
      eventType,
      status,
      start,
      end,
      deviceId,
      webhookSubscriptionId,
    })
    return { data }
  }
  @Get(':webhookId')
  @UseGuards(AuthGuard, OrganizationOperationalGuard)
  async getWebhook(@Request() req, @Param('webhookId') webhookId: string) {
    const data = await this.webhookService.findOne({
      user: req.user,
      organizationId: req.organizationId,
      webhookId,
    })
    return { data }
  }

  @Post()
  @UseGuards(AuthGuard, OrganizationOperationalGuard)
  async createWebhook(
    @Request() req,
    @Body() createWebhookDto: CreateWebhookDto,
  ) {
    const data = await this.webhookService.create({
      user: req.user,
      organizationId: req.organizationId,
      createWebhookDto,
    })
    return { data }
  }

  @Patch(':webhookId')
  @UseGuards(AuthGuard, OrganizationOperationalGuard)
  async updateWebhook(
    @Request() req,
    @Param('webhookId') webhookId: string,
    @Body() updateWebhookDto: UpdateWebhookDto,
  ) {
    const data = await this.webhookService.update({
      user: req.user,
      organizationId: req.organizationId,
      webhookId,
      updateWebhookDto,
    })
    return { data }
  }

  @Delete(':webhookId')
  @UseGuards(AuthGuard, OrganizationOperationalGuard)
  async deleteWebhook(@Request() req, @Param('webhookId') webhookId: string) {
    const data = await this.webhookService.remove({
      user: req.user,
      organizationId: req.organizationId,
      webhookId,
    })
    return { data }
  }
}
