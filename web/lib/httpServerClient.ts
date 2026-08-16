import axios from 'axios'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { Session } from 'next-auth'
import { resolveServerApiBaseUrl } from './server-api-base-url'

// Create a base URL that works in Docker container network if running in a container
// or falls back to the public URL if not in a container
const getServerSideBaseUrl = () => {
  return resolveServerApiBaseUrl({
    containerRuntime: process.env.CONTAINER_RUNTIME,
    publicApiBaseUrl: process.env.NEXT_PUBLIC_API_BASE_URL,
  })
}

export const httpServerClient = axios.create({
  baseURL: getServerSideBaseUrl(),
})

httpServerClient.interceptors.request.use(async (config) => {
  const session: Session | null = await getServerSession(authOptions as any)
  if (session?.user?.accessToken) {
    config.headers.Authorization = `Bearer ${session.user.accessToken}`
  }
  return config
})
