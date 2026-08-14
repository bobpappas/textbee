import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import mongoose, { HydratedDocument, Types } from 'mongoose'
import { Group } from '../../groups/schemas/group.schema'
import { Contact } from '../../groups/schemas/contact.schema'
import { Organization } from '../../organizations/schemas/organization.schema'
import { User } from '../../users/schemas/user.schema'
import { ConsentSource, ConsentStatus } from '../consent.enums'

export type GroupConsentDocument = HydratedDocument<GroupConsent>

@Schema({ timestamps: true })
export class GroupConsent {
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
    ref: Contact.name,
    required: true,
    immutable: true,
  })
  contactId: Types.ObjectId

  @Prop({ type: String, required: true, immutable: true })
  mobileNumber: string

  @Prop({ type: String, enum: ConsentSource, required: true })
  source: ConsentSource

  @Prop({ type: String, enum: ConsentStatus, required: true })
  status: ConsentStatus

  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: User.name })
  actorUserId?: Types.ObjectId

  @Prop({ type: String })
  methodNote?: string

  @Prop({ type: Number })
  sourceRow?: number

  @Prop({ type: String })
  receivingNumber?: string

  @Prop({ type: mongoose.Schema.Types.ObjectId })
  inboundSmsId?: Types.ObjectId

  @Prop({ type: Date, required: true })
  consentedAt: Date

  @Prop({ type: Date })
  endedAt?: Date

  @Prop({ type: String })
  endedByCommand?: string
}

export const GroupConsentSchema = SchemaFactory.createForClass(GroupConsent)
GroupConsentSchema.index(
  { organizationId: 1, groupId: 1, contactId: 1 },
  { unique: true },
)
GroupConsentSchema.index({ organizationId: 1, mobileNumber: 1, status: 1 })
