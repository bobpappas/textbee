import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document } from 'mongoose'

export type OAuthPlatformAuthorityInvariantDocument =
  OAuthPlatformAuthorityInvariant & Document

@Schema({ timestamps: true })
export class OAuthPlatformAuthorityInvariant {
  @Prop({ type: String, required: true, unique: true, immutable: true })
  scope: string

  @Prop({ type: Number, required: true, default: 0, min: 0 })
  serializationRevision: number

  @Prop({ type: Boolean, required: true, default: false })
  bootstrapCompleted: boolean
}

export const OAuthPlatformAuthorityInvariantSchema =
  SchemaFactory.createForClass(OAuthPlatformAuthorityInvariant)
