'use client'

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RefreshCw, Search, X } from 'lucide-react'
import { formatDeviceName, cn } from '@/lib/utils'
import type { Device } from '@/lib/api'

const TYPES = [
  { value: 'all', label: 'All' },
  { value: 'sent', label: 'Sent' },
  { value: 'received', label: 'Received' },
]

type FiltersBarProps = {
  devices: Device[]
  currentDevice: string
  onDeviceChange: (deviceId: string) => void
  messageType: string
  onMessageTypeChange: (type: string) => void
  search: string
  onSearchChange: (value: string) => void
  onRefresh: () => void
  isRefreshing: boolean
}

// Collapsed from a tall labelled card into one compact bar, so messages are
// visible without scrolling past the controls.
export default function FiltersBar({
  devices,
  currentDevice,
  onDeviceChange,
  messageType,
  onMessageTypeChange,
  search,
  onSearchChange,
  onRefresh,
  isRefreshing,
}: FiltersBarProps) {
  return (
    <div className='space-y-3'>
      <div className='flex flex-col gap-2 sm:flex-row sm:items-center'>
        <div className='relative flex-1'>
          <Search className='pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground' />
          <Label htmlFor='message-search' className='sr-only'>
            Search messages
          </Label>
          <Input
            id='message-search'
            type='search'
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder='Search messages or numbers'
            className='h-9 pl-9 pr-9'
          />
          {search && (
            <Button
              type='button'
              variant='ghost'
              size='icon'
              aria-label='Clear search'
              onClick={() => onSearchChange('')}
              className='absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2'
            >
              <X className='h-3.5 w-3.5' />
            </Button>
          )}
        </div>

        <div className='flex items-center gap-2'>
          <Label htmlFor='history-device' className='sr-only'>
            Device
          </Label>
          <Select value={currentDevice} onValueChange={onDeviceChange}>
            <SelectTrigger id='history-device' className='h-9 w-full sm:w-52'>
              <SelectValue placeholder='Select a device' />
            </SelectTrigger>
            <SelectContent>
              {devices.map((device) => (
                <SelectItem key={device._id} value={device._id}>
                  {formatDeviceName(device)}
                  {device.enabled ? '' : ' (disabled)'}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            type='button'
            variant='outline'
            size='icon'
            className='h-9 w-9 shrink-0'
            onClick={onRefresh}
            disabled={!currentDevice || isRefreshing}
            aria-label='Refresh messages'
          >
            <RefreshCw
              className={cn('h-4 w-4', isRefreshing && 'animate-spin')}
            />
          </Button>
        </div>
      </div>

      <div
        className='flex w-full gap-1 overflow-x-auto rounded-lg bg-muted p-1 sm:w-fit'
        role='tablist'
        aria-label='Message direction'
      >
        {TYPES.map((type) => (
          <button
            key={type.value}
            type='button'
            role='tab'
            aria-selected={messageType === type.value}
            onClick={() => onMessageTypeChange(type.value)}
            className={cn(
              'shrink-0 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
              messageType === type.value
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {type.label}
          </button>
        ))}
      </div>
    </div>
  )
}
