import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import CreateOrganizationDialog from './create-organization-dialog'

const mutate = vi.fn()
const reset = vi.fn()
vi.mock('@/lib/api', () => ({
  useCreateOrganization: () => ({ mutate, reset, isPending: false }),
}))

describe('CreateOrganizationDialog', () => {
  beforeEach(() => {
    mutate.mockReset()
    reset.mockReset()
    vi.spyOn(crypto, 'randomUUID').mockReturnValue(
      '11111111-1111-4111-8111-111111111111',
    )
  })

  it('validates the organization name without submitting', () => {
    render(<CreateOrganizationDialog open onOpenChange={vi.fn()} />)
    fireEvent.change(screen.getByLabelText('Organization name'), {
      target: { value: ' ' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Create' }))
    expect(screen.getByRole('alert')).toHaveTextContent('2 to 100')
    expect(mutate).not.toHaveBeenCalled()
  })

  it('reuses the same idempotency key after an unknown result', async () => {
    mutate.mockImplementation((_input, options) =>
      options.onError(new Error('Network error')),
    )
    render(<CreateOrganizationDialog open onOpenChange={vi.fn()} />)
    fireEvent.change(screen.getByLabelText('Organization name'), {
      target: { value: 'Boise Church of Christ' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Create' }))
    fireEvent.click(screen.getByRole('button', { name: 'Create' }))

    await waitFor(() => expect(mutate).toHaveBeenCalledTimes(2))
    expect(mutate.mock.calls[0][0].idempotencyKey).toBe(
      mutate.mock.calls[1][0].idempotencyKey,
    )
    expect(
      screen.getByText(/retry this submission safely/i),
    ).toBeInTheDocument()
  })

  it('closes only after server-confirmed success', () => {
    const onOpenChange = vi.fn()
    mutate.mockImplementation((_input, options) => options.onSuccess())
    render(<CreateOrganizationDialog open onOpenChange={onOpenChange} />)
    fireEvent.change(screen.getByLabelText('Organization name'), {
      target: { value: 'Boise Church of Christ' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Create' }))
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
})
