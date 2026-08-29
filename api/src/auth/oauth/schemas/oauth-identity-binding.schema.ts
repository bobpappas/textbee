import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document, Types } from 'mongoose'
import { User } from '../../../users/schemas/user.schema'
import { OAuthApproval } from './oauth-approval.schema'

export type OAuthIdentityBindingDocument = OAuthIdentityBinding & Document

@Schema({ timestamps: true })
export class OAuthIdentityBinding {
  _id?: Types.ObjectId

  @Prop({
    type: String,
    required: true,
    lowercase: true,
    trim: true,
    immutable: true,
  })
  providerKey: string

  @Prop({ type: String, required: true, immutable: true })
  providerSubject: string

  @Prop({
    type: Types.ObjectId,
    ref: OAuthApproval.name,
    required: true,
    immutable: true,
  })
  approvalId: Types.ObjectId

  @Prop({
    type: Types.ObjectId,
    ref: User.name,
    required: true,
    immutable: true,
  })
  userId: Types.ObjectId

  @Prop({ type: Date, required: true, immutable: true })
  boundAt: Date
}

export const OAuthIdentityBindingSchema =
  SchemaFactory.createForClass(OAuthIdentityBinding)
OAuthIdentityBindingSchema.index(
  { providerKey: 1, providerSubject: 1 },
  { unique: true },
)
OAuthIdentityBindingSchema.index({ approvalId: 1 }, { unique: true })
OAuthIdentityBindingSchema.index({ userId: 1 }, { unique: true })
