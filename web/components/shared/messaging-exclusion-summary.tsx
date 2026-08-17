import type { ReactNode } from 'react'
import { AlertTriangle } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'

export type MessagingExclusion = {
  position: number
  recipient: string
  code: string
  message: string
}

export type MessagingExclusionSummaryData = {
  total: number
  reasons: Array<{ code: string; label: string; count: number }>
}

export function MessagingExclusionSummary({
  summary,
  exclusions,
  titleSuffix,
  rowNumberAtPosition,
  children,
}: {
  summary: MessagingExclusionSummaryData
  exclusions: MessagingExclusion[]
  titleSuffix: string
  rowNumberAtPosition?: (position: number) => number
  children?: ReactNode
}) {
  if (summary.total === 0) return null

  return (
    <Alert variant='destructive' aria-live='assertive'>
      <AlertTriangle className='h-4 w-4' />
      <AlertTitle>
        {summary.total} recipient{summary.total === 1 ? '' : 's'} {titleSuffix}
      </AlertTitle>
      <AlertDescription>
        <ul className='list-disc space-y-1 pl-5'>
          {summary.reasons.map((reason) => (
            <li key={reason.code}>
              {reason.count} {reason.label.toLowerCase()}
            </li>
          ))}
          {exclusions.slice(0, 10).map((item) => (
            <li key={item.position}>
              {rowNumberAtPosition
                ? `Row ${rowNumberAtPosition(item.position)}`
                : item.recipient}
              : {item.message}
            </li>
          ))}
        </ul>
        {children}
      </AlertDescription>
    </Alert>
  )
}
