import type { Device } from '@/lib/api/types'

export type DeviceAvailabilityStatus = NonNullable<
  Device['availability']
>['status']

export const getAvailabilityBadgeVariant = (
  status?: DeviceAvailabilityStatus
): 'default' | 'secondary' => (status === 'ONLINE' ? 'default' : 'secondary')

export const getAvailabilityLabel = (
  status: DeviceAvailabilityStatus | undefined,
  enabled: boolean | undefined
) => status ?? (enabled ? 'NEEDS_ATTENTION' : 'DISABLED')
