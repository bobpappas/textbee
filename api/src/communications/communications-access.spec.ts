import { Types } from 'mongoose'
import { AttributionState } from './communication.enums'
import {
  canReplyToEntry,
  hasGroupAccess,
  isSenderOnly,
  visibleEntryGroupFilter,
} from './communications-access'

const ownerGroupId = new Types.ObjectId()
const senderGroupId = new Types.ObjectId()
const unrelatedGroupId = new Types.ObjectId()

const access = {
  admin: false,
  ownerGroupIds: new Set([String(ownerGroupId)]),
  senderGroupIds: new Set([String(senderGroupId)]),
}

describe('communications access policy', () => {
  it('keeps group access bounded to current administrator, owner, or sender grants', () => {
    expect(hasGroupAccess(access, String(ownerGroupId))).toBe(true)
    expect(hasGroupAccess(access, String(senderGroupId))).toBe(true)
    expect(hasGroupAccess(access, String(unrelatedGroupId))).toBe(false)
  })

  it('identifies sender-only access without masking administrators or owners', () => {
    expect(isSenderOnly(access, senderGroupId)).toBe(true)
    expect(isSenderOnly(access, ownerGroupId)).toBe(false)
    expect(isSenderOnly({ ...access, admin: true }, senderGroupId)).toBe(false)
  })

  it('allows replies only to non-ambiguous entries attributed to an accessible group', () => {
    expect(
      canReplyToEntry(
        access,
        {
          attributionState: AttributionState.CONFIRMED,
          groupId: senderGroupId,
        },
        senderGroupId,
      ),
    ).toBe(true)
    expect(
      canReplyToEntry(
        access,
        {
          attributionState: AttributionState.AMBIGUOUS,
          groupId: senderGroupId,
        },
        senderGroupId,
      ),
    ).toBe(false)
    expect(
      canReplyToEntry(
        access,
        {
          attributionState: AttributionState.CONFIRMED,
          groupId: unrelatedGroupId,
        },
        unrelatedGroupId,
      ),
    ).toBe(false)
  })

  it('includes ambiguous candidates for administrators and owners only', () => {
    expect(visibleEntryGroupFilter(access, ownerGroupId)).toHaveProperty('$or')
    expect(visibleEntryGroupFilter(access, senderGroupId)).toEqual({
      groupId: senderGroupId,
    })
    expect(
      visibleEntryGroupFilter({ ...access, admin: true }, unrelatedGroupId),
    ).toHaveProperty('$or')
  })
})
