import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import mongoose, { HydratedDocument, Types } from 'mongoose'
import { Organization } from '../../organizations/schemas/organization.schema'
import { User } from '../../users/schemas/user.schema'
import { RosterMembershipStatus } from '../group.enums'
import { Contact } from './contact.schema'
import { Group } from './group.schema'

export type RosterMembershipDocument = HydratedDocument<RosterMembership>

@Schema({ timestamps: true })
export class RosterMembership {
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

  @Prop({ type: String, enum: RosterMembershipStatus, required: true })
  status: RosterMembershipStatus

  @Prop({
    type: mongoose.Schema.Types.ObjectId,
    ref: User.name,
  })
  changedBy?: Types.ObjectId

  @Prop({ type: mongoose.Schema.Types.ObjectId })
  changedByInboundSmsId?: Types.ObjectId

  @Prop({ type: String })
  reason?: string

  @Prop({ type: Date, required: true })
  changedAt: Date
}

export const RosterMembershipSchema =
  SchemaFactory.createForClass(RosterMembership)
RosterMembershipSchema.index(
  { organizationId: 1, groupId: 1, contactId: 1 },
  { unique: true },
)
RosterMembershipSchema.index({ organizationId: 1, groupId: 1, status: 1 })
