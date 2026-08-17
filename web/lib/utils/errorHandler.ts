import { AxiosError } from 'axios'

type ErrorBody = {
  message?: unknown
  error?: unknown
  code?: unknown
  excludedRecipients?: unknown
  hasReachedLimit?: boolean
  dailyLimit?: number
  dailyRemaining?: number
  monthlyRemaining?: number
  bulkSendLimit?: number
  monthlyLimit?: number
}

type EligibilityReason =
  | 'missing-consent'
  | 'opted-out'
  | 'invalid-number'
  | 'eligibility-changed'

const FALLBACK_MESSAGE =
  'Could not complete the request. Please try again. If it still fails, review the recipient and try once more.'

const ELIGIBILITY_MESSAGE: Record<EligibilityReason, string> = {
  'missing-consent':
    'This recipient has no active group consent. Add them to an authorized group only after affirming that they requested messages or provided their number for church communications.',
  'opted-out':
    'This recipient opted out of organization messages. Operators cannot override that choice. Only the recipient can reply START and then explicitly JOIN each group they want.',
  'invalid-number':
    'Enter a valid US mobile number. Valid formatting alone does not prove carrier assignment or SMS capability.',
  'eligibility-changed':
    'Messaging eligibility changed before dispatch, so no message was sent to that recipient. Review consent and suppression status before retrying.',
}

const PUBLIC_REASON: Record<string, EligibilityReason> = {
  NO_ACTIVE_GROUP_CONSENT: 'missing-consent',
  ORGANIZATION_SUPPRESSION: 'opted-out',
  INVALID_NUMBER: 'invalid-number',
  MESSAGING_ELIGIBILITY_CHANGED: 'eligibility-changed',
  'missing-consent': 'missing-consent',
  'opted-out': 'opted-out',
  'invalid-number': 'invalid-number',
  'eligibility-changed': 'eligibility-changed',
}

function nonBlankText(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function errorBody(error: unknown): ErrorBody | undefined {
  const data = (error as AxiosError<unknown>)?.response?.data
  return data && typeof data === 'object' && !Array.isArray(data)
    ? (data as ErrorBody)
    : undefined
}

function eligibilityReasons(data: ErrorBody): EligibilityReason[] {
  const reasons: EligibilityReason[] = []
  const directCode = nonBlankText(data.code)
  if (directCode && PUBLIC_REASON[directCode]) reasons.push(PUBLIC_REASON[directCode])

  if (Array.isArray(data.excludedRecipients)) {
    for (const item of data.excludedRecipients) {
      if (!item || typeof item !== 'object') continue
      const record = item as Record<string, unknown>
      const code = nonBlankText(record.code) ?? nonBlankText(record.reason)
      if (code && PUBLIC_REASON[code]) reasons.push(PUBLIC_REASON[code])
    }
  }
  return reasons
}

function formatEligibilityMessage(reasons: EligibilityReason[]): string | undefined {
  if (reasons.length === 0) return undefined
  const counts = new Map<EligibilityReason, number>()
  for (const reason of reasons) counts.set(reason, (counts.get(reason) ?? 0) + 1)
  if (reasons.length === 1) return ELIGIBILITY_MESSAGE[reasons[0]]

  const labels: Record<EligibilityReason, string> = {
    'missing-consent': 'without active group consent',
    'opted-out': 'who opted out',
    'invalid-number': 'with invalid US mobile numbers',
    'eligibility-changed': 'whose eligibility changed before dispatch',
  }
  const summary = [...counts]
    .map(([reason, count]) => `${count} ${labels[reason]}`)
    .join('; ')
  return `${reasons.length} recipients could not be sent: ${summary}. Review each exclusion and change only consent or contact details you are authorized to update before retrying.`
}

export interface RateLimitErrorData {
  message: string
  hasReachedLimit: boolean
  dailyLimit?: number
  dailyRemaining?: number
  monthlyRemaining?: number
  bulkSendLimit?: number
  monthlyLimit?: number
}

export interface FormattedError {
  message: string
  isRateLimit: boolean
  rateLimitData?: RateLimitErrorData
}

/**
 * Formats axios errors into user-friendly messages
 * Special handling for 429 (rate limit) errors
 */
export function formatError(error: unknown): FormattedError {
  if (!error) {
    return {
      message: 'An unexpected error occurred. Please try again.',
      isRateLimit: false,
    }
  }

  // Check if it's an axios error
  const axiosError = error as AxiosError
  if (axiosError.response) {
    const status = axiosError.response.status
    const data = errorBody(error)

    // Handle 429 rate limit errors
    if (status === 429) {
      const rateLimitData: RateLimitErrorData = {
        message:
          nonBlankText(data?.message) ??
          nonBlankText(data?.error) ??
          'Rate limit reached',
        hasReachedLimit: data?.hasReachedLimit ?? true,
        dailyLimit: data?.dailyLimit,
        dailyRemaining: data?.dailyRemaining,
        monthlyRemaining: data?.monthlyRemaining,
        bulkSendLimit: data?.bulkSendLimit,
        monthlyLimit: data?.monthlyLimit,
      }

      return {
        message: rateLimitData.message,
        isRateLimit: true,
        rateLimitData,
      }
    }

    const eligibilityMessage = data
      ? formatEligibilityMessage(eligibilityReasons(data))
      : undefined
    if (eligibilityMessage) {
      return {
        message: eligibilityMessage,
        isRateLimit: false,
      }
    }

    // Nest commonly serializes an object passed to HttpException without
    // adding `message`, so honor either human-readable response field.
    const responseMessage =
      nonBlankText(data?.message) ?? nonBlankText(data?.error)
    if (responseMessage) return { message: responseMessage, isRateLimit: false }

    return { message: FALLBACK_MESSAGE, isRateLimit: false }
  }

  return { message: FALLBACK_MESSAGE, isRateLimit: false }
}

/**
 * The `message` an API error carried, or undefined if it had none.
 *
 * Distinct from formatError, which always substitutes a generic message.
 * Use this where the caller has its own fallback copy worth preserving, and
 * needs to know whether the server actually said anything.
 */
export function apiErrorMessage(error: unknown): string | undefined {
  const data = errorBody(error)
  return nonBlankText(data?.message) ?? nonBlankText(data?.error)
}

/**
 * Checks if an error is a rate limit (429) error
 */
export function isRateLimitError(error: unknown): boolean {
  const formatted = formatError(error)
  return formatted.isRateLimit
}
