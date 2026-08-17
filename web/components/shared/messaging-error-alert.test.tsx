import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { MessagingErrorAlert } from './messaging-error-alert'

describe('MessagingErrorAlert', () => {
  it('announces an API error-field explanation instead of Axios status text', () => {
    render(
      <MessagingErrorAlert
        error={{
          message: 'Request failed with status code 409',
          response: {
            status: 409,
            data: { error: 'This conflict can be corrected safely.' },
          },
        }}
      />
    )

    const alert = screen.getByRole('alert')
    expect(alert).toHaveAttribute('aria-live', 'assertive')
    expect(alert).toHaveTextContent('This conflict can be corrected safely.')
    expect(alert).not.toHaveTextContent('status code 409')
  })

  it('renders suppression guidance without a full number or enum', () => {
    render(
      <MessagingErrorAlert
        error={{
          response: {
            status: 409,
            data: {
              excludedRecipients: [
                {
                  recipient: '+12085550101',
                  reason: 'ORGANIZATION_SUPPRESSION',
                },
              ],
            },
          },
        }}
      />
    )

    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent('Operators cannot override')
    expect(alert).toHaveTextContent('reply START')
    expect(alert).not.toHaveTextContent('+12085550101')
    expect(alert).not.toHaveTextContent('ORGANIZATION_SUPPRESSION')
  })
})
