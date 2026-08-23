import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import mongoose, { Types } from 'mongoose'
import { Organization } from '../../organizations/schemas/organization.schema'
import { User } from '../../users/schemas/user.schema'

@Schema({ timestamps: { createdAt: true, updatedAt: false } })
export class CommunicationAuditEvent {
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
  targetId: string

  @Prop({ type: Object, required: true, immutable: true })
  details: Record<string, unknown>

  @Prop({ type: String })
  correlationId?: string

  createdAt?: Date
}

export const CommunicationAuditEventSchema = SchemaFactory.createForClass(
  CommunicationAuditEvent,
)
CommunicationAuditEventSchema.index({ organizationId: 1, createdAt: -1 })
