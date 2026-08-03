import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common'
import {
  PLATFORM_ORGANIZATIONS_MANAGE,
  PlatformPolicyService,
} from './platform-policy.service'

@Injectable()
export class PlatformAdminGuard implements CanActivate {
  constructor(private readonly platformPolicy: PlatformPolicyService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest()
    if (
      this.platformPolicy.hasCapability(
        request.user,
        PLATFORM_ORGANIZATIONS_MANAGE,
        Boolean(request.apiKey),
      )
    ) {
      return true
    }
    throw new ForbiddenException({ error: 'Forbidden' })
  }
}
