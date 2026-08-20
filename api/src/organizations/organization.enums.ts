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
  OPERATORS_READ = 'operators:read',
  OPERATORS_MANAGE = 'operators:manage',
  GATEWAYS_READ = 'gateways:read',
  GATEWAYS_MANAGE = 'gateways:manage',
  API_KEYS_READ = 'api-keys:read',
  API_KEYS_MANAGE = 'api-keys:manage',
  MESSAGES_READ = 'messages:read',
  MESSAGES_SEND = 'messages:send',
  WEBHOOKS_READ = 'webhooks:read',
  WEBHOOKS_MANAGE = 'webhooks:manage',
  USAGE_READ = 'usage:read',
  GROUPS_READ = 'groups:read',
  GROUPS_MANAGE = 'groups:manage',
  GROUP_OWNERS_MANAGE = 'group-owners:manage',
  GROUP_ROSTER_MANAGE = 'group-roster:manage',
  GROUP_JOIN_SETTINGS_MANAGE = 'group-join-settings:manage',
  GROUP_MESSAGES_SEND = 'group-messages:send',
}

export enum OrganizationAuditAction {
  ORGANIZATION_CREATED = 'ORGANIZATION_CREATED',
  ORGANIZATION_RENAMED = 'ORGANIZATION_RENAMED',
  OPERATOR_ADDED = 'OPERATOR_ADDED',
  OPERATOR_SUSPENDED = 'OPERATOR_SUSPENDED',
  OPERATOR_REACTIVATED = 'OPERATOR_REACTIVATED',
  OPERATOR_REVOKED = 'OPERATOR_REVOKED',
  ORGANIZATION_ADMIN_GRANTED = 'ORGANIZATION_ADMIN_GRANTED',
  ORGANIZATION_ADMIN_REVOKED = 'ORGANIZATION_ADMIN_REVOKED',
  GROUP_SENDER_ASSIGNED = 'GROUP_SENDER_ASSIGNED',
  GROUP_SENDER_REVOKED = 'GROUP_SENDER_REVOKED',
  FIRST_ORGANIZATION_RESOURCES_MIGRATED = 'FIRST_ORGANIZATION_RESOURCES_MIGRATED',
}

export enum AuditOutcome {
  SUCCESS = 'SUCCESS',
  DENIED = 'DENIED',
}
