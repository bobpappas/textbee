import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import mongoose, { HydratedDocument, Types } from 'mongoose'
import { Organization } from '../../organizations/schemas/organization.schema'
import { User } from '../../users/schemas/user.schema'

export type ConsentAuditEventDocument = HydratedDocument<ConsentAuditEvent>

@Schema({ timestamps: { createdAt: true, updatedAt: false } })
export class ConsentAuditEvent {
  _id?: Types.ObjectId

  @Prop({
    type: mongoose.Schema.Types.ObjectId,
    ref: Organization.name,
    required: true,
    immutable: true,
  })
  organizationId: Types.ObjectId

  @Prop({ type: String, required: true, immutable: true })
  action: string

  @Prop({ type: String, required: true, immutable: true })
  result: string

  @Prop({ type: String, required: true, immutable: true })
  redactedNumber: string

  @Prop({ type: String, immutable: true })
  receivingNumber?: string

  @Prop({
    type: mongoose.Schema.Types.ObjectId,
    ref: User.name,
    immutable: true,
  })
  actorUserId?: Types.ObjectId

  @Prop({ type: mongoose.Schema.Types.ObjectId, immutable: true })
  contactId?: Types.ObjectId

  @Prop({ type: mongoose.Schema.Types.ObjectId, immutable: true })
  groupId?: Types.ObjectId

  @Prop({ type: mongoose.Schema.Types.ObjectId, immutable: true })
  inboundSmsId?: Types.ObjectId

  @Prop({ type: Number, immutable: true })
  affectedConsentCount?: number

  @Prop({ type: Number, immutable: true })
  sourceRow?: number

  @Prop({ type: String, immutable: true })
  acknowledgmentOutcome?: string

  createdAt?: Date
}

export const ConsentAuditEventSchema =
  SchemaFactory.createForClass(ConsentAuditEvent)
ConsentAuditEventSchema.index(
  { organizationId: 1, action: 1, inboundSmsId: 1 },
  {
    name: 'consent_audit_inbound_idempotency_v2',
    unique: true,
    partialFilterExpression: { inboundSmsId: { $exists: true } },
  },
)
ConsentAuditEventSchema.index({ organizationId: 1, createdAt: -1 })
