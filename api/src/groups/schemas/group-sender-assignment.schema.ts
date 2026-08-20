import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import mongoose, { HydratedDocument, Types } from 'mongoose'
import { OperatorMembership } from '../../organizations/schemas/operator-membership.schema'
import { Organization } from '../../organizations/schemas/organization.schema'
import { User } from '../../users/schemas/user.schema'
import { GroupSenderStatus } from '../group.enums'
import { Group } from './group.schema'

export type GroupSenderAssignmentDocument =
  HydratedDocument<GroupSenderAssignment>

@Schema({ timestamps: true })
export class GroupSenderAssignment {
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

  @Prop({ type: String, enum: GroupSenderStatus, required: true })
  status: GroupSenderStatus

  @Prop({
    type: mongoose.Schema.Types.ObjectId,
    ref: User.name,
    required: true,
  })
  changedBy: Types.ObjectId

  @Prop({ type: String, maxlength: 500 })
  reason?: string

  @Prop({ type: Date, required: true })
  changedAt: Date
}

export const GroupSenderAssignmentSchema = SchemaFactory.createForClass(
  GroupSenderAssignment,
)
GroupSenderAssignmentSchema.index(
  { organizationId: 1, groupId: 1, membershipId: 1 },
  { unique: true },
)
GroupSenderAssignmentSchema.index({
  organizationId: 1,
  membershipId: 1,
  status: 1,
})
