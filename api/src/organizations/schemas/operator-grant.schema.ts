import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import mongoose, { HydratedDocument, Types } from 'mongoose'
import { User } from '../../users/schemas/user.schema'
import { GrantStatus, OrganizationRole } from '../organization.enums'
import { OperatorMembership } from './operator-membership.schema'
import { Organization } from './organization.schema'

export type OperatorGrantDocument = HydratedDocument<OperatorGrant>

@Schema({ timestamps: { createdAt: true, updatedAt: false } })
export class OperatorGrant {
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
    ref: OperatorMembership.name,
    required: true,
    immutable: true,
  })
  membershipId: Types.ObjectId

  @Prop({
    type: String,
    enum: OrganizationRole,
    required: true,
    immutable: true,
  })
  role: OrganizationRole

  @Prop({ type: String, enum: GrantStatus, required: true })
  status: GrantStatus

  @Prop({
    type: mongoose.Schema.Types.ObjectId,
    ref: User.name,
    required: true,
    immutable: true,
  })
  grantedBy: Types.ObjectId

  @Prop({ type: Date, required: true })
  grantedAt: Date

  createdAt?: Date
}

export const OperatorGrantSchema = SchemaFactory.createForClass(OperatorGrant)
OperatorGrantSchema.index(
  { organizationId: 1, membershipId: 1, role: 1 },
  { unique: true },
)
