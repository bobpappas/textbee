import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import mongoose, { HydratedDocument, Types } from 'mongoose'
import { Organization } from '../../organizations/schemas/organization.schema'
import { Contact } from '../../groups/schemas/contact.schema'

export type ConversationDocument = HydratedDocument<Conversation>

@Schema({ timestamps: true })
export class Conversation {
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
    ref: Contact.name,
    immutable: true,
  })
  contactId?: Types.ObjectId

  @Prop({ type: String, required: true, immutable: true })
  canonicalNumber: string

  @Prop({ type: String, required: true })
  displayName: string

  @Prop({ type: Date, required: true })
  lastActivityAt: Date

  createdAt?: Date
  updatedAt?: Date
}

export const ConversationSchema = SchemaFactory.createForClass(Conversation)
ConversationSchema.index(
  { organizationId: 1, canonicalNumber: 1 },
  { unique: true },
)
ConversationSchema.index({ organizationId: 1, lastActivityAt: -1, _id: -1 })
