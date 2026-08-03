export enum OrganizationStatus {
  PROVISIONING = 'PROVISIONING',
  ACTIVE = 'ACTIVE',
  PROVISIONING_FAILED = 'PROVISIONING_FAILED',
}

export enum MembershipStatus {
  ACTIVE = 'ACTIVE',
  SUSPENDED = 'SUSPENDED',
  REVOKED = 'REVOKED',
}

export enum OrganizationRole {
  ORGANIZATION_ADMIN = 'ORGANIZATION_ADMIN',
}

export enum GrantStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  REVOKED = 'REVOKED',
}

export enum OrganizationContextState {
  ACTIVE = 'ACTIVE',
  NO_ACCESS = 'NO_ACCESS',
  SELECTION_REQUIRED = 'SELECTION_REQUIRED',
}

export enum OrganizationCapability {
  PROFILE_MANAGE = 'organization:profile:manage',
}

export enum OrganizationAuditAction {
  ORGANIZATION_CREATED = 'ORGANIZATION_CREATED',
  ORGANIZATION_RENAMED = 'ORGANIZATION_RENAMED',
}

export enum AuditOutcome {
  SUCCESS = 'SUCCESS',
}
