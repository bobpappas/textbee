import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import OrganizationProfile from './organization-profile'

const useProfile = vi.fn()
const renameMutate = vi.fn()
vi.mock('@/lib/api', () => ({
  useOrganizationProfile: () => useProfile(),
  useRenameOrganization: () => ({ mutate: renameMutate, isPending: false }),
}))

const profile = {
  id: 'org-1',
  displayName: 'Boise Church of Christ',
  status: 'ACTIVE',
  canManageProfile: true,
  role: 'ORGANIZATION_ADMIN',
  membershipId: 'membership-1',
}

describe('OrganizationProfile', () => {
  it('clears profile data and renders a non-disclosing denied state', () => {
    useProfile.mockReturnValue({
      isPending: false,
      isError: false,
      data: profile,
    })
    const { rerender } = render(<OrganizationProfile organizationId="org-1" />)
    expect(
      screen.getByDisplayValue('Boise Church of Christ'),
    ).toBeInTheDocument()

    useProfile.mockReturnValue({
      isPending: false,
      isError: true,
      error: { response: { status: 404 } },
    })
    rerender(<OrganizationProfile organizationId="org-2" />)
    expect(
      screen.queryByDisplayValue('Boise Church of Christ'),
    ).not.toBeInTheDocument()
    expect(screen.getByText(/not found or access denied/i)).toBeInTheDocument()
  })

  it('updates visible state only with the server-confirmed rename', () => {
    useProfile.mockReturnValue({
      isPending: false,
      isError: false,
      data: profile,
    })
    renameMutate.mockImplementation((_input, options) =>
      options.onSuccess({ ...profile, displayName: 'Server-confirmed name' }),
    )
    render(<OrganizationProfile organizationId="org-1" />)
    fireEvent.change(screen.getByLabelText('Organization name'), {
      target: { value: 'Requested name' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(
      screen.getByDisplayValue('Server-confirmed name'),
    ).toBeInTheDocument()
    expect(screen.getByText('Organization name updated.')).toBeInTheDocument()
  })
})
