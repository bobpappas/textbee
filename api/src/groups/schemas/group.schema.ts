import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import mongoose, { HydratedDocument, Types } from 'mongoose'
import { Organization } from '../../organizations/schemas/organization.schema'
import { User } from '../../users/schemas/user.schema'
import { GroupStatus } from '../group.enums'

export type GroupDocument = HydratedDocument<Group>

@Schema({ timestamps: true })
export class Group {
  _id?: Types.ObjectId

  @Prop({
    type: mongoose.Schema.Types.ObjectId,
    ref: Organization.name,
    required: true,
    immutable: true,
  })
  organizationId: Types.ObjectId

  @Prop({
    type: String,
    required: true,
    trim: true,
    minlength: 1,
    maxlength: 100,
  })
  displayName: string

  @Prop({ type: String, enum: GroupStatus, required: true })
  status: GroupStatus

  @Prop({ type: String, required: true })
  receivingNumberId: string

  @Prop({ type: String, required: true })
  receivingNumber: string

  @Prop({
    type: String,
    required: true,
    trim: true,
    uppercase: true,
    minlength: 2,
    maxlength: 20,
  })
  joinCode: string

  @Prop({
    type: mongoose.Schema.Types.ObjectId,
    ref: User.name,
    required: true,
    immutable: true,
  })
  createdBy: Types.ObjectId

  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: User.name })
  archivedBy?: Types.ObjectId

  @Prop({ type: Date })
  archivedAt?: Date

  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: User.name })
  reactivatedBy?: Types.ObjectId

  @Prop({ type: Date })
  reactivatedAt?: Date

  createdAt?: Date
  updatedAt?: Date
}

export const GroupSchema = SchemaFactory.createForClass(Group)
GroupSchema.index({ receivingNumber: 1, joinCode: 1 }, { unique: true })
GroupSchema.index({ organizationId: 1, status: 1, displayName: 1, _id: 1 })
