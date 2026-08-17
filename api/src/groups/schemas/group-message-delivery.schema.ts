import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import mongoose, { Types } from 'mongoose'
import { Contact } from './contact.schema'
import { GroupMessageSend } from './group-message-send.schema'

@Schema({ timestamps: true })
export class GroupMessageDelivery {
  _id?: Types.ObjectId

  @Prop({
    type: mongoose.Schema.Types.ObjectId,
    ref: GroupMessageSend.name,
    required: true,
    immutable: true,
  })
  groupSendId: Types.ObjectId

  @Prop({
    type: mongoose.Schema.Types.ObjectId,
    ref: Contact.name,
    required: true,
    immutable: true,
  })
  contactId: Types.ObjectId

  @Prop({ type: String, required: true, immutable: true })
  displayName: string

  @Prop({ type: String, required: true, immutable: true })
  mobileNumber: string

  @Prop({ type: String, required: true })
  status: string

  @Prop({ type: String })
  exclusionReason?: string

  createdAt?: Date
  updatedAt?: Date
}

export const GroupMessageDeliverySchema =
  SchemaFactory.createForClass(GroupMessageDelivery)
GroupMessageDeliverySchema.index(
  { groupSendId: 1, mobileNumber: 1 },
  { unique: true },
)
