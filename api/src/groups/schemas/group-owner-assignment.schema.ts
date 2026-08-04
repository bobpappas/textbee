import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import mongoose, { HydratedDocument, Types } from 'mongoose'
import { Organization } from '../../organizations/schemas/organization.schema'
import { OperatorMembership } from '../../organizations/schemas/operator-membership.schema'
import { User } from '../../users/schemas/user.schema'
import { GroupOwnerStatus } from '../group.enums'
import { Group } from './group.schema'

export type GroupOwnerAssignmentDocument =
  HydratedDocument<GroupOwnerAssignment>

@Schema({ timestamps: true })
export class GroupOwnerAssignment {
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
    ref: Group.name,
    required: true,
    immutable: true,
  })
  groupId: Types.ObjectId

  @Prop({
    type: mongoose.Schema.Types.ObjectId,
    ref: OperatorMembership.name,
    required: true,
    immutable: true,
  })
  membershipId: Types.ObjectId

  @Prop({ type: String, enum: GroupOwnerStatus, required: true })
  status: GroupOwnerStatus

  @Prop({
    type: mongoose.Schema.Types.ObjectId,
    ref: User.name,
    required: true,
  })
  changedBy: Types.ObjectId

  @Prop({ type: String })
  reason?: string

  @Prop({ type: Date, required: true })
  changedAt: Date
}

export const GroupOwnerAssignmentSchema =
  SchemaFactory.createForClass(GroupOwnerAssignment)
GroupOwnerAssignmentSchema.index(
  { organizationId: 1, groupId: 1, membershipId: 1 },
  { unique: true },
)
GroupOwnerAssignmentSchema.index({
  organizationId: 1,
  membershipId: 1,
  status: 1,
})
