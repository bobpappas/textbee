'use client'

import { CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  MessagingExclusionSummary,
  type MessagingExclusion,
  type MessagingExclusionSummaryData,
} from '@/components/shared/messaging-exclusion-summary'
import type { BulkSendState } from './use-bulk-send'

export default function SuccessPanel({ bulk }: { bulk: BulkSendState }) {
  const { plan, resetSend, resetFile, setTemplate, sendResult } = bulk
  const result = sendResult?.data?.data
  const exclusionSummary = result?.exclusionSummary as
    | MessagingExclusionSummaryData
    | undefined
  const excludedRecipients = (result?.excludedRecipients ?? []) as MessagingExclusion[]
  const acceptedCount = Math.max(
    0,
    plan.valid.length - (exclusionSummary?.total ?? 0)
  )

  return (
      <div className='rounded-xl border border-border bg-card p-8 text-center'>
        <div className='mx-auto mb-3 w-fit rounded-full bg-green-100 p-3 dark:bg-green-900/30'>
          <CheckCircle2 className='h-6 w-6 text-green-600 dark:text-green-400' />
        </div>
        <h3 className='text-lg font-semibold'>
          {acceptedCount.toLocaleString()} message
          {acceptedCount === 1 ? '' : 's'} queued
        </h3>
        <p className='mt-1 text-sm text-muted-foreground'>
          Delivery status appears in your message history as each one is sent.
        </p>
        {exclusionSummary && exclusionSummary.total > 0 && (
          <div className='mt-5 text-left'>
            <MessagingExclusionSummary
              summary={exclusionSummary}
              exclusions={excludedRecipients}
              titleSuffix='excluded'
              rowNumberAtPosition={(position) =>
                plan.valid[position - 1]?.rowNumber ?? position
              }
            />
          </div>
        )}
        <div className='mt-5 flex flex-wrap items-center justify-center gap-2'>
          <Button asChild size='sm'>
            <a href='/dashboard/messaging/history'>View message history</a>
          </Button>
          <Button
            variant='outline'
            size='sm'
            onClick={() => {
              resetSend()
              resetFile()
              setTemplate('')
            }}
          >
            Send another batch
          </Button>
        </div>
      </div>
    )
}
