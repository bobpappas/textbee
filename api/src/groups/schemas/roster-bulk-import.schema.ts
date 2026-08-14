import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import mongoose, { HydratedDocument, Types } from 'mongoose'
import { Organization } from '../../organizations/schemas/organization.schema'
import { User } from '../../users/schemas/user.schema'
import { Group } from './group.schema'

export type RosterBulkImportDocument = HydratedDocument<RosterBulkImport>

@Schema({ timestamps: true })
export class RosterBulkImport {
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

  @Prop({ type: String, required: true, immutable: true })
  contentHash: string

  @Prop({ type: String, required: true, enum: ['PREVIEW', 'APPLIED'] })
  status: 'PREVIEW' | 'APPLIED'

  @Prop({ type: [mongoose.Schema.Types.Mixed], required: true })
  rows: Record<string, unknown>[]

  @Prop({ type: Date, required: true })
  expiresAt: Date

  @Prop({ type: Date })
  appliedAt?: Date

  createdAt?: Date
  updatedAt?: Date
}

export const RosterBulkImportSchema =
  SchemaFactory.createForClass(RosterBulkImport)
RosterBulkImportSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })
RosterBulkImportSchema.index({
  organizationId: 1,
  groupId: 1,
  actorUserId: 1,
  createdAt: -1,
})
