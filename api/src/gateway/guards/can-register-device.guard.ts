import {
  CanActivate,
  ExecutionContext,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { OrganizationPolicyService } from '../../organizations/organization-policy.service'

@Injectable()
export class CanRegisterDevice implements CanActivate {
  constructor(private readonly policy: OrganizationPolicyService) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest()
    if (request.apiKey) {
      const scopes = request.apiKey.scopes ?? []
      if (
        request.apiKey.organizationId &&
        request.apiKey.purpose === 'GATEWAY' &&
        scopes.includes('gateway:operate')
      ) {
        request.organizationId = String(request.apiKey.organizationId)
        return true
      }
      throw new NotFoundException({ error: 'Resource not found' })
    }
    const userId = String(request.user?._id ?? request.user?.id ?? '')
    const organizationId = await this.policy.soleAdminOrganizationId(userId)
    if (!organizationId)
      throw new NotFoundException({ error: 'Resource not found' })
    request.organizationId = organizationId
    return true
  }
}
