import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import mongoose, { HydratedDocument, Types } from 'mongoose'
import { User } from '../../users/schemas/user.schema'
import { AuditOutcome, OrganizationAuditAction } from '../organization.enums'
import { Organization } from './organization.schema'

export type AuthorizationAuditEventDocument =
  HydratedDocument<AuthorizationAuditEvent>

@Schema({ timestamps: { createdAt: true, updatedAt: false } })
export class AuthorizationAuditEvent {
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

  @Prop({
    type: String,
    enum: OrganizationAuditAction,
    required: true,
    immutable: true,
  })
  action: OrganizationAuditAction

  @Prop({ type: String, enum: AuditOutcome, required: true, immutable: true })
  outcome: AuditOutcome

  @Prop({ type: String, required: true, immutable: true })
  targetType: string

  @Prop({ type: String, required: true, immutable: true })
  targetId: string

  @Prop({ type: String, immutable: true })
  oldDisplayValue?: string

  @Prop({ type: String, immutable: true })
  newDisplayValue?: string

  @Prop({ type: String, required: true, immutable: true })
  correlationId: string

  @Prop({ type: String, required: true, immutable: true })
  operationKey: string

  createdAt?: Date
}

export const AuthorizationAuditEventSchema = SchemaFactory.createForClass(
  AuthorizationAuditEvent,
)
AuthorizationAuditEventSchema.index(
  { organizationId: 1, action: 1, operationKey: 1 },
  { unique: true },
)
