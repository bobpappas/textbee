export const PUBLIC_WEB_ORIGIN = 'https://textbee.pappas.io'

export function publicWebUrl(path: string): string {
  if (!path.startsWith('/')) {
    throw new Error('public web path must be absolute')
  }
  return new URL(path, PUBLIC_WEB_ORIGIN).toString()
}

export const PUBLIC_LOGO_URL = publicWebUrl('/images/logo.png')
