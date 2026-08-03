import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import OrganizationRegistry from './organization-registry'

const useOrganizations = vi.fn()
const retryMutate = vi.fn()
vi.mock('@/lib/api', () => ({
  useOrganizations: () => useOrganizations(),
  useRetryOrganizationProvisioning: () => ({
    mutate: retryMutate,
    isPending: false,
  }),
  useCreateOrganization: () => ({
    mutate: vi.fn(),
    reset: vi.fn(),
    isPending: false,
  }),
}))

describe('OrganizationRegistry', () => {
  it('renders loading, empty, and forbidden states distinctly', () => {
    useOrganizations.mockReturnValue({ isPending: true })
    const { rerender } = render(<OrganizationRegistry />)
    expect(screen.getByLabelText('Loading organizations')).toBeInTheDocument()

    useOrganizations.mockReturnValue({
      isPending: false,
      isError: false,
      data: [],
    })
    rerender(<OrganizationRegistry />)
    expect(screen.getByText('No organizations yet')).toBeInTheDocument()

    useOrganizations.mockReturnValue({
      isPending: false,
      isError: true,
      error: { response: { status: 403 } },
    })
    rerender(<OrganizationRegistry />)
    expect(screen.getByText('Access denied')).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Create organization' }),
    ).not.toBeInTheDocument()
  })

  it('shows manage only for granted active profiles and retry only while provisioning', () => {
    useOrganizations.mockReturnValue({
      isPending: false,
      isError: false,
      data: [
        {
          id: 'org-1',
          displayName: 'Managed Church',
          status: 'ACTIVE',
          canManageProfile: true,
        },
        {
          id: 'org-2',
          displayName: 'Registry only',
          status: 'ACTIVE',
          canManageProfile: false,
        },
        {
          id: 'org-3',
          displayName: 'Incomplete',
          status: 'PROVISIONING_FAILED',
          canManageProfile: false,
        },
      ],
    })
    render(<OrganizationRegistry />)
    expect(screen.getAllByRole('link', { name: 'Manage' })).toHaveLength(2)
    expect(
      screen.getAllByRole('button', { name: 'Retry provisioning' }),
    ).toHaveLength(2)
    expect(screen.getAllByText('Registry only')).toHaveLength(2)
  })
})
