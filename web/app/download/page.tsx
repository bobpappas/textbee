import Link from 'next/link'
import { Check, Info, ShieldCheck, Smartphone } from 'lucide-react'

import { Button } from '@/components/ui/button'

export default function DownloadPage() {
  return (
    <div className='min-h-screen px-4 py-16'>
      <div className='container mx-auto max-w-3xl'>
        <div className='mb-10 text-center'>
          <div className='mb-4 inline-flex items-center rounded-full border border-brand-200 bg-brand-50 px-3 py-1 text-sm text-brand-700 dark:border-brand-800 dark:bg-brand-950 dark:text-brand-300'>
            <Smartphone className='mr-2 h-3.5 w-3.5' />
            TextBee for Android
          </div>
          <h1 className='text-4xl font-bold tracking-tight text-gray-900 dark:text-white'>
            Get the compatible Android app
          </h1>
          <p className='mx-auto mt-4 max-w-2xl text-lg text-gray-600 dark:text-gray-400'>
            This self-hosted service requires an APK built specifically for
            this deployment.
          </p>
        </div>

        <div className='overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-800'>
          <div className='p-6 sm:p-8'>
            <div className='flex items-start gap-3'>
              <ShieldCheck className='mt-0.5 h-6 w-6 shrink-0 text-brand-600 dark:text-brand-400' />
              <div>
                <h2 className='text-2xl font-semibold text-gray-900 dark:text-white'>
                  Administrator-provided APK
                </h2>
                <p className='mt-3 text-gray-600 dark:text-gray-300'>
                  Ask the administrator of this TextBee deployment for the
                  reviewed, compatible APK and installation instructions. No
                  public APK is currently distributed from this page.
                </p>
              </div>
            </div>

            <div className='mt-6 rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100'>
              <div className='flex items-start gap-3'>
                <Info className='mt-0.5 h-5 w-5 shrink-0' />
                <p>
                  APKs published by the upstream <code>vernu/textbee</code>{' '}
                  project connect to the upstream TextBee service. They are not
                  compatible with this self-hosted deployment.
                </p>
              </div>
            </div>

            <h3 className='mt-8 text-lg font-semibold text-gray-900 dark:text-white'>
              Before installing
            </h3>
            <ul className='mt-3 space-y-3 text-gray-600 dark:text-gray-300'>
              <li className='flex items-start gap-2'>
                <Check className='mt-0.5 h-5 w-5 shrink-0 text-green-500' />
                Use only the APK supplied by this deployment&apos;s
                administrator.
              </li>
              <li className='flex items-start gap-2'>
                <Check className='mt-0.5 h-5 w-5 shrink-0 text-green-500' />
                Install it on an Android 7.0 or newer device with SMS
                capability.
              </li>
              <li className='flex items-start gap-2'>
                <Check className='mt-0.5 h-5 w-5 shrink-0 text-green-500' />
                Grant the SMS and phone permissions required for gateway
                operation.
              </li>
              <li className='flex items-start gap-2'>
                <Check className='mt-0.5 h-5 w-5 shrink-0 text-green-500' />
                Register the app with an API key generated in this dashboard.
              </li>
            </ul>

            <div className='mt-8'>
              <Button asChild>
                <Link href='/dashboard'>Return to dashboard</Link>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
