import { ChevronDown } from 'lucide-react'
import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'

export function NativeSelect({ className, ...props }: ComponentProps<'select'>) {
  return <div className="relative min-w-0">
    <select {...props} className={cn('h-9 w-full appearance-none rounded-md border bg-background pl-3 pr-10 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50', className)} />
    <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2" />
  </div>
}
