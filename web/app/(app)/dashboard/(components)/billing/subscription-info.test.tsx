import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import SubscriptionInfo from './subscription-info'

const useSubscription = vi.fn()
vi.mock('@/lib/api', () => ({ useSubscription: () => useSubscription() }))

const response = {
  mode: 'self_hosted',
  policy: {
    timezone: 'America/Boise',
    activeDeviceLimit: 1,
    recipientsPerSend: 40,
    segmentsPerMinute: 10,
    segmentsPerDay: 200,
    segmentsRolling30Days: 2000,
    complianceSegmentsPerDay: 50,
  },
  usage: {
    segmentsThisMinute: 2,
    processedSmsToday: 12,
    processedSmsLastMonth: 120,
    dailyLimit: 200,
    monthlyLimit: 2000,
    dailyRemaining: 188,
    monthlyRemaining: 1880,
    dailyUsagePercentage: 6,
    monthlyUsagePercentage: 6,
  },
}

describe('SubscriptionInfo in self-hosted mode', () => {
  beforeEach(() =>
    useSubscription.mockReturnValue({
      data: response,
      isLoading: false,
      error: null,
    }),
  )

  it('shows the enforced operational policy without commercial language', () => {
    render(<SubscriptionInfo />)
    expect(
      screen.getByRole('heading', {
        name: /administrator self-hosted service/i,
      }),
    ).toBeInTheDocument()
    expect(screen.getByText(/America\/Boise/)).toBeInTheDocument()
    expect(screen.getByText('12 of 200 segments')).toBeInTheDocument()
    expect(screen.queryByText(/\bfree\b|\bpro\b/i)).not.toBeInTheDocument()
    expect(
      screen.queryByRole('link', { name: /upgrade|checkout/i }),
    ).not.toBeInTheDocument()
  })

  it('renders an explicit loading and failure state', () => {
    useSubscription.mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
    })
    const { rerender } = render(<SubscriptionInfo />)
    expect(screen.getByRole('status')).toHaveTextContent(/loading operational/i)

    useSubscription.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error('boom'),
    })
    rerender(<SubscriptionInfo />)
    expect(screen.getByText(/failed to load operational/i)).toBeInTheDocument()
  })
})
