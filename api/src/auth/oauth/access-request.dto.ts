import { BadRequestException } from '@nestjs/common'
import { Types } from 'mongoose'
export type AdmissionGroupGrant = { groupId: string; role: 'sender' | 'owner' }
export type AdmissionDecision = {
  action: string
  version: number
  reason: string
  organizationId?: string
  groups?: AdmissionGroupGrant[]
}
export function parseAdmissionDecision(value: any): AdmissionDecision {
  const invalid = () => {
    throw new BadRequestException('Invalid admission decision')
  }
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).some(
      (k) =>
        !['action', 'version', 'reason', 'organizationId', 'groups'].includes(
          k,
        ),
    ) ||
    !['approve', 'reject', 'reconsider', 'revoke'].includes(value.action) ||
    !Number.isSafeInteger(value.version) ||
    value.version < 0 ||
    typeof value.reason !== 'string' ||
    !value.reason.trim() ||
    value.reason.length > 500
  )
    invalid()
  if (
    value.organizationId !== undefined &&
    (typeof value.organizationId !== 'string' ||
      !Types.ObjectId.isValid(value.organizationId))
  )
    invalid()
  if (
    value.groups !== undefined &&
    (!Array.isArray(value.groups) ||
      value.groups.length > 100 ||
      value.groups.some(
        (g) =>
          !g ||
          typeof g !== 'object' ||
          Object.keys(g).some((k) => !['groupId', 'role'].includes(k)) ||
          typeof g.groupId !== 'string' ||
          !Types.ObjectId.isValid(g.groupId) ||
          !['sender', 'owner'].includes(g.role),
      ))
  )
    invalid()
  return { ...value, reason: value.reason.trim() }
}
