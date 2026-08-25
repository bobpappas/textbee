export enum OAuthApprovalState {
  PENDING = 'PENDING',
  BOUND = 'BOUND',
  REVOKED = 'REVOKED',
}

export enum OAuthAuthenticationAuditAction {
  IDENTITY_BOUND = 'IDENTITY_BOUND',
  LOGIN_SUCCEEDED = 'LOGIN_SUCCEEDED',
  LOGIN_DENIED = 'LOGIN_DENIED',
}

export enum OAuthAuthenticationAuditOutcome {
  SUCCESS = 'SUCCESS',
  DENIED = 'DENIED',
}
