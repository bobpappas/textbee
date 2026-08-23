import { CommunicationReplyPreviewSchema } from './schemas/communication-reply-preview.schema'
import { ConversationEntrySchema } from './schemas/conversation-entry.schema'
import { ConversationReadStateSchema } from './schemas/conversation-read-state.schema'
import { ConversationWorkStateSchema } from './schemas/conversation-work-state.schema'
import { ConversationSchema } from './schemas/conversation.schema'

const index = (
  schema: {
    indexes(): Array<[Record<string, string | number>, Record<string, unknown>]>
  },
  fields: Record<string, string | number>,
) =>
  schema
    .indexes()
    .find(([candidate]) => JSON.stringify(candidate) === JSON.stringify(fields))

describe('B017 communications persistence indexes', () => {
  it('uniquely scopes a canonical-number conversation to one organization', () => {
    expect(
      index(ConversationSchema, { organizationId: 1, canonicalNumber: 1 })?.[1],
    ).toEqual(expect.objectContaining({ unique: true }))
    expect(
      index(ConversationSchema, {
        organizationId: 1,
        lastActivityAt: -1,
        _id: -1,
      }),
    ).toBeDefined()
  })

  it('prevents duplicate raw-message links and supports stable chronological reads', () => {
    expect(
      index(ConversationEntrySchema, { organizationId: 1, smsId: 1 })?.[1],
    ).toEqual(expect.objectContaining({ unique: true }))
    expect(
      index(ConversationEntrySchema, {
        organizationId: 1,
        conversationId: 1,
        eventAt: 1,
        _id: 1,
      }),
    ).toBeDefined()
  })

  it('keeps personal unread and shared group work state unique', () => {
    expect(
      index(ConversationReadStateSchema, {
        organizationId: 1,
        entryId: 1,
        userId: 1,
      })?.[1],
    ).toEqual(expect.objectContaining({ unique: true }))
    expect(
      index(ConversationWorkStateSchema, {
        organizationId: 1,
        conversationId: 1,
        groupId: 1,
      })?.[1],
    ).toEqual(expect.objectContaining({ unique: true }))
  })

  it('expires unused actor-bound reply previews', () => {
    expect(
      index(CommunicationReplyPreviewSchema, { expiresAt: 1 })?.[1],
    ).toEqual(expect.objectContaining({ expireAfterSeconds: 0 }))
  })
})
