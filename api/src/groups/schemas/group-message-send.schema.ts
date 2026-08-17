import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import mongoose, { HydratedDocument, Types } from 'mongoose'
import { Device } from '../../gateway/schemas/device.schema'
import { Organization } from '../../organizations/schemas/organization.schema'
import { User } from '../../users/schemas/user.schema'
import { Group } from './group.schema'

export type GroupMessageSendDocument = HydratedDocument<GroupMessageSend>

@Schema({ timestamps: true })
export class GroupMessageSend {
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

  @Prop({
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    immutable: true,
    unique: true,
  })
  previewId: Types.ObjectId

  @Prop({ type: String, required: true, immutable: true })
  requestId: string

  @Prop({ type: String, required: true, immutable: true })
  groupName: string

  @Prop({ type: String, required: true, immutable: true })
  message: string

  @Prop({ type: String, required: true })
  status: string

  @Prop({ type: mongoose.Schema.Types.ObjectId })
  smsBatchId?: Types.ObjectId

  @Prop({ type: Number, required: true })
  candidateCount: number

  @Prop({ type: Number, required: true })
  acceptedCount: number

  @Prop({ type: Number, required: true })
  excludedCount: number

  @Prop({ type: String })
  failure?: string

  createdAt?: Date
  updatedAt?: Date
}

export const GroupMessageSendSchema =
  SchemaFactory.createForClass(GroupMessageSend)
GroupMessageSendSchema.index({ organizationId: 1, groupId: 1, createdAt: -1 })
GroupMessageSendSchema.index(
  { organizationId: 1, requestId: 1 },
  { unique: true },
)
