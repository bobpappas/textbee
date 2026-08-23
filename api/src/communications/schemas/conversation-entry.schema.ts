import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import mongoose, { HydratedDocument, Types } from 'mongoose'
import { SMS } from '../../gateway/schemas/sms.schema'
import { Group } from '../../groups/schemas/group.schema'
import { GroupMessageDelivery } from '../../groups/schemas/group-message-delivery.schema'
import { GroupMessageSend } from '../../groups/schemas/group-message-send.schema'
import { Organization } from '../../organizations/schemas/organization.schema'
import { User } from '../../users/schemas/user.schema'
import {
  AttributionMethod,
  AttributionState,
  CommunicationDirection,
  CommunicationEntryKind,
} from '../communication.enums'
import { Conversation } from './conversation.schema'

export type ConversationEntryDocument = HydratedDocument<ConversationEntry>

@Schema({ timestamps: true })
export class ConversationEntry {
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
    ref: SMS.name,
    required: true,
    immutable: true,
  })
  smsId: Types.ObjectId

  @Prop({
    type: mongoose.Schema.Types.ObjectId,
    ref: GroupMessageSend.name,
    immutable: true,
  })
  groupSendId?: Types.ObjectId

  @Prop({
    type: mongoose.Schema.Types.ObjectId,
    ref: GroupMessageDelivery.name,
    immutable: true,
  })
  groupDeliveryId?: Types.ObjectId

  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: Group.name })
  groupId?: Types.ObjectId

  @Prop({ type: String })
  groupName?: string

  @Prop({
    type: mongoose.Schema.Types.ObjectId,
    ref: User.name,
    immutable: true,
  })
  actorUserId?: Types.ObjectId

  @Prop({
    type: String,
    enum: CommunicationDirection,
    required: true,
    immutable: true,
  })
  direction: CommunicationDirection

  @Prop({ type: String, enum: CommunicationEntryKind, required: true })
  kind: CommunicationEntryKind

  @Prop({ type: String, enum: AttributionState, required: true })
  attributionState: AttributionState

  @Prop({ type: String, enum: AttributionMethod, required: true })
  attributionMethod: AttributionMethod

  @Prop({
    type: [mongoose.Schema.Types.ObjectId],
    ref: Group.name,
    default: [],
  })
  candidateGroupIds: Types.ObjectId[]

  @Prop({
    type: mongoose.Schema.Types.ObjectId,
    ref: GroupMessageDelivery.name,
  })
  matchedDeliveryId?: Types.ObjectId

  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'ConversationEntry' })
  reactionToEntryId?: Types.ObjectId

  @Prop({ type: String })
  reactionName?: string

  @Prop({ type: String, required: true })
  attributionReason: string

  @Prop({ type: String, required: true, immutable: true })
  algorithmVersion: string

  @Prop({ type: Date, required: true, immutable: true })
  eventAt: Date

  @Prop({ type: Number, required: true, default: 1 })
  version: number

  createdAt?: Date
  updatedAt?: Date
}

export const ConversationEntrySchema =
  SchemaFactory.createForClass(ConversationEntry)
ConversationEntrySchema.index({ organizationId: 1, smsId: 1 }, { unique: true })
ConversationEntrySchema.index({
  organizationId: 1,
  conversationId: 1,
  eventAt: 1,
  _id: 1,
})
ConversationEntrySchema.index({ organizationId: 1, groupId: 1, eventAt: -1 })
ConversationEntrySchema.index({
  organizationId: 1,
  candidateGroupIds: 1,
  attributionState: 1,
})
