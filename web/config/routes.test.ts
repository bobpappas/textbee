import { describe, expect, it } from 'vitest'

import { CANONICAL_SITE_ORIGIN, Routes } from './routes'

describe('self-hosted browser routes', () => {
  it('keeps every in-app TextBee destination relative', () => {
    expect(Object.values(Routes)).toEqual(
      expect.arrayContaining([
        '/login',
        '/dashboard',
        '/dashboard/account/get-support',
        '/quickstart',
        '/download',
        '/contribute',
      ])
    )
    expect(Object.values(Routes).every((route) => route.startsWith('/'))).toBe(
      true
    )
  })

  it('uses the canonical origin for out-of-context destinations', () => {
    expect(CANONICAL_SITE_ORIGIN).toBe('https://textbee.pappas.io')
  })
})
