import { IsIn, IsNotEmpty, IsString } from 'class-validator'

export class OAuthLoginDTO {
  @IsString()
  @IsIn(['google'])
  provider: 'google'

  @IsString()
  @IsNotEmpty()
  idToken: string
}
