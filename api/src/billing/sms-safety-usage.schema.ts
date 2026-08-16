import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import mongoose, { HydratedDocument, Types } from 'mongoose'
import { Device } from '../gateway/schemas/device.schema'

export type SmsSafetyUsageDocument = HydratedDocument<SmsSafetyUsage>

@Schema({ timestamps: true })
export class SmsSafetyUsage {
  _id?: Types.ObjectId

  @Prop({
    type: mongoose.Schema.Types.ObjectId,
    ref: Device.name,
    required: true,
    unique: true,
    immutable: true,
  })
  deviceId: Types.ObjectId

  @Prop({ type: [mongoose.Schema.Types.Mixed], default: [] })
  ordinaryEvents: Array<Record<string, unknown>>

  @Prop({ type: [mongoose.Schema.Types.Mixed], default: [] })
  complianceEvents: Array<Record<string, unknown>>
}

export const SmsSafetyUsageSchema = SchemaFactory.createForClass(SmsSafetyUsage)
