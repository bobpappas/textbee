import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { HydratedDocument, Types } from 'mongoose'

export type CommandResponseWindowDocument =
  HydratedDocument<CommandResponseWindow>

@Schema({ timestamps: { createdAt: true, updatedAt: false } })
export class CommandResponseWindow {
  _id?: Types.ObjectId

  @Prop({ type: String, required: true, immutable: true })
  mobileNumber: string

  @Prop({ type: String, required: true, immutable: true })
  receivingNumber: string

  @Prop({ type: String, required: true, immutable: true })
  responseKind: string

  @Prop({ type: Date, required: true, immutable: true })
  windowStart: Date

  createdAt?: Date
}

export const CommandResponseWindowSchema = SchemaFactory.createForClass(
  CommandResponseWindow,
)
CommandResponseWindowSchema.index(
  { mobileNumber: 1, receivingNumber: 1, responseKind: 1, windowStart: 1 },
  { unique: true },
)
CommandResponseWindowSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: 60 * 60 * 25 },
)
