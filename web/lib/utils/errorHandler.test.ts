import { describe, expect, it } from 'vitest'
import { apiErrorMessage, formatError } from './errorHandler'

function responseError(data: unknown, status = 409) {
  return { response: { status, data }, message: `Request failed with status code ${status}` }
}

describe('formatError', () => {
  it.each([
    [{ message: 'The server explained this conflict.' }, 'The server explained this conflict.'],
    [{ error: 'The API explained this conflict.' }, 'The API explained this conflict.'],
  ])('uses either human-readable API field', (body, expected) => {
    expect(formatError(responseError(body)).message).toBe(expected)
    expect(apiErrorMessage(responseError(body))).toBe(expected)
  })

  it.each([
    [
      'NO_ACTIVE_GROUP_CONSENT',
      'This recipient has no active group consent. Add them to an authorized group only after affirming that they requested messages or provided their number for church communications.',
    ],
    [
      'ORGANIZATION_SUPPRESSION',
      'This recipient opted out of organization messages. Operators cannot override that choice. Only the recipient can reply START and then explicitly JOIN each group they want.',
    ],
    [
      'INVALID_NUMBER',
      'Enter a valid US mobile number. Valid formatting alone does not prove carrier assignment or SMS capability.',
    ],
    [
      'MESSAGING_ELIGIBILITY_CHANGED',
      'Messaging eligibility changed before dispatch, so no message was sent to that recipient. Review consent and suppression status before retrying.',
    ],
  ])('turns eligibility reason %s into safe guidance', (reason, expected) => {
    const formatted = formatError(
      responseError({
        error: 'No recipients are eligible for messaging',
        excludedRecipients: [{ recipient: '+12085550101', reason }],
      })
    )

    expect(formatted.message).toBe(expected)
    expect(formatted.message).not.toContain('+12085550101')
    expect(formatted.message).not.toContain(reason)
  })

  it('summarizes mixed exclusions without numbers or internal enum names', () => {
    const formatted = formatError(
      responseError({
        excludedRecipients: [
          { recipient: '+12085550101', reason: 'NO_ACTIVE_GROUP_CONSENT' },
          { recipient: '+12085550102', reason: 'ORGANIZATION_SUPPRESSION' },
          { recipient: '+12085550103', reason: 'NO_ACTIVE_GROUP_CONSENT' },
        ],
      })
    )

    expect(formatted.message).toContain('3 recipients could not be sent')
    expect(formatted.message).toContain('2 without active group consent')
    expect(formatted.message).toContain('1 who opted out')
    expect(formatted.message).not.toMatch(/\+1208|NO_ACTIVE|SUPPRESSION/)
  })

  it('uses retry-safe fallback copy for malformed responses', () => {
    const formatted = formatError(responseError({ raw: { stack: 'secret' } }, 500))
    expect(formatted.message).toContain('try again')
    expect(formatted.message).not.toContain('secret')
    expect(formatted.message).not.toContain('status code')
  })

  it('retains rate-limit behavior when the API uses error', () => {
    const formatted = formatError(
      responseError({ error: 'Wait until tomorrow.', hasReachedLimit: true }, 429)
    )
    expect(formatted).toMatchObject({
      isRateLimit: true,
      message: 'Wait until tomorrow.',
    })
  })
})
