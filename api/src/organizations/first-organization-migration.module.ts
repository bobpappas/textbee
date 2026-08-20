import { Module } from '@nestjs/common'
import { MongooseModule } from '@nestjs/mongoose'
import { OrganizationsModule } from './organizations.module'

@Module({
  imports: [MongooseModule.forRoot(process.env.MONGO_URI), OrganizationsModule],
})
export class FirstOrganizationMigrationModule {}
