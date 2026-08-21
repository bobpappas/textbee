'use client'

import WebhookDeliveriesTable from './deliveries-table'
import NumberedPagination from '@/components/shared/numbered-pagination'
import {
  useDevices,
  useWebhookNotifications,
  useWebhooks,
} from '@/lib/api'
import Filters from './filters'
import { useWebhookHistoryFilters } from './use-filters'
import { Button } from '@/components/ui/button'
import { RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'

// Container for the webhook delivery history: owns filter state via the
// use-filters hook and hands rendering to Filters + the notifications table.
export default function WebhooksHistory() {
  const filters = useWebhookHistoryFilters()
  const {
    currentDevice,
    currentWebhook,
    eventType,
    status,
    dateQuery,
    page,
    setPage,
    limit,
  } = filters

  const { data: devices } = useDevices()
  const { data: webhooks } = useWebhooks()

  const {
    data: webhookNotifications,
    isLoading: isLoadingNotifications,
    isFetching: isFetchingNotifications,
    error: notificationsError,
    refetch,
  } = useWebhookNotifications({
    eventType: eventType === 'all' ? '' : eventType,
    status: status === 'all' ? '' : status,
    deviceId: currentDevice === 'all' ? '' : currentDevice,
    webhookSubscriptionId: currentWebhook === 'all' ? '' : currentWebhook,
    start: dateQuery.start,
    end: dateQuery.end,
    page,
    limit,
  })

  const totalPages = webhookNotifications?.data?.meta?.totalPages ?? 1
  const hasConfirmedRows = Boolean(webhookNotifications?.data)
  const refresh = () => {
    if (!isFetchingNotifications) void refetch()
  }

  return (
    <div className='flex flex-col gap-y-4'>
      <div className='bg-card rounded-lg shadow-sm border border-border p-4 mb-4'>
        <div className='flex flex-col gap-4'>
          <div className='flex flex-wrap items-center justify-between gap-2'>
            <p className='text-sm text-muted-foreground'>
              Delivery history refreshes every 15 seconds while this view is
              active.
            </p>
            <Button
              type='button'
              variant='outline'
              size='sm'
              onClick={refresh}
              disabled={isFetchingNotifications}
            >
              <RefreshCw
                className={cn(
                  'mr-2 h-4 w-4',
                  isFetchingNotifications && 'animate-spin',
                )}
              />
              Refresh
            </Button>
          </div>
          <Filters
            filters={filters}
            devices={devices ?? []}
            webhooks={webhooks ?? []}
          />

          {notificationsError && hasConfirmedRows && (
            <div
              role='status'
              aria-live='polite'
              className='flex flex-wrap items-center justify-between gap-2 rounded-lg border border-destructive/40 p-3 text-sm'
            >
              <span>
                Updated deliveries could not be loaded. Existing rows are unchanged.
              </span>
              <Button variant='outline' size='sm' onClick={refresh}>
                Retry refresh
              </Button>
            </div>
          )}

          {isFetchingNotifications && !isLoadingNotifications && (
            <p
              role='status'
              aria-live='polite'
              className='text-sm text-muted-foreground'
            >
              Refreshing…
            </p>
          )}

          {isLoadingNotifications ? (
            <WebhookDeliveriesTable data={[]} isLoading={true} />
          ) : notificationsError && !hasConfirmedRows ? (
            <div className='rounded-lg border p-6 text-center'>
              <p className='text-sm'>Webhook deliveries could not be loaded.</p>
              <Button
                className='mt-3'
                variant='outline'
                size='sm'
                onClick={refresh}
              >
                Retry
              </Button>
            </div>
          ) : (
            <WebhookDeliveriesTable
              data={webhookNotifications?.data?.data || []}
              isLoading={false}
              status={status}
            />
          )}

          <NumberedPagination
            page={page}
            totalPages={totalPages}
            onPageChange={setPage}
          />
        </div>
      </div>
    </div>
  )
}
