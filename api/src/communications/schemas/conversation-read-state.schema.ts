import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import mongoose, { Types } from 'mongoose'
import { Organization } from '../../organizations/schemas/organization.schema'
import { User } from '../../users/schemas/user.schema'
import { ConversationEntry } from './conversation-entry.schema'

@Schema({ timestamps: true })
export class ConversationReadState {
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
    ref: ConversationEntry.name,
    required: true,
    immutable: true,
  })
  entryId: Types.ObjectId

  @Prop({
    type: mongoose.Schema.Types.ObjectId,
    ref: User.name,
    required: true,
    immutable: true,
  })
  userId: Types.ObjectId

  @Prop({ type: Boolean, required: true })
  read: boolean

  @Prop({ type: Date, required: true })
  changedAt: Date
}

export const ConversationReadStateSchema = SchemaFactory.createForClass(
  ConversationReadState,
)
ConversationReadStateSchema.index(
  { organizationId: 1, entryId: 1, userId: 1 },
  { unique: true },
)
ConversationReadStateSchema.index({ organizationId: 1, userId: 1, read: 1 })
