import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common'
import mongoose from 'mongoose'
import { OrganizationPolicyService } from '../../organizations/organization-policy.service'
import { GatewayService } from '../gateway.service'

@Injectable()
export class CanModifyDevice implements CanActivate {
  constructor(
    private gatewayService: GatewayService,
    private readonly organizationPolicy?: OrganizationPolicyService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest()

    const deviceId = request.params.id
    const userId = String(request.user?._id ?? request.user?.id ?? '')

    const isValidId = mongoose.Types.ObjectId.isValid(deviceId)
    if (!isValidId) {
      throw new HttpException(
        { error: 'Invalid device id' },
        HttpStatus.BAD_REQUEST,
      )
    }

    const device = await this.gatewayService.getDeviceById(deviceId)
    const organizationId = String(device?.organizationId ?? '')
    const apiKeyOrganizationId = String(request.apiKey?.organizationId ?? '')
    const apiKeyScopes = request.apiKey?.scopes ?? []
    const gatewayKeyAllowed =
      Boolean(request.apiKey) &&
      organizationId &&
      organizationId === apiKeyOrganizationId &&
      request.apiKey?.purpose === 'GATEWAY' &&
      apiKeyScopes.includes('gateway:operate')
    const humanAllowed =
      !request.apiKey &&
      (organizationId
        ? Boolean(
            await this.organizationPolicy?.activeAdminMembership(
              organizationId,
              userId,
            ),
          )
        : String(device?.user) === userId)
    if (gatewayKeyAllowed || humanAllowed) {
      request.organizationId = organizationId
      request.device = device
      return true
    }

    throw new HttpException(
      { error: 'Resource not found' },
      HttpStatus.NOT_FOUND,
    )
  }
}
