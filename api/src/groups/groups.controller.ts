import {
  Body,
  Controller,
  Delete,
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
import { GroupsService } from './groups.service'
import { GroupMessagingService } from './group-messaging.service'

@ApiTags('organization groups')
@ApiBearerAuth()
@Controller('organizations/:organizationId')
@UseGuards(AuthGuard)
export class GroupsController {
  constructor(
    private readonly groups: GroupsService,
    private readonly messaging: GroupMessagingService,
  ) {}

  @Get('receiving-numbers')
  receivingNumbers(
    @Param('organizationId') organizationId: string,
    @Request() request,
  ) {
    return this.data(this.groups.receivingNumbers(organizationId, request.user))
  }

  @Get('operators')
  operators(
    @Param('organizationId') organizationId: string,
    @Request() request,
  ) {
    return this.data(this.groups.operators(organizationId, request.user))
  }

  @Get('groups')
  list(
    @Param('organizationId') organizationId: string,
    @Request() request,
    @Query('includeArchived') includeArchived?: string,
  ) {
    return this.data(
      this.groups.list(
        organizationId,
        request.user,
        includeArchived === 'true',
      ),
    )
  }

  @Get('groups/join-code-availability')
  availability(
    @Param('organizationId') organizationId: string,
    @Request() request,
    @Query('receivingNumberId') receivingNumberId: string,
    @Query('code') code: string,
    @Query('excludeGroupId') excludeGroupId?: string,
  ) {
    return this.data(
      this.groups.codeAvailability(
        organizationId,
        request.user,
        receivingNumberId,
        code,
        excludeGroupId,
      ),
    )
  }

  @Post('groups')
  create(
    @Param('organizationId') organizationId: string,
    @Request() request,
    @Body() input: unknown,
    @Headers('x-request-id') requestId?: string,
  ) {
    return this.data(
      this.groups.create(organizationId, request.user, input, requestId),
    )
  }

  @Get('groups/:groupId')
  read(
    @Param('organizationId') organizationId: string,
    @Param('groupId') groupId: string,
    @Request() request,
  ) {
    return this.data(this.groups.read(organizationId, groupId, request.user))
  }

  @Post('groups/:groupId/messages/preview')
  previewMessage(
    @Param('organizationId') organizationId: string,
    @Param('groupId') groupId: string,
    @Request() request,
    @Body() input: unknown,
  ) {
    return this.data(
      this.messaging.preview(organizationId, groupId, request.user, input),
    )
  }

  @Post('groups/:groupId/messages/:previewId/confirm')
  confirmMessage(
    @Param('organizationId') organizationId: string,
    @Param('groupId') groupId: string,
    @Param('previewId') previewId: string,
    @Request() request,
    @Headers('x-request-id') requestId?: string,
  ) {
    return this.data(
      this.messaging.confirm(
        organizationId,
        groupId,
        previewId,
        request.user,
        requestId,
      ),
    )
  }

  @Get('groups/:groupId/messages/:sendId')
  messageResult(
    @Param('organizationId') organizationId: string,
    @Param('groupId') groupId: string,
    @Param('sendId') sendId: string,
    @Request() request,
  ) {
    return this.data(
      this.messaging.result(organizationId, groupId, sendId, request.user),
    )
  }

  @Patch('groups/:groupId/name')
  rename(
    @Param('organizationId') organizationId: string,
    @Param('groupId') groupId: string,
    @Request() request,
    @Body() input: unknown,
    @Headers('x-request-id') requestId?: string,
  ) {
    return this.data(
      this.groups.rename(
        organizationId,
        groupId,
        request.user,
        input,
        requestId,
      ),
    )
  }

  @Patch('groups/:groupId/join-settings')
  changeJoinSettings(
    @Param('organizationId') organizationId: string,
    @Param('groupId') groupId: string,
    @Request() request,
    @Body() input: unknown,
    @Headers('x-request-id') requestId?: string,
  ) {
    return this.data(
      this.groups.changeJoinSettings(
        organizationId,
        groupId,
        request.user,
        input,
        requestId,
      ),
    )
  }

  @Post('groups/:groupId/archive')
  archive(
    @Param('organizationId') organizationId: string,
    @Param('groupId') groupId: string,
    @Request() request,
    @Body() input: unknown,
    @Headers('x-request-id') requestId?: string,
  ) {
    return this.data(
      this.groups.archive(
        organizationId,
        groupId,
        request.user,
        input,
        requestId,
      ),
    )
  }

  @Post('groups/:groupId/reactivate')
  reactivate(
    @Param('organizationId') organizationId: string,
    @Param('groupId') groupId: string,
    @Request() request,
    @Headers('x-request-id') requestId?: string,
  ) {
    return this.data(
      this.groups.reactivate(organizationId, groupId, request.user, requestId),
    )
  }

  @Post('groups/:groupId/owners/:membershipId')
  assignOwner(
    @Param('organizationId') organizationId: string,
    @Param('groupId') groupId: string,
    @Param('membershipId') membershipId: string,
    @Request() request,
    @Headers('x-request-id') requestId?: string,
  ) {
    return this.data(
      this.groups.assignOwner(
        organizationId,
        groupId,
        membershipId,
        request.user,
        requestId,
      ),
    )
  }

  @Delete('groups/:groupId/owners/:membershipId')
  revokeOwner(
    @Param('organizationId') organizationId: string,
    @Param('groupId') groupId: string,
    @Param('membershipId') membershipId: string,
    @Request() request,
    @Body() input: unknown,
    @Headers('x-request-id') requestId?: string,
  ) {
    return this.data(
      this.groups.revokeOwner(
        organizationId,
        groupId,
        membershipId,
        request.user,
        input,
        requestId,
      ),
    )
  }

  @Get('groups/:groupId/roster')
  roster(
    @Param('organizationId') organizationId: string,
    @Param('groupId') groupId: string,
    @Request() request,
    @Query('search') search?: string,
  ) {
    return this.data(
      this.groups.roster(organizationId, groupId, request.user, search),
    )
  }

  @Post('groups/:groupId/roster')
  addPerson(
    @Param('organizationId') organizationId: string,
    @Param('groupId') groupId: string,
    @Request() request,
    @Body() input: unknown,
    @Headers('x-request-id') requestId?: string,
  ) {
    return this.data(
      this.groups.addPerson(
        organizationId,
        groupId,
        request.user,
        input,
        requestId,
      ),
    )
  }

  @Patch('groups/:groupId/contacts/:contactId/name')
  renameContact(
    @Param('organizationId') organizationId: string,
    @Param('groupId') groupId: string,
    @Param('contactId') contactId: string,
    @Request() request,
    @Body() input: unknown,
    @Headers('x-request-id') requestId?: string,
  ) {
    return this.data(
      this.groups.renameContact(
        organizationId,
        groupId,
        contactId,
        request.user,
        input,
        requestId,
      ),
    )
  }

  @Post('groups/:groupId/roster-bulk/preview')
  previewBulkAdd(
    @Param('organizationId') organizationId: string,
    @Param('groupId') groupId: string,
    @Request() request,
    @Body() input: unknown,
    @Headers('x-request-id') requestId?: string,
  ) {
    return this.data(
      this.groups.previewBulkAdd(
        organizationId,
        groupId,
        request.user,
        input,
        requestId,
      ),
    )
  }

  @Post('groups/:groupId/roster-bulk/:previewId/apply')
  applyBulkAdd(
    @Param('organizationId') organizationId: string,
    @Param('groupId') groupId: string,
    @Param('previewId') previewId: string,
    @Request() request,
    @Body() input: unknown,
    @Headers('x-request-id') requestId?: string,
  ) {
    return this.data(
      this.groups.applyBulkAdd(
        organizationId,
        groupId,
        previewId,
        request.user,
        input,
        requestId,
      ),
    )
  }

  @Get('groups/:groupId/roster-bulk/:previewId')
  bulkAddResult(
    @Param('organizationId') organizationId: string,
    @Param('groupId') groupId: string,
    @Param('previewId') previewId: string,
    @Request() request,
  ) {
    return this.data(
      this.groups.bulkAddResult(
        organizationId,
        groupId,
        previewId,
        request.user,
      ),
    )
  }

  @Delete('groups/:groupId/roster/:membershipId')
  removePerson(
    @Param('organizationId') organizationId: string,
    @Param('groupId') groupId: string,
    @Param('membershipId') membershipId: string,
    @Request() request,
    @Body() input: unknown,
    @Headers('x-request-id') requestId?: string,
  ) {
    return this.data(
      this.groups.removePerson(
        organizationId,
        groupId,
        membershipId,
        request.user,
        input,
        requestId,
      ),
    )
  }

  private async data(value: Promise<unknown>) {
    return { data: await value }
  }
}
