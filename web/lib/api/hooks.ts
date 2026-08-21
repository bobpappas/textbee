import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationOptions,
  type UseQueryOptions,
} from '@tanstack/react-query'
import httpBrowserClient from '@/lib/httpBrowserClient'
import { ApiEndpoints } from '@/config/api'
import { queryKeys } from './query-keys'
import { useActiveOrganizationId } from '../organization-scope'
import {
  cacheDependencies,
  invalidateCacheDependencies,
} from './cache-dependencies'
import type {
  ApiKey,
  ApiKeyStatusFilter,
  Device,
  GatewayStats,
  Plan,
  Subscription,
  User,
  WebhookNotification,
  WebhookSubscription,
  OrganizationCreationResult,
  OrganizationProfile,
  OrganizationRegistryItem,
  OrganizationContext,
  OrganizationGroup,
  OrganizationOperator,
  ReceivingNumber,
  RosterBulkImport,
  RosterMember,
  ContactDetails,
  GroupMessagePreview,
  GroupMessageSend,
} from './types'

// Most endpoints wrap their payload as { data: ... }; a few (subscription)
// return the object directly. These helpers keep the unwrapping in one place.
const unwrapData = <T>(res: { data: { data: T } }) => res.data.data
const unwrapBody = <T>(res: { data: T }) => res.data

type QueryOpts<T> = Omit<UseQueryOptions<T>, 'queryKey' | 'queryFn'>

// List endpoints return { data: T[] }. Legacy (not-yet-migrated) components
// cache that raw envelope under the same query key, so these hooks must keep
// the raw shape in the cache and unwrap per-observer via `select` to avoid a
// cache-shape collision on shared keys like ['devices'] and ['webhooks'].
type ListEnvelope<T> = { data: T[] }
type ListQueryOpts<T> = Omit<
  UseQueryOptions<ListEnvelope<T>, Error, T[]>,
  'queryKey' | 'queryFn' | 'select'
>
const selectList = <T>(raw: ListEnvelope<T> | undefined): T[] => raw?.data ?? []

export const uniqueByServerId = <T extends { _id?: string }>(rows: T[]) => {
  const seen = new Set<string>()
  return rows.filter((row) => {
    if (!row._id) return true
    if (seen.has(row._id)) return false
    seen.add(row._id)
    return true
  })
}

type MutationOpts<TData, TVars> = Omit<
  UseMutationOptions<TData, Error, TVars>,
  'mutationFn'
>

// ---------- account ----------

export function useCurrentUser(options?: QueryOpts<User>) {
  return useQuery({
    queryKey: queryKeys.currentUser,
    queryFn: ({ signal }) =>
      httpBrowserClient
        .get(ApiEndpoints.auth.whoAmI(), { signal })
        .then(unwrapData<User>),
    ...options,
  })
}

// ---------- billing ----------

export function useSubscription(options?: QueryOpts<Subscription>) {
  const organizationId = useActiveOrganizationId() ?? ''
  return useQuery({
    queryKey: queryKeys.subscription(organizationId),
    queryFn: ({ signal }) =>
      httpBrowserClient
        .get(ApiEndpoints.billing.currentSubscription(), { signal })
        .then(unwrapBody<Subscription>),
    ...options,
    enabled: Boolean(organizationId) && (options?.enabled ?? true),
  })
}

export function useBillingPlans(options?: ListQueryOpts<Plan>) {
  return useQuery({
    queryKey: queryKeys.billingPlans,
    queryFn: ({ signal }) =>
      httpBrowserClient
        .get(ApiEndpoints.billing.plans(), { signal })
        .then((r) => r.data as ListEnvelope<Plan>),
    select: selectList<Plan>,
    ...options,
  })
}

// ---------- gateway ----------

export function useGatewayStats(options?: QueryOpts<GatewayStats>) {
  const organizationId = useActiveOrganizationId() ?? ''
  return useQuery({
    queryKey: queryKeys.stats(organizationId),
    queryFn: ({ signal }) =>
      httpBrowserClient
        .get(ApiEndpoints.gateway.getStats(), { signal })
        .then(unwrapData<GatewayStats>),
    ...options,
    enabled: Boolean(organizationId) && (options?.enabled ?? true),
  })
}

export function useDevices(options?: ListQueryOpts<Device>) {
  const organizationId = useActiveOrganizationId() ?? ''
  return useQuery({
    queryKey: queryKeys.devices(organizationId),
    queryFn: ({ signal }) =>
      httpBrowserClient
        .get(ApiEndpoints.gateway.listDevices(), { signal })
        .then((r) => r.data as ListEnvelope<Device>),
    select: selectList<Device>,
    ...options,
    enabled: Boolean(organizationId) && (options?.enabled ?? true),
  })
}

export function useDeleteDevice() {
  const queryClient = useQueryClient()
  const organizationId = useActiveOrganizationId() ?? ''
  return useMutation({
    mutationFn: (id: string) =>
      httpBrowserClient.delete(ApiEndpoints.gateway.deleteDevice(id)),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.devices(organizationId),
      })
    },
  })
}

// ---------- api keys ----------

export function useApiKeys(
  status: ApiKeyStatusFilter = 'active',
  options?: ListQueryOpts<ApiKey>,
) {
  const organizationId = useActiveOrganizationId() ?? ''
  return useQuery({
    queryKey: queryKeys.apiKeys(organizationId, status),
    queryFn: ({ signal }) =>
      httpBrowserClient
        .get(ApiEndpoints.auth.listApiKeys(status), { signal })
        .then((r) => r.data as ListEnvelope<ApiKey>),
    select: selectList<ApiKey>,
    ...options,
    enabled: Boolean(organizationId) && (options?.enabled ?? true),
  })
}

export function useRevokeApiKey() {
  const queryClient = useQueryClient()
  const organizationId = useActiveOrganizationId() ?? ''
  return useMutation({
    mutationFn: (id: string) =>
      httpBrowserClient.post(ApiEndpoints.auth.revokeApiKey(id)),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.apiKeysAll(organizationId),
      })
    },
  })
}

export function useDeleteApiKey() {
  const queryClient = useQueryClient()
  const organizationId = useActiveOrganizationId() ?? ''
  return useMutation({
    mutationFn: (id: string) =>
      httpBrowserClient.delete(ApiEndpoints.auth.deleteApiKey(id)),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.apiKeysAll(organizationId),
      })
    },
  })
}

export function useRenameApiKey() {
  const queryClient = useQueryClient()
  const organizationId = useActiveOrganizationId() ?? ''
  return useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      httpBrowserClient.patch(ApiEndpoints.auth.renameApiKey(id), { name }),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.apiKeysAll(organizationId),
      })
    },
  })
}

// A new key changes the list, the dashboard counts and the device pairing
// state, so all three refresh together.
export function useGenerateApiKey() {
  const queryClient = useQueryClient()
  const organizationId = useActiveOrganizationId() ?? ''
  return useMutation({
    mutationFn: () =>
      httpBrowserClient
        .post(ApiEndpoints.auth.generateApiKey())
        .then((res) => res.data as { data: string }),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.apiKeysAll(organizationId),
      })
      void queryClient.invalidateQueries({
        queryKey: queryKeys.stats(organizationId),
      })
      void queryClient.invalidateQueries({
        queryKey: queryKeys.devices(organizationId),
      })
    },
  })
}

// ---------- account ----------

export type UpdateProfilePayload = { name?: string; phone?: string }

export function useUpdateProfile(
  options?: MutationOpts<unknown, UpdateProfilePayload>,
) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: UpdateProfilePayload) =>
      httpBrowserClient.patch(ApiEndpoints.auth.updateProfile(), data),
    ...options,
    // Composed, not overridden: a caller passing onSuccess must not silently
    // drop the invalidation this hook exists to guarantee.
    onSuccess: (...args) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.currentUser })
      options?.onSuccess?.(...args)
    },
  })
}

export type ChangePasswordPayload = {
  oldPassword: string
  newPassword: string
  confirmPassword?: string
}

export function useChangePassword(
  options?: MutationOpts<unknown, ChangePasswordPayload>,
) {
  return useMutation({
    mutationFn: (data: ChangePasswordPayload) =>
      httpBrowserClient.post(ApiEndpoints.auth.changePassword(), data),
    ...options,
  })
}

export function useSendEmailVerification() {
  return useMutation({
    mutationFn: () =>
      httpBrowserClient.post(ApiEndpoints.auth.sendEmailVerificationEmail()),
  })
}

export function useVerifyEmail() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: { userId: string; verificationCode: string }) =>
      httpBrowserClient.post(ApiEndpoints.auth.verifyEmail(), payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.currentUser })
    },
  })
}

export type UpdateOnboardingPayload = {
  skipStepId?: string
  complete?: boolean
  currentStepId?: string
}

export function useUpdateOnboarding() {
  const queryClient = useQueryClient()
  const organizationId = useActiveOrganizationId() ?? ''
  return useMutation({
    mutationFn: (body: UpdateOnboardingPayload) =>
      httpBrowserClient
        .patch(ApiEndpoints.auth.updateOnboarding(), body)
        .then((r) => r.data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.currentUser })
      void queryClient.invalidateQueries({
        queryKey: queryKeys.stats(organizationId),
      })
      void queryClient.invalidateQueries({
        queryKey: queryKeys.subscription(organizationId),
      })
    },
  })
}

// ---------- webhooks ----------

export function useWebhooks(options?: ListQueryOpts<WebhookSubscription>) {
  const organizationId = useActiveOrganizationId() ?? ''
  return useQuery({
    queryKey: queryKeys.webhooks(organizationId),
    queryFn: ({ signal }) =>
      httpBrowserClient
        .get(ApiEndpoints.gateway.getWebhooks(), { signal })
        .then((r) => r.data as ListEnvelope<WebhookSubscription>),
    select: selectList<WebhookSubscription>,
    ...options,
    enabled: Boolean(organizationId) && (options?.enabled ?? true),
  })
}

export type WebhookInput = {
  name?: string
  deliveryUrl: string
  events: string[]
  isActive: boolean
  signingSecret: string
}

// All four webhook mutations invalidate the same list, so the key lives here
// once rather than being retyped in each dialog.
const invalidateWebhooks = (
  queryClient: ReturnType<typeof useQueryClient>,
  organizationId: string,
) =>
  void queryClient.invalidateQueries({
    queryKey: queryKeys.webhooks(organizationId),
  })

export function useCreateWebhook() {
  const queryClient = useQueryClient()
  const organizationId = useActiveOrganizationId() ?? ''
  return useMutation({
    mutationFn: (values: WebhookInput) =>
      httpBrowserClient.post(ApiEndpoints.gateway.createWebhook(), values),
    onSuccess: () => invalidateWebhooks(queryClient, organizationId),
  })
}

export function useUpdateWebhook(id: string) {
  const queryClient = useQueryClient()
  const organizationId = useActiveOrganizationId() ?? ''
  return useMutation({
    mutationFn: (values: Partial<WebhookInput>) =>
      httpBrowserClient.patch(ApiEndpoints.gateway.updateWebhook(id), values),
    onSuccess: () => invalidateWebhooks(queryClient, organizationId),
  })
}

export function useDeleteWebhook(id: string) {
  const queryClient = useQueryClient()
  const organizationId = useActiveOrganizationId() ?? ''
  return useMutation({
    mutationFn: () =>
      httpBrowserClient.delete(ApiEndpoints.gateway.deleteWebhook(id)),
    onSuccess: () => invalidateWebhooks(queryClient, organizationId),
  })
}

// ---------- organizations ----------

export function useOrganizationContextQuery(
  options?: QueryOpts<OrganizationContext>,
) {
  return useQuery({
    queryKey: queryKeys.organizationContext,
    queryFn: ({ signal }) =>
      httpBrowserClient
        .get(ApiEndpoints.organizations.currentContext(), { signal })
        .then(unwrapData<OrganizationContext>),
    staleTime: 0,
    refetchOnMount: 'always',
    ...options,
  })
}

export function useOrganizations(
  options?: ListQueryOpts<OrganizationRegistryItem>,
) {
  return useQuery({
    queryKey: queryKeys.organizations,
    queryFn: ({ signal }) =>
      httpBrowserClient
        .get(ApiEndpoints.organizations.list(), { signal })
        .then((r) => r.data as ListEnvelope<OrganizationRegistryItem>),
    select: selectList<OrganizationRegistryItem>,
    ...options,
  })
}

export function useCreateOrganization() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      displayName,
      idempotencyKey,
    }: {
      displayName: string
      idempotencyKey: string
    }) =>
      httpBrowserClient
        .post(
          ApiEndpoints.organizations.create(),
          { displayName },
          { headers: { 'Idempotency-Key': idempotencyKey } },
        )
        .then(unwrapData<OrganizationCreationResult>),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.organizations })
      void queryClient.invalidateQueries({
        queryKey: queryKeys.organizationContext,
      })
    },
  })
}

export function useRetryOrganizationProvisioning() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (organizationId: string) =>
      httpBrowserClient
        .post(ApiEndpoints.organizations.retryProvisioning(organizationId))
        .then(unwrapData<OrganizationCreationResult>),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.organizations })
    },
  })
}

export function useOrganizationProfile(
  organizationId: string,
  options?: QueryOpts<OrganizationProfile>,
) {
  return useQuery({
    queryKey: queryKeys.organizationProfile(organizationId),
    queryFn: ({ signal }) =>
      httpBrowserClient
        .get(ApiEndpoints.organizations.profile(organizationId), { signal })
        .then(unwrapData<OrganizationProfile>),
    enabled: Boolean(organizationId),
    ...options,
  })
}

export function useRenameOrganization(organizationId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ displayName }: { displayName: string }) =>
      httpBrowserClient
        .patch(ApiEndpoints.organizations.profile(organizationId), {
          displayName,
        })
        .then(unwrapData<OrganizationProfile>),
    onSuccess: (profile) => {
      queryClient.setQueryData(
        queryKeys.organizationProfile(organizationId),
        profile,
      )
      queryClient.setQueryData<ListEnvelope<OrganizationRegistryItem>>(
        queryKeys.organizations,
        (current) =>
          current
            ? {
                ...current,
                data: current.data.map((organization) =>
                  organization.id === organizationId
                    ? { ...organization, displayName: profile.displayName }
                    : organization,
                ),
              }
            : current,
      )
      queryClient.setQueryData<OrganizationContext>(
        queryKeys.organizationContext,
        (current) =>
          current?.state === 'ACTIVE' &&
          current.organization.id === organizationId
            ? {
                ...current,
                organization: {
                  ...current.organization,
                  displayName: profile.displayName,
                },
              }
            : current,
      )
      void invalidateCacheDependencies(
        queryClient,
        cacheDependencies.organizationName(organizationId),
        // The PATCH response is already server-authoritative and has updated
        // every mounted display surface above. Mark the dependencies stale for
        // their next normal refresh without briefly tearing down the active
        // organization scope and discarding the success confirmation.
        'none',
      )
    },
  })
}

// ---------- organization groups ----------

const invalidateGroupData = (
  queryClient: ReturnType<typeof useQueryClient>,
  organizationId: string,
  groupId?: string,
) => {
  void queryClient.invalidateQueries({
    queryKey: queryKeys.groupsAll(organizationId),
  })
  if (groupId) {
    void queryClient.invalidateQueries({
      queryKey: queryKeys.group(organizationId, groupId),
    })
  }
}

export function useGroups(
  organizationId: string,
  includeArchived = false,
  options?: QueryOpts<OrganizationGroup[]>,
) {
  return useQuery({
    queryKey: queryKeys.groups(organizationId, includeArchived),
    queryFn: ({ signal }) =>
      httpBrowserClient
        .get(ApiEndpoints.organizations.groups(organizationId, includeArchived), {
          signal,
        })
        .then(unwrapData<OrganizationGroup[]>),
    enabled: Boolean(organizationId),
    ...options,
  })
}

export function useGroup(
  organizationId: string,
  groupId: string,
  options?: QueryOpts<OrganizationGroup>,
) {
  return useQuery({
    queryKey: queryKeys.group(organizationId, groupId),
    queryFn: ({ signal }) =>
      httpBrowserClient
        .get(ApiEndpoints.organizations.group(organizationId, groupId), {
          signal,
        })
        .then(unwrapData<OrganizationGroup>),
    enabled: Boolean(organizationId && groupId),
    ...options,
  })
}

export function usePreviewGroupMessage(organizationId: string, groupId: string) {
  return useMutation({
    mutationFn: (body: string) =>
      httpBrowserClient
        .post(ApiEndpoints.organizations.groupMessagePreview(organizationId, groupId), { body })
        .then(unwrapData<GroupMessagePreview>),
  })
}

export function useConfirmGroupMessage(organizationId: string, groupId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ previewId, requestId }: { previewId: string; requestId: string }) =>
      httpBrowserClient
        .post(
          ApiEndpoints.organizations.groupMessageConfirm(organizationId, groupId, previewId),
          {},
          { headers: { 'X-Request-Id': requestId } },
        )
        .then(unwrapData<GroupMessageSend>),
    onSuccess: () => {
      void invalidateCacheDependencies(
        queryClient,
        cacheDependencies.acceptedSend(organizationId),
      )
    },
  })
}

export function useReceivingNumbers(organizationId: string) {
  return useQuery({
    queryKey: queryKeys.receivingNumbers(organizationId),
    queryFn: ({ signal }) =>
      httpBrowserClient
        .get(ApiEndpoints.organizations.receivingNumbers(organizationId), {
          signal,
        })
        .then(unwrapData<ReceivingNumber[]>),
    enabled: Boolean(organizationId),
  })
}

export function useOrganizationOperators(
  organizationId: string,
  enabled = true,
) {
  return useQuery({
    queryKey: queryKeys.organizationOperators(organizationId),
    queryFn: ({ signal }) =>
      httpBrowserClient
        .get(ApiEndpoints.organizations.operators(organizationId), { signal })
        .then(unwrapData<OrganizationOperator[]>),
    enabled: Boolean(organizationId) && enabled,
  })
}

const invalidateOperators = (
  queryClient: ReturnType<typeof useQueryClient>,
  organizationId: string,
) => {
  void queryClient.invalidateQueries({
    queryKey: queryKeys.organizationOperators(organizationId),
  })
  void queryClient.invalidateQueries({ queryKey: queryKeys.organizationContext })
}

const invalidateGroupRoleData = (
  queryClient: ReturnType<typeof useQueryClient>,
  organizationId: string,
  groupId: string,
) => {
  void invalidateCacheDependencies(
    queryClient,
    cacheDependencies.groupSummary(organizationId, groupId),
  )
}

export function useAddOrganizationOperator(organizationId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { email: string; reason: string }) =>
      httpBrowserClient.post(ApiEndpoints.organizations.operators(organizationId), input),
    onSuccess: () => invalidateOperators(queryClient, organizationId),
  })
}

export function useChangeOrganizationOperatorStatus(organizationId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ membershipId, status, reason }: {
      membershipId: string
      status: 'ACTIVE' | 'SUSPENDED' | 'REVOKED'
      reason: string
    }) => httpBrowserClient.patch(
      ApiEndpoints.organizations.operatorStatus(organizationId, membershipId),
      { status, reason },
    ),
    onSuccess: () => invalidateOperators(queryClient, organizationId),
  })
}

export function useChangeOrganizationAdmin(organizationId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ membershipId, enabled, reason }: {
      membershipId: string
      enabled: boolean
      reason: string
    }) => httpBrowserClient.patch(
      ApiEndpoints.organizations.operatorAdmin(organizationId, membershipId),
      { enabled, reason },
    ),
    onSuccess: () => invalidateOperators(queryClient, organizationId),
  })
}

export type GroupInput = {
  displayName: string
  joinCode: string
  receivingNumberId: string
  ownerMembershipIds?: string[]
}

export function useCreateGroup(organizationId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: GroupInput) =>
      httpBrowserClient
        .post(ApiEndpoints.organizations.groups(organizationId), input)
        .then(unwrapData<OrganizationGroup>),
    onSuccess: () => {
      void invalidateCacheDependencies(
        queryClient,
        cacheDependencies.groupSummary(organizationId),
      )
    },
  })
}

export function useRenameGroup(organizationId: string, groupId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (displayName: string) =>
      httpBrowserClient
        .patch(ApiEndpoints.organizations.groupName(organizationId, groupId), {
          displayName,
        })
        .then(unwrapData<OrganizationGroup>),
    onSuccess: () =>
      invalidateGroupRoleData(queryClient, organizationId, groupId),
  })
}

export function useChangeGroupJoinSettings(
  organizationId: string,
  groupId: string,
) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { joinCode: string; receivingNumberId: string }) =>
      httpBrowserClient
        .patch(
          ApiEndpoints.organizations.groupJoinSettings(organizationId, groupId),
          input,
        )
        .then(unwrapData<OrganizationGroup>),
    onSuccess: () => invalidateGroupData(queryClient, organizationId, groupId),
  })
}

export function useArchiveGroup(organizationId: string, groupId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (reason: string) =>
      httpBrowserClient
        .post(ApiEndpoints.organizations.archiveGroup(organizationId, groupId), {
          reason,
        })
        .then(unwrapData<OrganizationGroup>),
    onSuccess: () => invalidateGroupData(queryClient, organizationId, groupId),
  })
}

export function useReactivateGroup(organizationId: string, groupId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () =>
      httpBrowserClient
        .post(ApiEndpoints.organizations.reactivateGroup(organizationId, groupId))
        .then(unwrapData<OrganizationGroup>),
    onSuccess: () => invalidateGroupData(queryClient, organizationId, groupId),
  })
}

export function useAssignGroupOwner(organizationId: string, groupId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (membershipId: string) =>
      httpBrowserClient
        .post(
          ApiEndpoints.organizations.groupOwner(
            organizationId,
            groupId,
            membershipId,
          ),
        )
        .then(unwrapData<OrganizationGroup>),
    onSuccess: () =>
      invalidateGroupRoleData(queryClient, organizationId, groupId),
  })
}

export function useRevokeGroupOwner(organizationId: string, groupId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ membershipId, reason }: { membershipId: string; reason: string }) =>
      httpBrowserClient
        .delete(
          ApiEndpoints.organizations.groupOwner(
            organizationId,
            groupId,
            membershipId,
          ),
          { data: { reason } },
        )
        .then(unwrapData<OrganizationGroup>),
    onSuccess: () =>
      invalidateGroupRoleData(queryClient, organizationId, groupId),
  })
}

export function useAssignGroupSender(organizationId: string, groupId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (membershipId: string) =>
      httpBrowserClient
        .post(ApiEndpoints.organizations.groupSender(organizationId, groupId, membershipId))
        .then(unwrapData<OrganizationGroup>),
    onSuccess: () =>
      invalidateGroupRoleData(queryClient, organizationId, groupId),
  })
}

export function useRevokeGroupSender(organizationId: string, groupId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ membershipId, reason }: { membershipId: string; reason: string }) =>
      httpBrowserClient
        .delete(
          ApiEndpoints.organizations.groupSender(organizationId, groupId, membershipId),
          { data: { reason } },
        )
        .then(unwrapData<OrganizationGroup>),
    onSuccess: () =>
      invalidateGroupRoleData(queryClient, organizationId, groupId),
  })
}

export function useRoster(
  organizationId: string,
  groupId: string,
  search = '',
  enabled = true,
) {
  return useQuery({
    queryKey: queryKeys.roster(organizationId, groupId, search),
    queryFn: ({ signal }) =>
      httpBrowserClient
        .get(ApiEndpoints.organizations.roster(organizationId, groupId, search), {
          signal,
        })
        .then(unwrapData<RosterMember[]>),
    enabled: Boolean(organizationId && groupId) && enabled,
  })
}

export function useAddRosterMember(organizationId: string, groupId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { displayName: string; mobileNumber: string; consentAffirmed: boolean; consentMethodNote?: string }) =>
      httpBrowserClient
        .post(ApiEndpoints.organizations.roster(organizationId, groupId), input)
        .then(unwrapData<RosterMember>),
    onSuccess: () => invalidateGroupData(queryClient, organizationId, groupId),
  })
}

export function useRenameContact(organizationId: string, groupId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ contactId, displayName }: { contactId: string; displayName: string }) =>
      httpBrowserClient
        .patch(ApiEndpoints.organizations.contactName(organizationId, groupId, contactId), { displayName })
        .then(unwrapData<RosterMember>),
    onSuccess: () => invalidateGroupData(queryClient, organizationId, groupId),
  })
}

export function useContactDetails(
  organizationId: string,
  groupId: string,
  contactId: string,
  enabled = true,
) {
  return useQuery({
    queryKey: queryKeys.contactDetails(organizationId, groupId, contactId),
    queryFn: ({ signal }) =>
      httpBrowserClient
        .get(
          ApiEndpoints.organizations.contactDetails(
            organizationId,
            groupId,
            contactId,
          ),
          { signal },
        )
        .then(unwrapData<ContactDetails>),
    enabled: Boolean(organizationId && groupId && contactId) && enabled,
  })
}

export function useRecordContactConsent(
  organizationId: string,
  groupId: string,
) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      contactId,
      affirmed,
      methodNote,
    }: {
      contactId: string
      affirmed: boolean
      methodNote?: string
    }) =>
      httpBrowserClient
        .post(
          ApiEndpoints.organizations.contactConsent(
            organizationId,
            groupId,
            contactId,
          ),
          { affirmed, methodNote },
        )
        .then(unwrapData<ContactDetails>),
    onSuccess: () => invalidateGroupData(queryClient, organizationId, groupId),
  })
}

export function usePreviewRosterBulkAdd(organizationId: string, groupId: string) {
  return useMutation({
    mutationFn: (csvContent: string) =>
      httpBrowserClient
        .post(ApiEndpoints.organizations.rosterBulkPreview(organizationId, groupId), { csvContent })
        .then(unwrapData<RosterBulkImport>),
  })
}

export function useApplyRosterBulkAdd(organizationId: string, groupId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (previewId: string) =>
      httpBrowserClient
        .post(ApiEndpoints.organizations.rosterBulkApply(organizationId, groupId, previewId), { consentAffirmed: true })
        .then(unwrapData<RosterBulkImport>),
    onSuccess: () => invalidateGroupData(queryClient, organizationId, groupId),
  })
}

export function useRemoveRosterMember(
  organizationId: string,
  groupId: string,
) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ membershipId, reason }: { membershipId: string; reason: string }) =>
      httpBrowserClient.delete(
        ApiEndpoints.organizations.rosterMember(
          organizationId,
          groupId,
          membershipId,
        ),
        { data: { reason } },
      ),
    onSuccess: () => invalidateGroupData(queryClient, organizationId, groupId),
  })
}

export type WebhookNotificationFilters = {
  eventType?: string
  status?: string
  deviceId?: string
  webhookSubscriptionId?: string
  start?: string
  end?: string
  page?: number
  limit?: number
}

// Raw body: { data: { data: rows[], meta: { totalPages, ... } } }
export type WebhookNotificationsEnvelope = {
  data?: {
    data?: WebhookNotification[]
    meta?: { totalPages?: number; total?: number }
  }
}

export function useWebhookNotifications(filters: WebhookNotificationFilters) {
  const organizationId = useActiveOrganizationId() ?? ''
  const {
    eventType = '',
    status = '',
    deviceId = '',
    webhookSubscriptionId = '',
    start = '',
    end = '',
    page = 1,
    limit = 10,
  } = filters
  const canonicalFilters = {
    eventType,
    status,
    deviceId,
    webhookSubscriptionId,
    start,
    end,
    page,
    limit,
  }
  return useQuery({
    queryKey: queryKeys.webhookNotifications(
      organizationId,
      canonicalFilters,
    ),
    queryFn: ({ signal }) =>
      httpBrowserClient
        .get(
          `${ApiEndpoints.gateway.getWebhookNotifications()}?eventType=${eventType}&page=${page}&limit=${limit}&status=${status}&start=${start}&end=${end}&deviceId=${deviceId}&webhookSubscriptionId=${webhookSubscriptionId}`,
          { signal },
        )
        .then(unwrapBody<WebhookNotificationsEnvelope>)
        .then((envelope) => ({
          ...envelope,
          data: envelope.data
            ? {
                ...envelope.data,
                data: uniqueByServerId(envelope.data.data ?? []),
              }
            : envelope.data,
        })),
    // Deliveries arrive from outside the tab, so stay fresher than the 60s
    // client-wide default.
    staleTime: 15_000,
    enabled: Boolean(organizationId),
    refetchInterval: 15_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  })
}

// ---------- messaging ----------

// Matches the zod-inferred SendSmsFormData shape; validation happens via the
// schema before the payload reaches here.
export type SendSmsPayload = {
  // Required: it goes into the request path, so an absent one would POST to
  // /gateway/devices/undefined/send-sms. Both callers validate it first.
  deviceId: string
  recipients?: string[]
  message?: string
  simSubscriptionId?: number
}

export function useSendSms() {
  const queryClient = useQueryClient()
  const organizationId = useActiveOrganizationId() ?? ''
  return useMutation({
    mutationKey: ['send-sms'],
    mutationFn: (data: SendSmsPayload) =>
      httpBrowserClient.post(ApiEndpoints.gateway.sendSMS(data.deviceId), data),
    onSuccess: (_response, data) => {
      void invalidateCacheDependencies(
        queryClient,
        cacheDependencies.acceptedSend(organizationId, [data.deviceId]),
      )
    },
  })
}

export type DeviceMessagesParams = {
  type?: string
  page?: number
  limit?: number
  search?: string
}

export type DeviceMessagesEnvelope = {
  data: unknown[]
  meta?: { page?: number; limit?: number; total?: number; totalPages?: number }
}

// Returns the raw { data, meta } message-history envelope for a device.
// `search` is handled server-side (gateway getMessages matches it against the
// message body, recipient and sender), so it searches all of a device's
// history rather than only the page already loaded.
export function useDeviceMessages(
  deviceId: string,
  params: DeviceMessagesParams = {},
  options?: QueryOpts<DeviceMessagesEnvelope>,
) {
  const organizationId = useActiveOrganizationId() ?? ''
  const { type = 'all', page = 1, limit = 20, search = '' } = params
  return useQuery({
    // search joins the key so each term caches separately.
    queryKey: queryKeys.deviceMessages(organizationId, deviceId, {
      type,
      page,
      limit,
      search,
    }),
    queryFn: ({ signal }) => {
      const query = new URLSearchParams({
        type,
        page: String(page),
        limit: String(limit),
      })
      if (search) query.set('search', search)

      return httpBrowserClient
        .get(`${ApiEndpoints.gateway.getMessages(deviceId)}?${query}`, {
          signal,
        })
        .then(unwrapBody<DeviceMessagesEnvelope>)
        .then((envelope) => ({
          ...envelope,
          data: uniqueByServerId(
            envelope.data as Array<{ _id?: string }>,
          ),
        }))
    },
    // Inbound messages arrive from outside the tab, so stay fresher than the
    // 60s client-wide default. Before ...options so callers can override.
    staleTime: 15_000,
    refetchInterval: 15_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    ...options,
    enabled:
      Boolean(organizationId && deviceId) && (options?.enabled ?? true),
  })
}
