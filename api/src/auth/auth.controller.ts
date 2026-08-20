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
import {
  LoginInputDTO,
  RegisterInputDTO,
  RequestResetPasswordInputDTO,
  ResetPasswordInputDTO,
  UpdateOnboardingDTO,
} from './auth.dto'
import { AuthGuard } from './guards/auth.guard'
import { AuthService } from './auth.service'
import { UsersService } from '../users/users.service'
import { CanModifyApiKey } from './guards/can-modify-api-key.guard'
import { OrganizationOperationalGuard } from '../organizations/organization-operational.guard'

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private authService: AuthService,
    private usersService: UsersService,
  ) {}

  @ApiOperation({ summary: 'Login' })
  @HttpCode(HttpStatus.OK)
  @Post('/login')
  async login(@Body() input: LoginInputDTO) {
    const data = await this.authService.login(input)
    return { data }
  }

  @ApiOperation({ summary: 'Login With Google' })
  @HttpCode(HttpStatus.OK)
  @Post('/google-login')
  async googleLogin(@Body() input: any) {
    const data = await this.authService.loginWithGoogle(input.idToken)
    return { data }
  }

  @ApiOperation({ summary: 'Register' })
  @Post('/register')
  async register(@Body() input: RegisterInputDTO) {
    const data = await this.authService.register(input)
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

  @ApiOperation({ summary: 'Change Password' })
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  @Post('/change-password')
  async changePassword(
    @Body() input: { oldPassword: string; newPassword: string },
    @Request() req,
  ) {
    return await this.authService.changePassword(input, req.user)
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

  @ApiOperation({ summary: 'Request Password Reset' })
  @HttpCode(HttpStatus.OK)
  @Post('/request-password-reset')
  async requestPasswordReset(@Body() input: RequestResetPasswordInputDTO) {
    return await this.authService.requestResetPassword(input)
  }

  @ApiOperation({ summary: 'Reset Password' })
  @HttpCode(HttpStatus.OK)
  @Post('/reset-password')
  async resetPassword(@Body() input: ResetPasswordInputDTO) {
    return await this.authService.resetPassword(input)
  }

  // send email verification code
  @ApiOperation({ summary: 'Send Email Verification Code' })
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  @Post('/send-email-verification-email')
  async sendEmailVerificationEmail(@Request() req) {
    return await this.authService.sendEmailVerificationEmail(req.user)
  }

  @ApiOperation({ summary: 'Verify Email' })
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @Post('/verify-email')
  async verifyEmail(
    @Body() input: { userId: string; verificationCode: string },
  ) {
    return await this.authService.verifyEmail(input)
  }
}
