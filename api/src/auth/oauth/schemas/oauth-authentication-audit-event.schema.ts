import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document, Types } from 'mongoose'
import { User } from '../../../users/schemas/user.schema'
import {
  OAuthAuthenticationAuditAction,
  OAuthAuthenticationAuditOutcome,
} from '../oauth-authentication.enums'
import { OAuthApproval } from './oauth-approval.schema'

export type OAuthAuthenticationAuditEventDocument =
  OAuthAuthenticationAuditEvent & Document

@Schema({ timestamps: true })
export class OAuthAuthenticationAuditEvent {
  _id?: Types.ObjectId

  @Prop({ type: String, required: true, lowercase: true, trim: true })
  providerKey: string

  @Prop({ type: Types.ObjectId, ref: OAuthApproval.name })
  approvalId?: Types.ObjectId

  @Prop({ type: Types.ObjectId, ref: User.name })
  userId?: Types.ObjectId

  @Prop({
    type: String,
    required: true,
    enum: Object.values(OAuthAuthenticationAuditAction),
  })
  action: OAuthAuthenticationAuditAction

  @Prop({
    type: String,
    required: true,
    enum: Object.values(OAuthAuthenticationAuditOutcome),
  })
  outcome: OAuthAuthenticationAuditOutcome

  @Prop({ type: Object, required: true, default: {} })
  verificationMetadata: Record<string, string | number | boolean>

  @Prop({ type: Date, required: true })
  occurredAt: Date
}

export const OAuthAuthenticationAuditEventSchema = SchemaFactory.createForClass(
  OAuthAuthenticationAuditEvent,
)
OAuthAuthenticationAuditEventSchema.index({ providerKey: 1, occurredAt: -1 })
