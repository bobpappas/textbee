export const SAME_ORIGIN_API_BASE_URL = '/api/v1'

/**
 * Browser requests use the reverse proxy by default. NEXT_PUBLIC values are
 * compiled by Next.js, so callers must pass the build-time value explicitly.
 */
export function resolveBrowserApiBaseUrl(override?: string) {
  const configured = override?.trim()
  return configured || SAME_ORIGIN_API_BASE_URL
}
