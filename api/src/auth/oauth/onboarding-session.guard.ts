import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common'
import { AccessRequestService } from './access-request.service'

@Injectable()
export class OnboardingSessionGuard implements CanActivate {
  constructor(private readonly requests: AccessRequestService) {}
  canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest()
    const authorization = req.headers.authorization
    if (!authorization?.startsWith('Bearer ')) throw new UnauthorizedException()
    this.requests.applicantId(authorization.slice(7))
    return true
  }
}
