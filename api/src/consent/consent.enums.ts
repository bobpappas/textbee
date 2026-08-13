export enum ConsentSource {
  OPERATOR_AFFIRMATION = 'OPERATOR_AFFIRMATION',
  TEXT_TO_JOIN = 'TEXT_TO_JOIN',
}

export enum ConsentStatus {
  ACTIVE = 'ACTIVE',
  ENDED = 'ENDED',
}

export enum SuppressionStatus {
  ACTIVE = 'ACTIVE',
  ENDED = 'ENDED',
}

export type AcknowledgmentKind =
  | 'STOP'
  | 'START'
  | 'HELP'
  | 'JOIN'
  | 'ALREADY_JOINED'
  | 'UNKNOWN'

export type DispatchPolicyContext = {
  kind: 'ORDINARY' | 'ACKNOWLEDGMENT'
  organizationId?: string
  groupId?: string
  acknowledgmentKind?: AcknowledgmentKind
}
