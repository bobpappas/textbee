import { Types } from 'mongoose'
import { AttributionState } from './communication.enums'

export type GroupAccess = {
  admin: boolean
  ownerGroupIds: ReadonlySet<string>
  senderGroupIds: ReadonlySet<string>
}

type AttributedEntry = {
  attributionState: AttributionState
  groupId?: Types.ObjectId
}

export function hasGroupAccess(access: GroupAccess, groupId: string) {
  return (
    access.admin ||
    access.ownerGroupIds.has(groupId) ||
    access.senderGroupIds.has(groupId)
  )
}

export function isSenderOnly(
  access: GroupAccess,
  groupId?: Types.ObjectId | string,
) {
  const id = String(groupId || '')
  return (
    !access.admin &&
    !access.ownerGroupIds.has(id) &&
    access.senderGroupIds.has(id)
  )
}

export function canReplyToEntry(
  access: GroupAccess,
  entry: AttributedEntry,
  groupId: Types.ObjectId,
) {
  const id = String(groupId)
  return (
    entry.attributionState !== AttributionState.AMBIGUOUS &&
    String(entry.groupId || '') === id &&
    hasGroupAccess(access, id)
  )
}

export function visibleEntryGroupFilter(
  access: GroupAccess,
  requestedGroupId: Types.ObjectId,
): Record<string, unknown> {
  if (access.admin || access.ownerGroupIds.has(String(requestedGroupId)))
    return {
      $or: [
        { groupId: requestedGroupId },
        {
          attributionState: AttributionState.AMBIGUOUS,
          candidateGroupIds: requestedGroupId,
        },
      ],
    }

  return { groupId: requestedGroupId }
}
