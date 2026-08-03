import {
  CanActivate,
  ExecutionContext,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { OrganizationPolicyService } from './organization-policy.service'

@Injectable()
export class OrganizationAdminGuard implements CanActivate {
  constructor(private readonly organizationPolicy: OrganizationPolicyService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest()
    const userId = String(request.user?._id ?? request.user?.id ?? '')
    const membership = request.apiKey
      ? null
      : await this.organizationPolicy.activeAdminMembership(
          request.params.organizationId,
          userId,
        )
    if (!membership) {
      throw new NotFoundException({ error: 'Organization not found' })
    }
    request.organizationMembership = membership
    return true
  }
}
