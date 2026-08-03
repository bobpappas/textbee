import { ApiProperty } from '@nestjs/swagger'

export class OrganizationNameDto {
  @ApiProperty({
    minLength: 2,
    maxLength: 100,
    example: 'Boise Church of Christ',
  })
  displayName: string
}
