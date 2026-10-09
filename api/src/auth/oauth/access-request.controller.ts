import { OnboardingSessionGuard } from './onboarding-session.guard'
import { createHash } from 'crypto'
import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Request,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common'
import { Throttle } from '@nestjs/throttler'
import { AuthGuard } from '../guards/auth.guard'
import { AccessRequestService } from './access-request.service'
import { parseAdmissionDecision } from './access-request.dto'

@Controller('auth/access-requests')
export class AccessRequestController {
  constructor(private readonly requests: AccessRequestService) {}
  @Get('status')
  @UseGuards(OnboardingSessionGuard)
  @Throttle({
    default: {
      limit: 30,
      ttl: 60000,
      getTracker: (req) =>
        createHash('sha256')
          .update(String(req.headers.authorization || req.ip))
          .digest('hex'),
    },
  })
  status(@Request() req) {
    return this.requests.status(this.bearer(req)).then((data) => ({ data }))
  }
  @Get()
  @UseGuards(AuthGuard)
  async list(@Request() req, @Query('page') page?: string) {
    this.bearer(req)
    return { data: await this.requests.list(req.user, page ? Number(page) : 1) }
  }
  @Get('options')
  @UseGuards(AuthGuard)
  async options(
    @Request() req,
    @Query('organizationId') organizationId?: string,
  ) {
    this.bearer(req)
    return { data: await this.requests.options(req.user, organizationId) }
  }
  @Post(':id/decision')
  @UseGuards(AuthGuard)
  @Throttle({
    default: {
      limit: 30,
      ttl: 60000,
      getTracker: (req) => req.ip || req.socket?.remoteAddress || 'unknown',
    },
  })
  async decide(
    @Request() req,
    @Param('id') id: string,
    @Body() input: unknown,
  ) {
    this.bearer(req)
    return {
      data: await this.requests.decide(
        req.user,
        id,
        parseAdmissionDecision(input),
      ),
    }
  }
  private bearer(req: any) {
    if (!req.headers.authorization?.startsWith('Bearer ') || req.apiKey)
      throw new UnauthorizedException()
    return req.headers.authorization.slice(7)
  }
}
