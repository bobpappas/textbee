import {
  CanActivate,
  ExecutionContext,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { OrganizationPolicyService } from './organization-policy.service'

@Injectable()
export class OrganizationOperationalGuard implements CanActivate {
  constructor(private readonly policy: OrganizationPolicyService) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest()
    if (request.apiKey)
      throw new NotFoundException({ error: 'Resource not found' })
    const userId = String(request.user?._id ?? request.user?.id ?? '')
    const organizationId = await this.policy.soleAdminOrganizationId(userId)
    if (!organizationId)
      throw new NotFoundException({ error: 'Resource not found' })
    request.organizationId = organizationId
    return true
  }
}
