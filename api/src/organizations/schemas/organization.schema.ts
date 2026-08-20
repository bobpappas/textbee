import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import mongoose, { HydratedDocument, Types } from 'mongoose'
import { User } from '../../users/schemas/user.schema'
import { OrganizationStatus } from '../organization.enums'

export type OrganizationDocument = HydratedDocument<Organization>

@Schema({ timestamps: true })
export class Organization {
  _id?: Types.ObjectId

  @Prop({
    type: String,
    required: true,
    trim: true,
    minlength: 2,
    maxlength: 100,
  })
  displayName: string

  @Prop({ type: String, enum: OrganizationStatus, required: true })
  status: OrganizationStatus

  @Prop({
    type: mongoose.Schema.Types.ObjectId,
    ref: User.name,
    required: true,
    immutable: true,
  })
  createdBy: Types.ObjectId

  @Prop({ type: String, required: true, immutable: true, select: false })
  provisioningKey: string

  @Prop({ type: String, select: false })
  provisioningFailureCode?: string

  @Prop({ type: Date })
  activatedAt?: Date

  @Prop({ type: Number, default: 0, select: false })
  authorizationRevision?: number

  createdAt?: Date
  updatedAt?: Date
}

export const OrganizationSchema = SchemaFactory.createForClass(Organization)
OrganizationSchema.index({ createdBy: 1, provisioningKey: 1 }, { unique: true })
OrganizationSchema.index({ displayName: 1, _id: 1 })
