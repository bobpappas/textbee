export const PUBLIC_WEB_ORIGIN = 'https://textbee.pappas.io'

export function publicWebUrl(path: string): string {
  if (!path.startsWith('/') || path.startsWith('//')) {
    throw new Error('public web path must be absolute')
  }

  const url = new URL(path, PUBLIC_WEB_ORIGIN)
  if (url.origin !== PUBLIC_WEB_ORIGIN) {
    throw new Error('public web path must stay on the canonical origin')
  }
  return url.toString()
}

export const PUBLIC_LOGO_URL = publicWebUrl('/images/logo.png')
