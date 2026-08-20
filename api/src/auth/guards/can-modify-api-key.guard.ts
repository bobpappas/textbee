import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common'
import mongoose from 'mongoose'
import { OrganizationPolicyService } from '../../organizations/organization-policy.service'
import { AuthService } from '../auth.service'

@Injectable()
export class CanModifyApiKey implements CanActivate {
  constructor(
    private authService: AuthService,
    private readonly organizationPolicy?: OrganizationPolicyService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest()

    const apiKeyId = request.params.id
    const userId = String(request.user?._id ?? request.user?.id ?? '')

    const isValidId = mongoose.Types.ObjectId.isValid(apiKeyId)
    if (!isValidId) {
      throw new HttpException({ error: 'Invalid id' }, HttpStatus.BAD_REQUEST)
    }

    const apiKey = await this.authService.findApiKeyById(apiKeyId)
    const organizationId = String(apiKey?.organizationId ?? '')
    const allowed = organizationId
      ? !request.apiKey &&
        Boolean(
          await this.organizationPolicy?.activeAdminMembership(
            organizationId,
            userId,
          ),
        )
      : String(apiKey?.user) === userId
    if (allowed) {
      request.organizationId = organizationId
      return true
    }

    throw new HttpException(
      { error: 'Resource not found' },
      HttpStatus.NOT_FOUND,
    )
  }
}
