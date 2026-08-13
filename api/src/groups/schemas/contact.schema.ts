import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import mongoose, { HydratedDocument, Types } from 'mongoose'
import { Organization } from '../../organizations/schemas/organization.schema'
import { User } from '../../users/schemas/user.schema'

export type ContactDocument = HydratedDocument<Contact>

@Schema({ timestamps: true })
export class Contact {
  _id?: Types.ObjectId

  @Prop({
    type: mongoose.Schema.Types.ObjectId,
    ref: Organization.name,
    required: true,
    immutable: true,
  })
  organizationId: Types.ObjectId

  @Prop({
    type: String,
    required: true,
    trim: true,
    minlength: 1,
    maxlength: 100,
  })
  displayName: string

  @Prop({ type: String, required: true, immutable: true })
  mobileNumber: string

  @Prop({
    type: mongoose.Schema.Types.ObjectId,
    ref: User.name,
    immutable: true,
  })
  createdBy?: Types.ObjectId

  @Prop({ type: mongoose.Schema.Types.ObjectId, immutable: true })
  createdByInboundSmsId?: Types.ObjectId

  createdAt?: Date
  updatedAt?: Date
}

export const ContactSchema = SchemaFactory.createForClass(Contact)
ContactSchema.index({ organizationId: 1, mobileNumber: 1 }, { unique: true })
