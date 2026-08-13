import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import mongoose, { HydratedDocument, Types } from 'mongoose'
import { Organization } from '../../organizations/schemas/organization.schema'
import { SuppressionStatus } from '../consent.enums'

export type OrganizationSuppressionDocument =
  HydratedDocument<OrganizationSuppression>

@Schema({ timestamps: true })
export class OrganizationSuppression {
  _id?: Types.ObjectId

  @Prop({
    type: mongoose.Schema.Types.ObjectId,
    ref: Organization.name,
    required: true,
    immutable: true,
  })
  organizationId: Types.ObjectId

  @Prop({ type: String, required: true, immutable: true })
  mobileNumber: string

  @Prop({ type: String, enum: SuppressionStatus, required: true })
  status: SuppressionStatus

  @Prop({ type: Date, required: true })
  suppressedAt: Date

  @Prop({ type: mongoose.Schema.Types.ObjectId })
  suppressedByInboundSmsId: Types.ObjectId

  @Prop({ type: Date })
  endedAt?: Date

  @Prop({ type: mongoose.Schema.Types.ObjectId })
  endedByInboundSmsId?: Types.ObjectId
}

export const OrganizationSuppressionSchema = SchemaFactory.createForClass(
  OrganizationSuppression,
)
OrganizationSuppressionSchema.index(
  { organizationId: 1, mobileNumber: 1 },
  { unique: true },
)
OrganizationSuppressionSchema.index({ mobileNumber: 1, status: 1 })
