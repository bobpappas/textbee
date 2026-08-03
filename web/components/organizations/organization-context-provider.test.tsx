import { useState } from 'react'
import { QueryClient } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ApiEndpoints } from '@/config/api'
import { API_BASE_URL, mockOrganizationContext } from '@/test/fixtures'
import { server } from '@/test/msw/server'
import { TestProviders } from '@/test/render'
import { queryKeys } from '@/lib/api/query-keys'
import OrganizationContextProvider, {
  freshOrganizationContext,
  useOrganizationContext,
} from './organization-context-provider'
import { visibleNavItems } from '@/app/(app)/dashboard/(components)/nav-items'
import { visibleSearchEntries } from '@/app/(app)/dashboard/(components)/search/search-registry'

const url = (path: string) => `${API_BASE_URL}${path}`

function Probe() {
  const context = useOrganizationContext()
  const [, renderCount] = useState(0)
  if (context.isFetching) {
    return <p>Loading fresh organization context</p>
  }
  return (
    <div>
      <p>
        {context.data?.state === 'ACTIVE'
          ? context.data.organization.displayName
          : context.data?.state}
      </p>
      <button
        type="button"
        onClick={() => {
          void context.refetch().then(() => renderCount((count) => count + 1))
        }}
      >
        Refresh context
      </button>
    </div>
  )
}

function NavigationProbe() {
  const context = useOrganizationContext()
  const freshContext = freshOrganizationContext(context)
  const navigation = visibleNavItems('REGULAR', freshContext)
  const search = visibleSearchEntries('REGULAR', freshContext)

  return (
    <div>
      <p>{context.isError ? 'Context failed' : 'Context available'}</p>
      <p>
        {navigation.some((item) => item.label === 'Organization profile')
          ? 'Navigation profile available'
          : 'Navigation profile unavailable'}
      </p>
      <p>
        {search.some((item) => item.label === 'Organization profile')
          ? 'Search profile available'
          : 'Search profile unavailable'}
      </p>
      <button type="button" onClick={() => context.refetch()}>
        Refresh context
      </button>
    </div>
  )
}

describe('OrganizationContextProvider', () => {
  it('hides stale identity while refreshing and clears profile cache after revocation', async () => {
    let revoked = false
    server.use(
      http.get(url(ApiEndpoints.organizations.currentContext()), async () => {
        if (revoked) {
          await new Promise((resolve) => setTimeout(resolve, 50))
          return HttpResponse.json({
            data: {
              state: 'NO_ACCESS',
              organization: null,
              membership: null,
              capabilities: [],
              roleLabel: null,
            },
          })
        }
        return HttpResponse.json({ data: mockOrganizationContext })
      }),
    )
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: Infinity },
        mutations: { retry: false },
      },
    })
    queryClient.setQueryData(
      queryKeys.organizationProfile(mockOrganizationContext.organization.id),
      { displayName: mockOrganizationContext.organization.displayName },
    )

    render(
      <TestProviders queryClient={queryClient}>
        <OrganizationContextProvider enabled>
          <Probe />
        </OrganizationContextProvider>
      </TestProviders>,
    )

    expect(
      await screen.findByText('Boise Church of Christ'),
    ).toBeInTheDocument()
    revoked = true
    fireEvent.click(screen.getByRole('button', { name: 'Refresh context' }))
    expect(
      await screen.findByText('Loading fresh organization context'),
    ).toBeInTheDocument()
    expect(screen.queryByText('Boise Church of Christ')).not.toBeInTheDocument()
    expect(await screen.findByText('NO_ACCESS')).toBeInTheDocument()
    await waitFor(() =>
      expect(
        queryClient.getQueryData(
          queryKeys.organizationProfile(
            mockOrganizationContext.organization.id,
          ),
        ),
      ).toBeUndefined(),
    )
  })

  it('hides cached organization navigation after a failed refetch', async () => {
    let refetchFails = false
    server.use(
      http.get(url(ApiEndpoints.organizations.currentContext()), () => {
        if (refetchFails) {
          return new HttpResponse(null, { status: 503 })
        }
        return HttpResponse.json({ data: mockOrganizationContext })
      }),
    )
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: Infinity },
        mutations: { retry: false },
      },
    })

    render(
      <TestProviders queryClient={queryClient}>
        <OrganizationContextProvider enabled>
          <NavigationProbe />
        </OrganizationContextProvider>
      </TestProviders>,
    )

    expect(
      await screen.findByText('Navigation profile available'),
    ).toBeInTheDocument()
    expect(screen.getByText('Search profile available')).toBeInTheDocument()

    refetchFails = true
    fireEvent.click(screen.getByRole('button', { name: 'Refresh context' }))

    expect(await screen.findByText('Context failed')).toBeInTheDocument()
    expect(
      screen.getByText('Navigation profile unavailable'),
    ).toBeInTheDocument()
    expect(screen.getByText('Search profile unavailable')).toBeInTheDocument()
    expect(
      queryClient.getQueryData(queryKeys.organizationContext),
    ).toEqual(mockOrganizationContext)
  })
})
