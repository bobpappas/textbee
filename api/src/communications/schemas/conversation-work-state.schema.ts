import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import mongoose, { Types } from 'mongoose'
import { Organization } from '../../organizations/schemas/organization.schema'
import { OperatorMembership } from '../../organizations/schemas/operator-membership.schema'
import { User } from '../../users/schemas/user.schema'
import { Group } from '../../groups/schemas/group.schema'
import { Conversation } from './conversation.schema'

@Schema({ timestamps: true })
export class ConversationWorkState {
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
    ref: Conversation.name,
    required: true,
    immutable: true,
  })
  conversationId: Types.ObjectId

  @Prop({
    type: mongoose.Schema.Types.ObjectId,
    ref: Group.name,
    required: true,
    immutable: true,
  })
  groupId: Types.ObjectId

  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: OperatorMembership.name })
  assigneeMembershipId?: Types.ObjectId

  @Prop({ type: Boolean, required: true, default: false })
  resolved: boolean

  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: User.name })
  resolvedBy?: Types.ObjectId

  @Prop({ type: Date })
  resolvedAt?: Date

  @Prop({ type: Number, required: true, default: 1 })
  version: number
}

export const ConversationWorkStateSchema = SchemaFactory.createForClass(
  ConversationWorkState,
)
ConversationWorkStateSchema.index(
  { organizationId: 1, conversationId: 1, groupId: 1 },
  { unique: true },
)
ConversationWorkStateSchema.index({
  organizationId: 1,
  groupId: 1,
  resolved: 1,
  updatedAt: -1,
})
