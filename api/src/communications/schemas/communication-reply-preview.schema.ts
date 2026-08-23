import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import mongoose, { Types } from 'mongoose'
import { Device } from '../../gateway/schemas/device.schema'
import { Contact } from '../../groups/schemas/contact.schema'
import { Group } from '../../groups/schemas/group.schema'
import { Organization } from '../../organizations/schemas/organization.schema'
import { User } from '../../users/schemas/user.schema'
import { ConversationEntry } from './conversation-entry.schema'
import { Conversation } from './conversation.schema'

@Schema({ timestamps: true })
export class CommunicationReplyPreview {
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
    ref: ConversationEntry.name,
    required: true,
    immutable: true,
  })
  parentEntryId: Types.ObjectId
  @Prop({
    type: mongoose.Schema.Types.ObjectId,
    ref: Group.name,
    required: true,
    immutable: true,
  })
  groupId: Types.ObjectId
  @Prop({
    type: mongoose.Schema.Types.ObjectId,
    ref: Contact.name,
    required: true,
    immutable: true,
  })
  contactId: Types.ObjectId
  @Prop({
    type: mongoose.Schema.Types.ObjectId,
    ref: User.name,
    required: true,
    immutable: true,
  })
  actorUserId: Types.ObjectId
  @Prop({
    type: mongoose.Schema.Types.ObjectId,
    ref: Device.name,
    required: true,
    immutable: true,
  })
  deviceId: Types.ObjectId
  @Prop({ type: String, required: true, immutable: true })
  canonicalNumber: string
  @Prop({ type: String, required: true, immutable: true })
  displayName: string
  @Prop({ type: String, required: true, immutable: true })
  groupName: string
  @Prop({ type: String, required: true, immutable: true })
  joinCode: string
  @Prop({ type: String, required: true, immutable: true })
  body: string
  @Prop({ type: String, required: true, immutable: true })
  message: string
  @Prop({ type: Number, required: true, immutable: true })
  segments: number
  @Prop({ type: Date, required: true })
  expiresAt: Date
}

export const CommunicationReplyPreviewSchema = SchemaFactory.createForClass(
  CommunicationReplyPreview,
)
CommunicationReplyPreviewSchema.index(
  { expiresAt: 1 },
  { expireAfterSeconds: 0 },
)
