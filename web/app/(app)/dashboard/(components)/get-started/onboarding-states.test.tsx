import { describe, expect, it } from 'vitest'
import { http, HttpResponse } from 'msw'
import userEvent from '@testing-library/user-event'
import { renderWithProviders, screen, waitFor } from '@/test/render'
import { server } from '@/test/msw/server'
import { API_BASE_URL, mockUser } from '@/test/fixtures'
import GetStartedCard from './index'

// Fail-closed policy: the checklist may only render from complete data. A
// backend failure must never show a fresh user "stuck on Verify your email".

describe('GetStartedCard states', () => {
  it('renders the error card with retry when whoAmI fails (no checklist)', async () => {
    server.use(
      http.get(`${API_BASE_URL}/auth/who-am-i`, () =>
        HttpResponse.json({ message: 'down' }, { status: 500 })
      )
    )

    renderWithProviders(<GetStartedCard />)

    await waitFor(() =>
      expect(
        screen.getByText(/Couldn't load your setup status/)
      ).toBeInTheDocument()
    )
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument()
    // Never render steps computed from missing data.
    expect(screen.queryByText('Verify your email')).not.toBeInTheDocument()
  })

  it('does not restore password-era email verification for a legacy user', async () => {
    server.use(
      http.get(`${API_BASE_URL}/auth/who-am-i`, () =>
        HttpResponse.json({
          data: { ...mockUser, emailVerifiedAt: null, onboardingCompletedAt: null },
        })
      )
    )

    renderWithProviders(<GetStartedCard />)

    await waitFor(() => expect(screen.getByText('4 of 4')).toBeInTheDocument())
    expect(screen.getByRole('progressbar')).toBeInTheDocument()
    expect(screen.queryByText('Verify your email')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /resend email/i })).not.toBeInTheDocument()
  })

  it('shows full progress for an all-done user (before auto-complete lands)', async () => {
    renderWithProviders(<GetStartedCard />)

    await waitFor(() => expect(screen.getByText('4 of 4')).toBeInTheDocument())
    expect(screen.getByText('All steps complete!')).toBeInTheDocument()
  })

  // Reopening a finished step used to render an empty row: the body was gated
  // on the step NOT being done. Someone who wanted to replace a leaked or lost
  // API key had no route back to that action from the checklist.
  it('lets a completed API key step be reopened to generate another key', async () => {
    const user = userEvent.setup()
    renderWithProviders(<GetStartedCard />)

    await waitFor(() => expect(screen.getByText('4 of 4')).toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: 'Generate an API key' }))

    // The action is back, and says plainly that it makes an additional key.
    expect(
      await screen.findByRole('button', { name: /generate another api key/i })
    ).toBeInTheDocument()
    expect(screen.getByText(/You already have a key/)).toBeInTheDocument()
  })

  // The counterpart to the test above. Allowing a done step to stay selected
  // must not break the original behaviour: if the step you are sitting on
  // completes underneath you (the card polls), the selection should move on
  // rather than stranding you on a finished step.
  it('advances off a step that completes while you are sitting on it', async () => {
    const user = userEvent.setup()
    let apiKeyCount = 0
    server.use(
      http.get(`${API_BASE_URL}/gateway/stats`, () =>
        HttpResponse.json({
          data: {
            totalSentSMSCount: 0,
            totalReceivedSMSCount: 0,
            totalDeviceCount: 0,
            totalApiKeyCount: apiKeyCount,
          },
        })
      )
    )

    renderWithProviders(<GetStartedCard />)

    await waitFor(() => expect(screen.getByText('0 of 4')).toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: 'Generate an API key' }))
    expect(
      await screen.findByRole('button', { name: /^generate api key$/i })
    ).toBeInTheDocument()

    // The key now exists; the next poll completes the step under the user.
    apiKeyCount = 3

    await waitFor(
      () => expect(screen.getByText('1 of 4')).toBeInTheDocument(),
      { timeout: 15000 }
    )

    // The selection moved on rather than stranding the user on a finished
    // step, so that step's action is no longer the one being offered.
    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: /^generate api key$/i })
      ).not.toBeInTheDocument()
    )
  }, 20000)
})
