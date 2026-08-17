import type { RecipientPolicyResult } from '../consent/consent.service'

export type MessagingEligibilityReason = NonNullable<
  RecipientPolicyResult['reason']
>

export type MessagingExclusionInput = Pick<
  RecipientPolicyResult,
  'recipient' | 'reason'
> & { position: number }

const PUBLIC_REASON = {
  NO_ACTIVE_GROUP_CONSENT: {
    code: 'missing-consent',
    label: 'No active group consent',
    message:
      'This recipient has no active group consent. Add them to an authorized group only after affirming that they requested messages or provided their number for church communications.',
  },
  ORGANIZATION_SUPPRESSION: {
    code: 'opted-out',
    label: 'Recipient opted out',
    message:
      'This recipient opted out of organization messages. Operators cannot override that choice. Only the recipient can reply START and then explicitly JOIN each group they want.',
  },
  INVALID_NUMBER: {
    code: 'invalid-number',
    label: 'Invalid US mobile number',
    message:
      'Enter a valid US mobile number. Valid formatting alone does not prove carrier assignment or SMS capability.',
  },
} as const satisfies Record<
  MessagingEligibilityReason,
  { code: string; label: string; message: string }
>

export const ELIGIBILITY_CHANGED_MESSAGE =
  'Messaging eligibility changed before dispatch, so no message was sent to that recipient. Review consent and suppression status before retrying.'

function recipientLabel(recipient: string, position: number) {
  const digits = recipient.replace(/\D/g, '')
  return digits.length >= 4
    ? `Recipient ending in ${digits.slice(-4)}`
    : `Recipient ${position}`
}

export function buildMessagingEligibilityDetails(
  excluded: MessagingExclusionInput[],
) {
  const reasonCounts = new Map<MessagingEligibilityReason, number>()
  for (const item of excluded) {
    if (!item.reason) continue
    reasonCounts.set(item.reason, (reasonCounts.get(item.reason) ?? 0) + 1)
  }

  const publicExclusions = excluded.map((item) => {
    const reason = item.reason ? PUBLIC_REASON[item.reason] : undefined
    return {
      position: item.position,
      recipient: recipientLabel(item.recipient, item.position),
      code: reason?.code ?? 'unknown-eligibility',
      message:
        reason?.message ??
        'This recipient is not currently eligible. Review consent and suppression status before retrying.',
    }
  })
  const reasons = [...reasonCounts].map(([reason, count]) => ({
    code: PUBLIC_REASON[reason].code,
    label: PUBLIC_REASON[reason].label,
    count,
  }))
  const message =
    excluded.length === 1 && excluded[0].reason
      ? PUBLIC_REASON[excluded[0].reason].message
      : `${excluded.length} recipients are not eligible for messaging. Review the reason summary and change only consent or contact details you are authorized to update before retrying.`

  return {
    message,
    code: 'MESSAGING_INELIGIBLE',
    excludedRecipients: publicExclusions,
    exclusionSummary: { total: excluded.length, reasons },
  }
}
