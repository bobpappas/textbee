import { Schema } from 'mongoose'
export const PACED_SEND = 'PacedSend'
export const PACED_ITEM = 'PacedItem'
export const PacedSendSchema = new Schema(
  {
    deviceId: { type: Schema.Types.ObjectId, required: true },
    key: { type: String, required: true },
    fingerprint: { type: String, required: true },
    batchId: { type: Schema.Types.ObjectId, required: true },
  },
  { timestamps: true },
)
PacedSendSchema.index({ deviceId: 1, key: 1 }, { unique: true })
export const PacedItemSchema = new Schema(
  {
    deviceId: { type: Schema.Types.ObjectId, required: true },
    batchId: { type: Schema.Types.ObjectId, required: true },
    smsId: { type: Schema.Types.ObjectId, required: true, unique: true },
    sequence: { type: Number, required: true },
    segments: { type: Number, required: true },
    notBefore: { type: Date, required: true },
    state: { type: String, default: 'QUEUED' },
    reason: String,
    issuedAt: Date,
    attempts: { type: Number, default: 0 },
    attemptId: String,
    reservationId: String,
    context: Schema.Types.Mixed,
  },
  { timestamps: true },
)
PacedItemSchema.index({ deviceId: 1, state: 1, sequence: 1 })
