import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import mongoose, { HydratedDocument, Types } from 'mongoose'
import { User } from '../../users/schemas/user.schema'
import { MembershipStatus } from '../organization.enums'
import { Organization } from './organization.schema'

export type OperatorMembershipDocument = HydratedDocument<OperatorMembership>

@Schema({ timestamps: { createdAt: true, updatedAt: false } })
export class OperatorMembership {
  _id?: Types.ObjectId

  @Prop({
    type: mongoose.Schema.Types.ObjectId,
    ref: Organization.name,
    required: true,
    immutable: true,
  })
  organizationId: Types.ObjectId

  @Prop({
    type: mongoose.Schema.Types.ObjectId,
    ref: User.name,
    required: true,
    immutable: true,
  })
  userId: Types.ObjectId

  @Prop({ type: String, enum: MembershipStatus, required: true })
  status: MembershipStatus

  @Prop({
    type: mongoose.Schema.Types.ObjectId,
    ref: User.name,
    required: true,
    immutable: true,
  })
  createdBy: Types.ObjectId

  @Prop({ type: Date, required: true })
  activatedAt: Date

  @Prop({ type: Date })
  suspendedAt?: Date

  @Prop({ type: Date })
  revokedAt?: Date

  @Prop({ type: Date, required: true, default: Date.now })
  changedAt: Date

  @Prop({
    type: mongoose.Schema.Types.ObjectId,
    ref: User.name,
    required: true,
  })
  changedBy: Types.ObjectId

  @Prop({ type: String, maxlength: 500 })
  reason?: string

  createdAt?: Date
}

export const OperatorMembershipSchema =
  SchemaFactory.createForClass(OperatorMembership)
OperatorMembershipSchema.index(
  { organizationId: 1, userId: 1 },
  { unique: true },
)
OperatorMembershipSchema.index({ organizationId: 1, status: 1, changedAt: -1 })
