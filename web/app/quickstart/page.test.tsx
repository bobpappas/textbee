import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import QuickStartPage from './page'

describe('QuickStartPage', () => {
  it('hosts the complete self-hosted setup path', () => {
    render(<QuickStartPage />)

    expect(screen.getByRole('heading', { name: 'Quick start' })).toBeVisible()
    expect(screen.getByText(/grant permissions/i)).toBeVisible()
    expect(screen.getByText(/API key or QR code/i)).toBeVisible()
    expect(screen.getByText(/register the phone/i)).toBeVisible()
    expect(screen.getByText(/current device heartbeat/i)).toBeVisible()
    expect(
      screen.getByRole('link', { name: 'Android app instructions' })
    ).toHaveAttribute('href', '/download')
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute(
      'href',
      '/login'
    )
  })
})
