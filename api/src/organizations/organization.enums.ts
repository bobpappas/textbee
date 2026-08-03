export enum OrganizationStatus {
  PROVISIONING = 'PROVISIONING',
  ACTIVE = 'ACTIVE',
  PROVISIONING_FAILED = 'PROVISIONING_FAILED',
}

export enum MembershipStatus {
  ACTIVE = 'ACTIVE',
}

export enum OrganizationRole {
  ORGANIZATION_ADMIN = 'ORGANIZATION_ADMIN',
}

export enum GrantStatus {
  ACTIVE = 'ACTIVE',
}

export enum OrganizationAuditAction {
  ORGANIZATION_CREATED = 'ORGANIZATION_CREATED',
  ORGANIZATION_RENAMED = 'ORGANIZATION_RENAMED',
}

export enum AuditOutcome {
  SUCCESS = 'SUCCESS',
}
