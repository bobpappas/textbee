import Link from 'next/link'
import { CheckCircle2, Smartphone } from 'lucide-react'

import { Button } from '@/components/ui/button'

const steps = [
  {
    title: 'Get the compatible Android app',
    detail: (
      <>
        Open the <Link href='/download'>download page</Link> and obtain the
        administrator-reviewed APK for this deployment.
      </>
    ),
  },
  {
    title: 'Install the app and grant permissions',
    detail:
      'Install the APK on the gateway phone and allow the phone and SMS permissions it requests.',
  },
  {
    title: 'Generate registration credentials',
    detail: (
      <>
        <Link href='/login'>Sign in</Link>, open the dashboard, and generate an
        API key or QR code. Keep that credential private.
      </>
    ),
  },
  {
    title: 'Register the phone',
    detail:
      'Scan the QR code or enter the API key in the Android app to connect the phone to this deployment.',
  },
  {
    title: 'Confirm the gateway is current',
    detail:
      'Return to the dashboard and wait for a current device heartbeat before attempting an authorized message.',
  },
]

export default function QuickStartPage() {
  return (
    <main className='min-h-screen px-4 py-16'>
      <div className='container mx-auto max-w-3xl'>
        <div className='mb-10 text-center'>
          <Smartphone className='mx-auto mb-4 h-10 w-10 text-brand-600' />
          <h1 className='text-4xl font-bold tracking-tight'>Quick start</h1>
          <p className='mx-auto mt-4 max-w-2xl text-lg text-muted-foreground'>
            Connect a compatible Android phone to this self-hosted TextBee
            deployment.
          </p>
        </div>

        <ol className='space-y-4'>
          {steps.map((step, index) => (
            <li
              key={step.title}
              className='flex gap-4 rounded-xl border bg-card p-5 shadow-sm'
            >
              <CheckCircle2 className='mt-0.5 h-6 w-6 shrink-0 text-brand-600' />
              <div>
                <h2 className='font-semibold'>
                  {index + 1}. {step.title}
                </h2>
                <p className='mt-1 text-muted-foreground'>{step.detail}</p>
              </div>
            </li>
          ))}
        </ol>

        <div className='mt-8 flex flex-wrap gap-3'>
          <Button asChild>
            <Link href='/download'>Android app instructions</Link>
          </Button>
          <Button asChild variant='outline'>
            <Link href='/dashboard'>Open dashboard</Link>
          </Button>
        </div>
      </div>
    </main>
  )
}
