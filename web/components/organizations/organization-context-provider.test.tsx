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
  useOrganizationContext,
} from './organization-context-provider'

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
})
