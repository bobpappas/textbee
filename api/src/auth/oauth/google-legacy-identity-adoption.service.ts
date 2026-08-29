import { Injectable } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model } from 'mongoose'
import { UserDocument } from '../../users/schemas/user.schema'
import { VerifiedOAuthIdentity } from './oauth-provider.types'
import {
  OAuthIdentityBinding,
  OAuthIdentityBindingDocument,
} from './schemas/oauth-identity-binding.schema'

@Injectable()
export class GoogleLegacyIdentityAdoptionService {
  constructor(
    @InjectModel(OAuthIdentityBinding.name)
    private readonly bindings: Model<OAuthIdentityBindingDocument>,
  ) {}

  async canAdopt(identity: VerifiedOAuthIdentity, user: UserDocument) {
    if (
      identity.providerKey !== 'google' ||
      (user.googleId && user.googleId !== identity.subject)
    ) {
      return false
    }
    return !(await this.bindings.exists({ userId: user._id }))
  }
}
