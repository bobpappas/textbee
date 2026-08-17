'use client'

import { AlertCircle, Send } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { formatError } from '@/lib/utils/errorHandler'
import { MessagingErrorAlert } from '@/components/shared/messaging-error-alert'
import { MessagingExclusionSummary } from '@/components/shared/messaging-exclusion-summary'
import { formatDeviceName } from '@/lib/utils'
import StepShell from './step-shell'
import { REASON_LABEL } from './constants'
import type { BulkSendState } from './use-bulk-send'

export default function ReviewStep({ bulk }: { bulk: BulkSendState }) {
  const {
    plan,
    selectedDevice,
    composed,
    totalSegments,
    sendBulk,
    isSending,
    sendError,
    resetSend,
    eligibility,
  } = bulk
  const preview = eligibility.data
  const eligibleCount = preview?.eligibleCount ?? plan.valid.length
  const previewError = eligibility.error ? formatError(eligibility.error) : null

  return (
    <>
      {/* 4. Review and send */}
      <StepShell
        step={4}
        title='Review and send'
        description='Nothing is sent until you confirm'
        locked={!composed}
      >
        <div className='rounded-lg border border-border bg-muted/30 p-3 text-sm'>
          <p>
            Sending{' '}
            <strong>{plan.valid.length.toLocaleString()} messages</strong> from{' '}
            <strong>
              {selectedDevice ? formatDeviceName(selectedDevice) : 'your device'}
            </strong>
            .
          </p>
          <p className='mt-1 text-muted-foreground'>
            Estimated carrier usage:{' '}
            <strong>{totalSegments.toLocaleString()} SMS segments</strong>.
          </p>
          {plan.excluded.length > 0 && (
            <details className='mt-2'>
              <summary className='cursor-pointer text-xs text-muted-foreground hover:text-foreground'>
                {plan.excluded.length} row
                {plan.excluded.length === 1 ? '' : 's'} skipped
              </summary>
              <ul className='mt-2 space-y-1 text-xs text-muted-foreground'>
                {plan.excluded.slice(0, 10).map((row) => (
                  <li key={`${row.rowNumber}-${row.reason}`}>
                    Row {row.rowNumber}
                    {row.raw ? ` ("${row.raw}")` : ''}:{' '}
                    {REASON_LABEL[row.reason]}
                  </li>
                ))}
                {plan.excluded.length > 10 && (
                  <li>and {plan.excluded.length - 10} more</li>
                )}
              </ul>
            </details>
          )}
        </div>

        {eligibility.isPending && (
          <p role='status' aria-live='polite' className='text-sm text-muted-foreground'>
            Checking recipient eligibility…
          </p>
        )}

        {previewError && (
          <Alert variant='destructive' aria-live='assertive'>
            <AlertCircle className='h-4 w-4' />
            <AlertTitle>Could not check recipients</AlertTitle>
            <AlertDescription>
              <p>{previewError.message}</p>
              <Button
                type='button'
                size='sm'
                variant='outline'
                className='mt-2'
                onClick={() => eligibility.refetch()}
              >
                Retry eligibility check
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {preview && (
          <MessagingExclusionSummary
            summary={preview.exclusionSummary}
            exclusions={preview.excludedRecipients}
            titleSuffix='will be excluded'
            rowNumberAtPosition={(position) =>
              plan.valid[position - 1]?.rowNumber ?? position
            }
          >
              {eligibleCount > 0 ? (
                <p className='mt-2'>
                  Only the {eligibleCount} eligible recipient
                  {eligibleCount === 1 ? '' : 's'} will be sent after confirmation.
                </p>
              ) : (
                <p className='mt-2'>No messages will be dispatched.</p>
              )}
          </MessagingExclusionSummary>
        )}

        {sendError && <MessagingErrorAlert error={sendError} />}

        <Button
          className='w-full'
          disabled={
            !composed ||
            isSending ||
            eligibility.isPending ||
            Boolean(eligibility.error) ||
            eligibleCount === 0
          }
          onClick={() => {
            resetSend()
            sendBulk()
          }}
        >
          {isSending ? (
            <>
              <Spinner size='sm' className='mr-2 text-white dark:text-black' />
              Sending...
            </>
          ) : (
            <>
              <Send className='mr-2 h-4 w-4' />
              Send {eligibleCount.toLocaleString()} message
              {eligibleCount === 1 ? '' : 's'}
            </>
          )}
        </Button>
      </StepShell>
    </>
  )
}
