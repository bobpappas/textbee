import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { UsersService } from '../../users/users.service'
import { AuthService } from '../auth.service'
import * as bcrypt from 'bcryptjs'
import { OAuthSessionAuthorizationService } from '../oauth/oauth-session-authorization.service'

@Injectable()
// Guard for authenticating users by either jwt token or api key
export class AuthGuard implements CanActivate {
  constructor(
    private jwtService: JwtService,
    private usersService: UsersService,
    private authService: AuthService,
    private oauthSessions: OAuthSessionAuthorizationService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest()
    let userId
    let bearerPayload: any
    const apiKeyString = request.headers['x-api-key'] || request.query.apiKey
    if (request.headers.authorization?.startsWith('Bearer ')) {
      const bearerToken = request.headers.authorization.split(' ')[1]
      try {
        bearerPayload = this.jwtService.verify(bearerToken)
        userId = bearerPayload.sub
      } catch {
        throw new HttpException(
          { error: 'Unauthorized' },
          HttpStatus.UNAUTHORIZED,
        )
      }
    } else if (apiKeyString) {
      const apiKey =
        await this.authService.findActiveApiKeyByClientKey(apiKeyString)

      if (apiKey && bcrypt.compareSync(apiKeyString, apiKey.hashedApiKey)) {
        userId = apiKey.user
        request.apiKey = apiKey
      }
    }

    if (userId) {
      const user = await this.usersService.findOne({ _id: userId })
      const currentSession =
        !bearerPayload ||
        (await this.oauthSessions.isCurrent(bearerPayload, user?._id))
      if (user && !user.isBanned && currentSession) {
        request.user = user
        this.authService.trackAccessLog({ request })
        return true
      }
    }

    throw new HttpException({ error: 'Unauthorized' }, HttpStatus.UNAUTHORIZED)
  }
}
