import { AlertCircle } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { formatError } from '@/lib/utils/errorHandler'
import { RateLimitError } from './rate-limit-error'

export function MessagingErrorAlert({
  error,
  title = 'Could not send',
}: {
  error: unknown
  title?: string
}) {
  const formatted = formatError(error)
  if (formatted.isRateLimit)
    return (
      <RateLimitError errorData={formatted.rateLimitData} variant='alert' />
    )

  return (
    <Alert variant='destructive' aria-live='assertive'>
      <AlertCircle className='h-4 w-4' />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>{formatted.message}</AlertDescription>
    </Alert>
  )
}
