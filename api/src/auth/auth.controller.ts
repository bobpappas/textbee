import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger'
import { UpdateOnboardingDTO } from './auth.dto'
import { AuthGuard } from './guards/auth.guard'
import { AuthService } from './auth.service'
import { UsersService } from '../users/users.service'
import { CanModifyApiKey } from './guards/can-modify-api-key.guard'
import { OrganizationOperationalGuard } from '../organizations/organization-operational.guard'
import { OAuthProviderRegistry } from './oauth/oauth-provider.registry'
import { OAuthAuthenticationOrchestrator } from './oauth/oauth-authentication.orchestrator'
import { OAuthLoginDTO } from './oauth/oauth-login.dto'

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private authService: AuthService,
    private usersService: UsersService,
    private oauthProviders: OAuthProviderRegistry,
    private oauthAuthentication: OAuthAuthenticationOrchestrator,
  ) {}

  @ApiOperation({ summary: 'Approval-gated OAuth login' })
  @HttpCode(HttpStatus.OK)
  @Post('/oauth-login')
  async oauthLogin(@Body() input: OAuthLoginDTO) {
    const identity = await this.oauthProviders.verify(
      input.provider,
      input.idToken,
    )
    const data = await this.oauthAuthentication.authenticate(identity)
    return { data }
  }

  @ApiOperation({ summary: 'Get current logged in user' })
  @ApiBearerAuth()
  @UseGuards(AuthGuard, OrganizationOperationalGuard)
  @Get('/who-am-i')
  async whoAmI(@Request() req) {
    return { data: req.user }
  }

  @ApiOperation({ summary: 'Update Profile' })
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  @Patch('/update-profile')
  async updateProfile(
    @Body() input: { name: string; phone: string },
    @Request() req,
  ) {
    return await this.authService.updateProfile(input, req.user)
  }

  @UseGuards(AuthGuard)
  @ApiOperation({ summary: 'Generate Api Key' })
  @ApiBearerAuth()
  @Post('/api-keys')
  async generateApiKey(@Request() req) {
    const { apiKey, message } = await this.authService.generateApiKey(
      req.user,
      req.organizationId,
    )
    return { data: apiKey, message }
  }

  @UseGuards(AuthGuard, OrganizationOperationalGuard)
  @ApiOperation({ summary: 'Get Api Key List (masked***)' })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['active', 'revoked', 'all'],
    description:
      'Filter keys: active (default), revoked only, or all (legacy full list)',
  })
  @ApiBearerAuth()
  @Get('/api-keys')
  async getApiKey(@Request() req, @Query('status') status?: string) {
    const data = await this.authService.getOrganizationApiKeys(
      req.organizationId,
      status,
    )
    return { data }
  }

  @UseGuards(AuthGuard, CanModifyApiKey)
  @ApiOperation({ summary: 'Delete Api Key' })
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @Delete('/api-keys/:id')
  async deleteApiKey(@Param() params) {
    await this.authService.deleteApiKey(params.id)
    return { message: 'API Key Deleted' }
  }

  @UseGuards(AuthGuard, CanModifyApiKey)
  @ApiOperation({ summary: 'Revoke Api Key' })
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @Post('/api-keys/:id/revoke')
  async revokeApiKey(@Param() params, @Request() req) {
    await this.authService.revokeApiKey(params.id, req.user?._id)
    return { message: 'API Key Revoked' }
  }

  @UseGuards(AuthGuard, CanModifyApiKey)
  @ApiOperation({ summary: 'Rename Api Key' })
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @Patch('/api-keys/:id/rename')
  async renameApiKey(@Param() params, @Body() input: { name: string }) {
    await this.authService.renameApiKey(params.id, input.name)
    return { message: 'API Key Renamed' }
  }

  @ApiOperation({ summary: 'Update dashboard onboarding progress' })
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  @Patch('/onboarding')
  async updateOnboarding(@Body() input: UpdateOnboardingDTO, @Request() req) {
    const user = await this.usersService.updateOnboarding(input, req.user)
    return { data: user }
  }
}
