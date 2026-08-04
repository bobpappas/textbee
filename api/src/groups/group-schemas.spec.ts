import { ContactSchema } from './schemas/contact.schema'
import { GroupAuditEventSchema } from './schemas/group-audit-event.schema'
import { GroupOwnerAssignmentSchema } from './schemas/group-owner-assignment.schema'
import { GroupSchema } from './schemas/group.schema'
import { RosterMembershipSchema } from './schemas/roster-membership.schema'

describe('group persistence constraints', () => {
  it('reserves each receiving-number and canonical join-code pair globally', () => {
    expect(GroupSchema.indexes()).toContainEqual([
      { receivingNumber: 1, joinCode: 1 },
      { unique: true },
    ])
  })

  it('scopes contact, owner, and roster uniqueness to organization records', () => {
    expect(ContactSchema.indexes()).toContainEqual([
      { organizationId: 1, mobileNumber: 1 },
      { unique: true },
    ])
    expect(GroupOwnerAssignmentSchema.indexes()).toContainEqual([
      { organizationId: 1, groupId: 1, membershipId: 1 },
      { unique: true },
    ])
    expect(RosterMembershipSchema.indexes()).toContainEqual([
      { organizationId: 1, groupId: 1, contactId: 1 },
      { unique: true },
    ])
  })

  it('deduplicates retries of the same audited action', () => {
    expect(GroupAuditEventSchema.indexes()).toContainEqual([
      { organizationId: 1, correlationId: 1, action: 1, targetId: 1 },
      { unique: true },
    ])
  })
})
