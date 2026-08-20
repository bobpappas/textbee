import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import OrganizationContextProvider from '@/components/organizations/organization-context-provider'
import { ApiEndpoints } from '@/config/api'
import { API_BASE_URL, mockOrganizationContext } from '@/test/fixtures'
import { server } from '@/test/msw/server'
import { renderWithProviders, screen, userEvent } from '@/test/render'
import OperatorAccess from './operator-access'

const organizationId = mockOrganizationContext.organization.id
const url = (path: string) => `${API_BASE_URL}${path}`

describe('OperatorAccess', () => {
  it('shows lifecycle and group summaries while protecting the last administrator', async () => {
    server.use(
      http.get(url(ApiEndpoints.organizations.operators(organizationId)), () =>
        HttpResponse.json({
          data: [
            {
              membershipId: mockOrganizationContext.membership.id,
              displayName: 'Alex Rivera',
              email: 'alex@example.test',
              status: 'ACTIVE',
              organizationAdmin: true,
              groupOwners: ['Unified Young Adults'],
              groupSenders: [],
              changedAt: '2026-08-20T12:00:00Z',
            },
          ],
        }),
      ),
    )

    const user = userEvent.setup()
    renderWithProviders(
      <OrganizationContextProvider enabled>
        <OperatorAccess />
      </OrganizationContextProvider>,
    )

    expect(await screen.findByText('alex@example.test')).toBeInTheDocument()
    expect(
      screen.getByText(/Unified Young Adults \(owner\)/),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Revoke administrator' }),
    ).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Suspend' })).toBeDisabled()

    await user.click(screen.getByRole('button', { name: 'Add operator' }))
    expect(screen.getByText(/starts with no permissions/i)).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Add without permissions' }),
    ).toBeDisabled()
  })
})
