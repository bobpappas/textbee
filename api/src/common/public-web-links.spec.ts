import {
  PUBLIC_LOGO_URL,
  PUBLIC_WEB_ORIGIN,
  publicWebUrl,
} from './public-web-links'

describe('public web links', () => {
  it('keeps generated destinations on the self-hosted origin', () => {
    expect(PUBLIC_WEB_ORIGIN).toBe('https://textbee.pappas.io')
    expect(publicWebUrl('/quickstart')).toBe(
      'https://textbee.pappas.io/quickstart',
    )
    expect(PUBLIC_LOGO_URL).toBe('https://textbee.pappas.io/images/logo.png')
  })

  it('rejects a relative destination', () => {
    expect(() => publicWebUrl('quickstart')).toThrow(
      'public web path must be absolute',
    )
  })
})
