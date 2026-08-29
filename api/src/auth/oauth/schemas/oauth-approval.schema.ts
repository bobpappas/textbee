import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document, Types } from 'mongoose'
import { UserRole } from '../../../users/user-roles.enum'
import { User } from '../../../users/schemas/user.schema'
import { OAuthApprovalState } from '../oauth-authentication.enums'

export type OAuthApprovalDocument = OAuthApproval & Document

@Schema({ timestamps: true })
export class OAuthApproval {
  _id?: Types.ObjectId

  @Prop({
    type: String,
    required: true,
    lowercase: true,
    trim: true,
    immutable: true,
  })
  providerKey: string

  @Prop({
    type: String,
    required: true,
    lowercase: true,
    trim: true,
    immutable: true,
  })
  normalizedEmail: string

  @Prop({ type: String, required: true, enum: Object.values(UserRole) })
  role: UserRole

  @Prop({
    type: String,
    required: true,
    enum: Object.values(OAuthApprovalState),
  })
  state: OAuthApprovalState

  @Prop({ type: String })
  boundSubject?: string

  @Prop({ type: Types.ObjectId, ref: User.name })
  userId?: Types.ObjectId

  @Prop({ type: Number, required: true, default: 1, min: 1 })
  authorizationRevision: number

  @Prop({ type: Date, required: true })
  approvedAt: Date

  @Prop({ type: Date })
  boundAt?: Date

  @Prop({ type: Date })
  roleChangedAt?: Date

  @Prop({ type: Date })
  revokedAt?: Date

  @Prop({ type: String, required: true })
  actorKind: string

  @Prop({ type: Types.ObjectId, ref: User.name })
  actorUserId?: Types.ObjectId

  @Prop({ type: String, required: true })
  reason: string

  @Prop({ type: [Types.ObjectId], default: [] })
  auditEventIds: Types.ObjectId[]
}

export const OAuthApprovalSchema = SchemaFactory.createForClass(OAuthApproval)
OAuthApprovalSchema.index(
  { providerKey: 1, normalizedEmail: 1 },
  { unique: true },
)
OAuthApprovalSchema.index(
  { providerKey: 1, boundSubject: 1 },
  {
    unique: true,
    partialFilterExpression: { boundSubject: { $type: 'string' } },
  },
)
