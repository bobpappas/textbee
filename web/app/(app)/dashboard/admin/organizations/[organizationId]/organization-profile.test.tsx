import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import OrganizationProfile from './organization-profile'

const useProfile = vi.fn()
const renameMutate = vi.fn()
const contextRefetch = vi.fn()
const useContext = vi.fn()
vi.mock('@/lib/api', () => ({
  ORGANIZATION_PROFILE_MANAGE: 'organization:profile:manage',
  useOrganizationProfile: () => useProfile(),
  useRenameOrganization: () => ({ mutate: renameMutate, isPending: false }),
}))
vi.mock('@/components/organizations/organization-context-provider', () => ({
  useOrganizationContext: () => useContext(),
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
  beforeEach(() => {
    contextRefetch.mockReset()
    useContext.mockReturnValue({
      isPending: false,
      isFetching: false,
      isError: false,
      data: {
        state: 'ACTIVE',
        organization: { id: 'org-1', displayName: profile.displayName },
        membership: { id: 'membership-1', status: 'ACTIVE' },
        capabilities: ['organization:profile:manage'],
        roleLabel: 'Organization administrator',
      },
      refetch: contextRefetch,
    })
  })

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

  it.each([
    ['NO_ACCESS', 'No organization access'],
    ['SELECTION_REQUIRED', 'Organization selection required'],
  ])('renders the safe %s direct-route state', (state, heading) => {
    useContext.mockReturnValue({
      isPending: false,
      isFetching: false,
      isError: false,
      data: {
        state,
        organization: null,
        membership: null,
        capabilities: [],
        roleLabel: null,
      },
      refetch: contextRefetch,
    })
    useProfile.mockReturnValue({ isPending: false })

    render(<OrganizationProfile organizationId="forged-org" />)
    expect(screen.getByRole('heading', { name: heading })).toBeInTheDocument()
    expect(screen.queryByText(profile.displayName)).not.toBeInTheDocument()
  })

  it('rejects a route organization that differs from server context', () => {
    useProfile.mockReturnValue({ isPending: false })
    render(<OrganizationProfile organizationId="forged-org" />)
    expect(screen.getByText(/not found or access denied/i)).toBeInTheDocument()
    expect(screen.queryByText(profile.displayName)).not.toBeInTheDocument()
  })
})
