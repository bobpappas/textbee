import { describe, expect, it } from 'vitest'
import { resolveServerApiBaseUrl } from './server-api-base-url'

describe('resolveServerApiBaseUrl', () => {
  it('uses the Docker service for server-side requests in an image', () => {
    expect(
      resolveServerApiBaseUrl({
        containerRuntime: 'docker',
        publicApiBaseUrl: '/api/v1',
      })
    ).toBe('http://textbee-api:3001/api/v1')
  })

  it('does not pass a relative browser route to Node axios', () => {
    expect(resolveServerApiBaseUrl({ publicApiBaseUrl: '/api/v1' })).toBe(
      'http://localhost:3001/api/v1'
    )
  })

  it('retains an absolute public URL outside Docker', () => {
    expect(
      resolveServerApiBaseUrl({
        publicApiBaseUrl: 'https://textbee.example/api/v1',
      })
    ).toBe('https://textbee.example/api/v1')
  })
})
