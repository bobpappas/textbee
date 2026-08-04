import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import mongoose, { Types } from 'mongoose'
import { Organization } from '../../organizations/schemas/organization.schema'
import { User } from '../../users/schemas/user.schema'

@Schema({ timestamps: { createdAt: true, updatedAt: false } })
export class GroupAuditEvent {
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
  actorUserId: Types.ObjectId

  @Prop({ type: String, required: true, immutable: true })
  action: string

  @Prop({ type: String, required: true, immutable: true })
  targetType: string

  @Prop({ type: String, required: true, immutable: true })
  targetId: string

  @Prop({ type: String, immutable: true })
  priorState?: string

  @Prop({ type: String, immutable: true })
  newState?: string

  @Prop({ type: String, immutable: true })
  reason?: string

  @Prop({ type: String, required: true, immutable: true })
  correlationId: string

  createdAt?: Date
}

export const GroupAuditEventSchema =
  SchemaFactory.createForClass(GroupAuditEvent)
GroupAuditEventSchema.index({ organizationId: 1, createdAt: -1 })
GroupAuditEventSchema.index(
  { organizationId: 1, correlationId: 1, action: 1, targetId: 1 },
  { unique: true },
)
