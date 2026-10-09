import { Schema, Types } from 'mongoose'

export const ACCESS_REQUEST = 'AccessRequest'
export type AccessRequestState = 'PENDING' | 'APPROVED' | 'REJECTED' | 'REVOKED'
export interface AccessRequest {
  _id: Types.ObjectId
  provider: string
  subject: string
  email: string
  name: string
  state: AccessRequestState
  version: number
  userId?: Types.ObjectId
  decisionKey?: string
  createdAt: Date
}
export const AccessRequestSchema = new Schema<AccessRequest>(
  {
    provider: { type: String, required: true, immutable: true },
    subject: { type: String, required: true, immutable: true },
    email: { type: String, required: true, immutable: true },
    name: { type: String, required: true },
    state: {
      type: String,
      enum: ['PENDING', 'APPROVED', 'REJECTED', 'REVOKED'],
      default: 'PENDING',
    },
    version: { type: Number, default: 0 },
    userId: Types.ObjectId,
    decisionKey: String,
  },
  { timestamps: true },
)
AccessRequestSchema.index({ provider: 1, subject: 1 }, { unique: true })
AccessRequestSchema.index({ state: 1, createdAt: -1, _id: -1 })
export const ADMISSION_AUDIT = 'AdmissionAudit'
export const AdmissionAuditSchema = new Schema(
  {
    requestId: { type: Types.ObjectId, required: true },
    actorId: { type: Types.ObjectId, required: true },
    action: { type: String, required: true },
    reason: { type: String, required: true },
    grants: { type: Object },
  },
  { timestamps: true },
)
