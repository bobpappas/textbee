import { describe, expect, it } from 'vitest'
import {
  getAvailabilityBadgeVariant,
  getAvailabilityLabel,
} from './device-availability'

describe('device availability display', () => {
  it('only gives online gateways the active badge', () => {
    expect(getAvailabilityBadgeVariant('ONLINE')).toBe('default')
    expect(getAvailabilityBadgeVariant('STALE')).toBe('secondary')
    expect(getAvailabilityBadgeVariant('NEEDS_ATTENTION')).toBe('secondary')
    expect(getAvailabilityBadgeVariant('OFFLINE')).toBe('secondary')
  })

  it('does not imply an enabled legacy gateway is online', () => {
    expect(getAvailabilityLabel(undefined, true)).toBe('NEEDS_ATTENTION')
  })
})
