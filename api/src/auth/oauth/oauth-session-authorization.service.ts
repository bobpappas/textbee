import { Injectable } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model } from 'mongoose'
import { OAuthApprovalState } from './oauth-authentication.enums'
import {
  OAuthApproval,
  OAuthApprovalDocument,
} from './schemas/oauth-approval.schema'

export type OAuthSessionClaims = {
  sub?: unknown
  oauthProvider?: unknown
  authorizationRevision?: unknown
}

@Injectable()
export class OAuthSessionAuthorizationService {
  constructor(
    @InjectModel(OAuthApproval.name)
    private readonly approvals: Model<OAuthApprovalDocument>,
  ) {}

  async isCurrent(claims: OAuthSessionClaims, userId: unknown) {
    if (
      typeof claims.oauthProvider !== 'string' ||
      typeof claims.authorizationRevision !== 'number' ||
      claims.authorizationRevision < 1 ||
      String(claims.sub) !== String(userId)
    ) {
      return false
    }

    return Boolean(
      await this.approvals.exists({
        providerKey: claims.oauthProvider,
        userId,
        state: OAuthApprovalState.BOUND,
        authorizationRevision: claims.authorizationRevision,
      }),
    )
  }
}
