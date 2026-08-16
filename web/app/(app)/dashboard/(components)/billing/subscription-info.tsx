'use client'

import { Gauge, MessageSquareText, ShieldCheck, Smartphone } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { useSubscription } from '@/lib/api'
import { deriveUsage } from '@/lib/usage'

const limitLabel = (value?: number) =>
  value === -1 ? 'Unlimited by local policy' : value?.toLocaleString() || '—'

export default function SubscriptionInfo() {
  const { data: policyResponse, isLoading, error } = useSubscription()

  if (isLoading)
    return (
      <div role='status' className='space-y-4'>
        <span className='sr-only'>Loading operational SMS policy</span>
        <Skeleton className='h-40 w-full rounded-lg' />
        <Skeleton className='h-52 w-full rounded-lg' />
      </div>
    )

  if (error || !policyResponse)
    return (
      <p className='text-sm text-destructive'>
        Failed to load operational SMS policy
      </p>
    )

  const policy = policyResponse.policy
  const usage = policyResponse.usage
  const { daily, monthly } = deriveUsage(policyResponse)
  const limits = [
    {
      label: 'Rolling minute',
      value: policy?.segmentsPerMinute,
      detail: `${usage?.segmentsThisMinute || 0} segments reserved or attempted`,
      icon: Gauge,
    },
    {
      label: 'Boise calendar day',
      value: policy?.segmentsPerDay,
      detail: `${daily.used} of ${limitLabel(daily.limit)} segments`,
      icon: MessageSquareText,
    },
    {
      label: 'Rolling 30 days',
      value: policy?.segmentsRolling30Days,
      detail: `${monthly.used} of ${limitLabel(monthly.limit)} segments`,
      icon: ShieldCheck,
    },
    {
      label: 'Recipients per send',
      value: policy?.recipientsPerSend,
      detail: 'One request is rejected before partial fan-out',
      icon: Smartphone,
    },
  ]

  return (
    <div className='space-y-4'>
      <section className='rounded-lg border bg-card p-4 shadow-sm'>
        <h3 className='text-lg font-bold'>Administrator self-hosted service</h3>
        <p className='mt-1 text-sm text-muted-foreground'>
          Operational SMS limits protect the dedicated gateway from bursts and
          retry defects. They are local safety controls, not subscriptions or
          feature entitlements.
        </p>
        <p className='mt-3 text-xs text-muted-foreground'>
          Policy timezone: {policy?.timezone || '—'} · Active gateways:{' '}
          {limitLabel(policy?.activeDeviceLimit)}
        </p>
      </section>

      <section className='rounded-lg border bg-card p-4 shadow-sm'>
        <h4 className='mb-3 text-sm font-medium'>Operational SMS limit</h4>
        <div className='grid gap-3 sm:grid-cols-2'>
          {limits.map(({ label, value, detail, icon: Icon }) => (
            <div key={label} className='rounded-md border bg-muted/40 p-3'>
              <div className='flex items-center justify-between gap-2'>
                <p className='text-xs text-muted-foreground'>{label}</p>
                <Icon className='h-4 w-4 text-primary' aria-hidden />
              </div>
              <p className='mt-1 text-lg font-semibold'>{limitLabel(value)}</p>
              <p className='mt-1 text-xs text-muted-foreground'>{detail}</p>
            </div>
          ))}
        </div>
        <p className='mt-3 text-xs text-muted-foreground'>
          Required command responses use a separate allowance of{' '}
          {limitLabel(policy?.complianceSegmentsPerDay)} segments per Boise day.
          Inbound STOP processing remains authoritative even when that allowance
          is exhausted.
        </p>
      </section>
    </div>
  )
}
