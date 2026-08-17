export const ApiEndpoints = {
  auth: {
    login: () => '/auth/login',
    register: () => '/auth/register',
    signInWithGoogle: () => '/auth/google-login',
    updateProfile: () => '/auth/update-profile',
    changePassword: () => '/auth/change-password',

    whoAmI: () => '/auth/who-am-i',
    updateOnboarding: () => '/auth/onboarding',

    sendEmailVerificationEmail: () => '/auth/send-email-verification-email',
    verifyEmail: () => '/auth/verify-email',

    requestPasswordReset: () => '/auth/request-password-reset',
    resetPassword: () => '/auth/reset-password',

    generateApiKey: () => '/auth/api-keys',
    listApiKeys: (status?: 'active' | 'revoked' | 'all') =>
      status
        ? `/auth/api-keys?status=${encodeURIComponent(status)}`
        : '/auth/api-keys',
    revokeApiKey: (id: string) => `/auth/api-keys/${id}/revoke`,
    renameApiKey: (id: string) => `/auth/api-keys/${id}/rename`,
    deleteApiKey: (id: string) => `/auth/api-keys/${id}`,
  },
  gateway: {
    listDevices: () => '/gateway/devices',
    deleteDevice: (id: string) => `/gateway/devices/${id}`,
    sendSMS: (id: string) => `/gateway/devices/${id}/send-sms`,
    sendBulkSMS: (id: string) => `/gateway/devices/${id}/send-bulk-sms`,
    messagingEligibility: (id: string) =>
      `/gateway/devices/${id}/messaging-eligibility`,
    getReceivedSMS: (id: string) => `/gateway/devices/${id}/get-received-sms`,
    getMessages: (id: string) => `/gateway/devices/${id}/messages`,

    getWebhooks: () => '/webhooks',
    getWebhookNotifications: () => '/webhooks/notifications',
    createWebhook: () => '/webhooks',
    updateWebhook: (id: string) => `/webhooks/${id}`,
    deleteWebhook: (id: string) => `/webhooks/${id}`,
    getStats: () => '/gateway/stats',
  },
  billing: {
    currentSubscription: () => '/billing/current-subscription',
    checkout: () => '/billing/checkout',
    changePlan: () => '/billing/change-plan',
    plans: () => '/billing/plans',
  },
  support: {
    customerSupport: () => '/support/customer-support',
    requestAccountDeletion: () => '/support/request-account-deletion',
  },
  organizations: {
    currentContext: () => '/organizations/current-context',
    list: () => '/platform/organizations',
    create: () => '/platform/organizations',
    retryProvisioning: (id: string) =>
      `/platform/organizations/${id}/retry-provisioning`,
    profile: (id: string) => `/organizations/${id}/profile`,
    groups: (id: string, includeArchived = false) =>
      `/organizations/${id}/groups${includeArchived ? '?includeArchived=true' : ''}`,
    group: (id: string, groupId: string) =>
      `/organizations/${id}/groups/${groupId}`,
    groupName: (id: string, groupId: string) =>
      `/organizations/${id}/groups/${groupId}/name`,
    groupJoinSettings: (id: string, groupId: string) =>
      `/organizations/${id}/groups/${groupId}/join-settings`,
    archiveGroup: (id: string, groupId: string) =>
      `/organizations/${id}/groups/${groupId}/archive`,
    reactivateGroup: (id: string, groupId: string) =>
      `/organizations/${id}/groups/${groupId}/reactivate`,
    groupOwner: (id: string, groupId: string, membershipId: string) =>
      `/organizations/${id}/groups/${groupId}/owners/${membershipId}`,
    roster: (id: string, groupId: string, search = '') =>
      `/organizations/${id}/groups/${groupId}/roster${search ? `?search=${encodeURIComponent(search)}` : ''}`,
    rosterMember: (id: string, groupId: string, membershipId: string) =>
      `/organizations/${id}/groups/${groupId}/roster/${membershipId}`,
    contactName: (id: string, groupId: string, contactId: string) =>
      `/organizations/${id}/groups/${groupId}/contacts/${contactId}/name`,
    rosterBulkPreview: (id: string, groupId: string) =>
      `/organizations/${id}/groups/${groupId}/roster-bulk/preview`,
    rosterBulkImport: (id: string, groupId: string, previewId: string) =>
      `/organizations/${id}/groups/${groupId}/roster-bulk/${previewId}`,
    rosterBulkApply: (id: string, groupId: string, previewId: string) =>
      `/organizations/${id}/groups/${groupId}/roster-bulk/${previewId}/apply`,
    receivingNumbers: (id: string) => `/organizations/${id}/receiving-numbers`,
    operators: (id: string) => `/organizations/${id}/operators`,
    codeAvailability: (id: string, receivingNumberId: string, code: string, excludeGroupId?: string) =>
      `/organizations/${id}/groups/join-code-availability?receivingNumberId=${encodeURIComponent(receivingNumberId)}&code=${encodeURIComponent(code)}${excludeGroupId ? `&excludeGroupId=${encodeURIComponent(excludeGroupId)}` : ''}`,
  },
}
