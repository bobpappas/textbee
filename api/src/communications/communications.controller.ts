import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { AuthGuard } from '../auth/guards/auth.guard'
import { CommunicationsService } from './communications.service'

@ApiTags('organization communications')
@ApiBearerAuth()
@Controller('organizations/:organizationId')
@UseGuards(AuthGuard)
export class CommunicationsController {
  constructor(private readonly communications: CommunicationsService) {}

  @Get('communications')
  async list(
    @Param('organizationId') organizationId: string,
    @Request() request,
    @Query() query: Record<string, unknown>,
  ) {
    return {
      data: await this.communications.list(organizationId, request.user, query),
    }
  }

  @Get('groups/:groupId/communications')
  async groupList(
    @Param('organizationId') organizationId: string,
    @Param('groupId') groupId: string,
    @Request() request,
    @Query() query: Record<string, unknown>,
  ) {
    return {
      data: await this.communications.list(organizationId, request.user, {
        ...query,
        groupId,
      }),
    }
  }

  @Get('communications/:conversationId')
  async read(
    @Param('organizationId') organizationId: string,
    @Param('conversationId') conversationId: string,
    @Request() request,
    @Query('groupId') groupId?: string,
  ) {
    return {
      data: await this.communications.read(
        organizationId,
        conversationId,
        request.user,
        groupId,
      ),
    }
  }

  @Patch('communications/:conversationId/read-state')
  async readState(
    @Param('organizationId') organizationId: string,
    @Param('conversationId') conversationId: string,
    @Request() request,
    @Body() input: unknown,
  ) {
    return {
      data: await this.communications.markRead(
        organizationId,
        conversationId,
        request.user,
        input,
      ),
    }
  }

  @Post('communications/entries/:entryId/attribution')
  async attribution(
    @Param('organizationId') organizationId: string,
    @Param('entryId') entryId: string,
    @Request() request,
    @Body() input: unknown,
  ) {
    return {
      data: await this.communications.assignAttribution(
        organizationId,
        entryId,
        request.user,
        input,
      ),
    }
  }

  @Patch('communications/:conversationId/groups/:groupId/work-state')
  async workState(
    @Param('organizationId') organizationId: string,
    @Param('conversationId') conversationId: string,
    @Param('groupId') groupId: string,
    @Request() request,
    @Body() input: unknown,
  ) {
    return {
      data: await this.communications.updateWorkState(
        organizationId,
        conversationId,
        groupId,
        request.user,
        input,
      ),
    }
  }

  @Post('communications/:conversationId/replies/preview')
  async previewReply(
    @Param('organizationId') organizationId: string,
    @Param('conversationId') conversationId: string,
    @Request() request,
    @Body() input: unknown,
  ) {
    return {
      data: await this.communications.previewReply(
        organizationId,
        conversationId,
        request.user,
        input,
      ),
    }
  }

  @Post('communications/:conversationId/replies/:previewId/confirm')
  async confirmReply(
    @Param('organizationId') organizationId: string,
    @Param('conversationId') conversationId: string,
    @Param('previewId') previewId: string,
    @Request() request,
    @Headers('x-request-id') requestId?: string,
  ) {
    return {
      data: await this.communications.confirmReply(
        organizationId,
        conversationId,
        previewId,
        request.user,
        requestId,
      ),
    }
  }
}
