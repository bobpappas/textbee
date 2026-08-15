import { ConsentAuditIndexService } from './consent-audit-index.service'
import { ConsentAuditEventSchema } from './schemas/consent-audit-event.schema'

describe('ConsentAuditIndexService', () => {
  it('indexes only audits that carry an inbound SMS id', () => {
    expect(ConsentAuditEventSchema.indexes()).toContainEqual([
      { organizationId: 1, action: 1, inboundSmsId: 1 },
      expect.objectContaining({
        name: 'consent_audit_inbound_idempotency_v2',
        unique: true,
        partialFilterExpression: { inboundSmsId: { $exists: true } },
      }),
    ])
  })

  it('builds the corrected index before removing the legacy sparse index', async () => {
    const collection = {
      createIndex: jest.fn().mockResolvedValue('created'),
      dropIndex: jest.fn().mockResolvedValue(undefined),
    }
    const service = new ConsentAuditIndexService({ collection } as any)

    await service.onApplicationBootstrap()

    expect(collection.createIndex).toHaveBeenCalledWith(
      { organizationId: 1, action: 1, inboundSmsId: 1 },
      expect.objectContaining({
        name: 'consent_audit_inbound_idempotency_v2',
        unique: true,
        partialFilterExpression: { inboundSmsId: { $exists: true } },
      }),
    )
    expect(collection.dropIndex).toHaveBeenCalledWith(
      'organizationId_1_inboundSmsId_1_action_1',
    )
    expect(collection.createIndex.mock.invocationCallOrder[0]).toBeLessThan(
      collection.dropIndex.mock.invocationCallOrder[0],
    )
  })
})
