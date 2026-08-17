import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { MessagingExclusionSummary } from './messaging-exclusion-summary'

describe('MessagingExclusionSummary', () => {
  it('identifies scoped CSV rows and renders public reason copy', () => {
    render(
      <MessagingExclusionSummary
        summary={{
          total: 1,
          reasons: [
            { code: 'missing-consent', label: 'No active group consent', count: 1 },
          ],
        }}
        exclusions={[
          {
            position: 2,
            recipient: 'Recipient ending in 0101',
            code: 'missing-consent',
            message: 'Consent must be affirmed before this person is added.',
          },
        ]}
        titleSuffix='will be excluded'
        rowNumberAtPosition={(position) => position + 10}
      />
    )

    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent('1 recipient will be excluded')
    expect(alert).toHaveTextContent('Row 12')
    expect(alert).toHaveTextContent('no active group consent')
    expect(alert).not.toHaveTextContent('0101')
    expect(alert).not.toHaveTextContent('missing-consent')
  })
})
