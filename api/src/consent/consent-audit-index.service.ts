import { Injectable, OnApplicationBootstrap } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model } from 'mongoose'
import { ConsentAuditEvent } from './schemas/consent-audit-event.schema'

const LEGACY_INDEX = 'organizationId_1_inboundSmsId_1_action_1'
const IDEMPOTENCY_INDEX = 'consent_audit_inbound_idempotency_v2'

@Injectable()
export class ConsentAuditIndexService implements OnApplicationBootstrap {
  constructor(
    @InjectModel(ConsentAuditEvent.name)
    private readonly audit: Model<ConsentAuditEvent>,
  ) {}

  async onApplicationBootstrap() {
    // Build the corrected index first so inbound command idempotency is never
    // unprotected while an existing deployment removes the legacy index.
    await this.audit.collection.createIndex(
      { organizationId: 1, action: 1, inboundSmsId: 1 },
      {
        name: IDEMPOTENCY_INDEX,
        unique: true,
        partialFilterExpression: { inboundSmsId: { $exists: true } },
      },
    )
    try {
      await this.audit.collection.dropIndex(LEGACY_INDEX)
    } catch (error) {
      const mongoError = error as { code?: number; codeName?: string }
      if (mongoError.code !== 27 && mongoError.codeName !== 'IndexNotFound')
        throw error
    }
  }
}
