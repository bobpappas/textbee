import { describe, expect, it, beforeEach } from 'vitest'
import { render, renderHook, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { QueryClient } from '@tanstack/react-query'
import { server } from '@/test/msw/server'
import { TestProviders } from '@/test/render'
import {
  API_BASE_URL,
  mockOrganizationContext,
  mockOrganizationGroups,
} from '@/test/fixtures'
import { ApiEndpoints } from '@/config/api'
import { queryKeys } from './query-keys'
import GenerateApiKey from '@/app/(app)/dashboard/(components)/api-keys/generate-api-key'
import {
  useAssignGroupOwner,
  useAssignGroupSender,
  useRevokeGroupOwner,
  useRevokeGroupSender,
} from './hooks'

const url = (path: string) => `${API_BASE_URL}${path.split('?')[0]}`

type GroupRoleOperation =
  | 'assignOwner'
  | 'revokeOwner'
  | 'assignSender'
  | 'revokeSender'

function useGroupRoleMutation(
  operation: GroupRoleOperation,
  organizationId: string,
  groupId: string,
) {
  const mutations = {
    assignOwner: useAssignGroupOwner(organizationId, groupId),
    revokeOwner: useRevokeGroupOwner(organizationId, groupId),
    assignSender: useAssignGroupSender(organizationId, groupId),
    revokeSender: useRevokeGroupSender(organizationId, groupId),
  }
  return mutations[operation]
}

const groupRoleCases = [
  { operation: 'assignOwner', role: 'owner', action: 'assignment' },
  { operation: 'revokeOwner', role: 'owner', action: 'revocation' },
  { operation: 'assignSender', role: 'sender', action: 'assignment' },
  { operation: 'revokeSender', role: 'sender', action: 'revocation' },
] as const

/**
 * These cover cache bugs that are invisible on inspection: the code looks
 * correct at every individual call site, and only the relationship between
 * sites is wrong. Both shipped to production.
 */
describe('cache invalidation', () => {
  let queryClient: QueryClient

  beforeEach(() => {
    // Not makeTestQueryClient: it sets gcTime 0, which collects any cache
    // entry the moment it has no observer, so priming a cache to assert it
    // gets invalidated would never survive to be asserted on.
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    })
  })

  const renderWith = (ui: React.ReactElement) =>
    render(<TestProviders queryClient={queryClient}>{ui}</TestProviders>)

  // The generate handler invalidated ['apiKeys', 'stats'], a key no query uses.
  // react-query matches by prefix, so it matched neither the key list
  // (['apiKeys', 'active']) nor the dashboard stats (['stats']): generating a
  // key refreshed nothing at all.
  it('generating an API key refreshes both the key list and the stats', async () => {
    server.use(
      http.post(url(ApiEndpoints.auth.generateApiKey()), () =>
        HttpResponse.json({ data: 'new-api-key' })
      )
    )

    // Prime the two caches a new key must invalidate.
    queryClient.setQueryData(
      queryKeys.apiKeys(mockOrganizationContext.organization.id, 'active'),
      { data: [] },
    )
    queryClient.setQueryData(
      queryKeys.stats(mockOrganizationContext.organization.id),
      { totalApiKeyCount: 0 },
    )

    renderWith(<GenerateApiKey />)

    // The trigger and the dialog's confirm button carry the same label, so the
    // confirm has to be scoped to the dialog.
    await userEvent.click(
      screen.getByRole('button', { name: /Generate API Key/i })
    )
    const confirmDialog = await screen.findByRole('dialog', {
      name: /Create new API Key/i,
    })
    await userEvent.click(
      within(confirmDialog).getByRole('button', { name: /Generate API Key/i })
    )

    await waitFor(() => {
      expect(
        queryClient.getQueryState(
          queryKeys.apiKeys(mockOrganizationContext.organization.id, 'active'),
        )?.isInvalidated,
        'the API key list must be invalidated'
      ).toBe(true)
      expect(
        queryClient.getQueryState(
          queryKeys.stats(mockOrganizationContext.organization.id),
        )?.isInvalidated,
        'the dashboard stats must be invalidated'
      ).toBe(true)
    })
  })

  it.each(groupRoleCases)(
    '$role $action refreshes the group and operator summary caches',
    async ({ operation, role }) => {
      const organizationId = mockOrganizationContext.organization.id
      const group = mockOrganizationGroups[0]
      const membershipId = 'membership_role_target'
      const endpoint =
        role === 'owner'
          ? ApiEndpoints.organizations.groupOwner(
              organizationId,
              group.id,
              membershipId,
            )
          : ApiEndpoints.organizations.groupSender(
              organizationId,
              group.id,
              membershipId,
            )
      const response = () => HttpResponse.json({ data: group })
      server.use(
        operation.startsWith('assign')
          ? http.post(url(endpoint), response)
          : http.delete(url(endpoint), response),
      )
      queryClient.setQueryData(
        queryKeys.group(organizationId, group.id),
        group,
      )
      queryClient.setQueryData(
        queryKeys.organizationOperators(organizationId),
        [],
      )

      const { result } = renderHook(
        () => useGroupRoleMutation(operation, organizationId, group.id),
        {
          wrapper: ({ children }) => (
            <TestProviders queryClient={queryClient}>{children}</TestProviders>
          ),
        },
      )
      const input = operation.startsWith('assign')
        ? membershipId
        : { membershipId, reason: 'Approved role change' }
      await result.current.mutateAsync(input as never)

      await waitFor(() => {
        expect(
          queryClient.getQueryState(
            queryKeys.group(organizationId, group.id),
          )?.isInvalidated,
        ).toBe(true)
        expect(
          queryClient.getQueryState(
            queryKeys.organizationOperators(organizationId),
          )?.isInvalidated,
        ).toBe(true)
      })
    },
  )

  it.each(groupRoleCases)(
    'failed $role $action preserves both cached views',
    async ({ operation, role }) => {
      const organizationId = mockOrganizationContext.organization.id
      const group = mockOrganizationGroups[0]
      const membershipId = 'membership_role_target'
      const endpoint =
        role === 'owner'
          ? ApiEndpoints.organizations.groupOwner(
              organizationId,
              group.id,
              membershipId,
            )
          : ApiEndpoints.organizations.groupSender(
              organizationId,
              group.id,
              membershipId,
            )
      const failure = () => new HttpResponse(null, { status: 409 })
      server.use(
        operation.startsWith('assign')
          ? http.post(url(endpoint), failure)
          : http.delete(url(endpoint), failure),
      )
      queryClient.setQueryData(
        queryKeys.group(organizationId, group.id),
        group,
      )
      queryClient.setQueryData(
        queryKeys.organizationOperators(organizationId),
        [],
      )

      const { result } = renderHook(
        () => useGroupRoleMutation(operation, organizationId, group.id),
        {
          wrapper: ({ children }) => (
            <TestProviders queryClient={queryClient}>{children}</TestProviders>
          ),
        },
      )
      const input = operation.startsWith('assign')
        ? membershipId
        : { membershipId, reason: 'Approved role change' }
      await expect(result.current.mutateAsync(input as never)).rejects.toThrow()

      expect(
        queryClient.getQueryState(queryKeys.group(organizationId, group.id))
          ?.isInvalidated,
      ).toBe(false)
      expect(
        queryClient.getQueryState(
          queryKeys.organizationOperators(organizationId),
        )?.isInvalidated,
      ).toBe(false)
    },
  )
})
