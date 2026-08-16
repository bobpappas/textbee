const LOCAL_API_BASE_URL = 'http://localhost:3001/api/v1'
const DOCKER_API_BASE_URL = 'http://textbee-api:3001/api/v1'

export function resolveServerApiBaseUrl(input: {
  containerRuntime?: string
  publicApiBaseUrl?: string
}) {
  if (input.containerRuntime === 'docker') return DOCKER_API_BASE_URL

  const publicBaseUrl = input.publicApiBaseUrl?.trim()
  if (publicBaseUrl && /^https?:\/\//i.test(publicBaseUrl)) return publicBaseUrl

  // Relative browser routes have no origin in Node. Local server-side auth
  // calls therefore use the directly published development API port.
  return LOCAL_API_BASE_URL
}
