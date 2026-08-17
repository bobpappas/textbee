import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import mongoose, { HydratedDocument, Types } from 'mongoose'
import { Device } from '../../gateway/schemas/device.schema'
import { Organization } from '../../organizations/schemas/organization.schema'
import { User } from '../../users/schemas/user.schema'
import { Group } from './group.schema'

export type GroupMessagePreviewDocument = HydratedDocument<GroupMessagePreview>

@Schema({ timestamps: true })
export class GroupMessagePreview {
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

  @Prop({ type: String, required: true, immutable: true })
  groupName: string

  @Prop({ type: String, required: true, immutable: true })
  joinCode: string

  @Prop({ type: String, required: true, immutable: true })
  body: string

  @Prop({ type: String, required: true, immutable: true })
  message: string

  @Prop({ type: [Object], required: true, immutable: true })
  recipients: Array<Record<string, unknown>>

  @Prop({ type: Date, required: true, immutable: true, expires: 0 })
  expiresAt: Date

  createdAt?: Date
}

export const GroupMessagePreviewSchema =
  SchemaFactory.createForClass(GroupMessagePreview)
GroupMessagePreviewSchema.index({
  organizationId: 1,
  groupId: 1,
  actorUserId: 1,
  createdAt: -1,
})
