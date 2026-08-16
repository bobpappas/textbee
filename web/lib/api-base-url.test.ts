import { describe, expect, it } from 'vitest'
import {
  resolveBrowserApiBaseUrl,
  SAME_ORIGIN_API_BASE_URL,
} from './api-base-url'

describe('resolveBrowserApiBaseUrl', () => {
  it.each([undefined, '', '   '])(
    'defaults a missing build-time override to the proxy API prefix',
    (override) => {
      expect(resolveBrowserApiBaseUrl(override)).toBe('/api/v1')
    }
  )

  it('retains an explicit build-time public override', () => {
    expect(
      resolveBrowserApiBaseUrl(' https://textbee.example/api/v1 ')
    ).toBe('https://textbee.example/api/v1')
  })

  it('keeps the default independent of browser hostnames', () => {
    expect(SAME_ORIGIN_API_BASE_URL).not.toContain('localhost')
    expect(SAME_ORIGIN_API_BASE_URL).not.toMatch(/^https?:/)
  })

  it.each([
    ['http://localhost:8080', 'http://localhost:8080/api/v1'],
    ['http://192.168.1.68:8080', 'http://192.168.1.68:8080/api/v1'],
  ])('follows the browser origin %s', (origin, expected) => {
    expect(new URL(resolveBrowserApiBaseUrl(), origin).toString()).toBe(
      expected
    )
  })
})
