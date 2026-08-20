'use client'

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  type PropsWithChildren,
} from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useOrganizationContextQuery } from '@/lib/api'
import { queryKeys } from '@/lib/api/query-keys'

type ContextQuery = ReturnType<typeof useOrganizationContextQuery>

const OrganizationContextQueryContext = createContext<ContextQuery | null>(null)

export default function OrganizationContextProvider({
  enabled,
  children,
}: PropsWithChildren<{ enabled: boolean }>) {
  const queryClient = useQueryClient()
  const context = useOrganizationContextQuery({ enabled })
  const previousOrganizationId = useRef<string | null>(null)

  useEffect(() => {
    if (!context.isSuccess) return
    const organizationId =
      context.data.state === 'ACTIVE' ? context.data.organization.id : null
    if (
      organizationId === null ||
      (previousOrganizationId.current !== null &&
        previousOrganizationId.current !== organizationId)
    ) {
      queryClient.removeQueries({
        predicate: (query) =>
          query.queryKey[0] === 'organizations' &&
          query.queryKey[2] === 'profile',
      })
      queryClient.removeQueries({ queryKey: queryKeys.groupsAll })
      const organizationScopedRoots = new Set([
        'devices',
        'messages',
        'stats',
        'apiKeys',
        'webhooks',
        'currentSubscription',
      ])
      queryClient.removeQueries({
        predicate: (query) =>
          organizationScopedRoots.has(String(query.queryKey[0])),
      })
    }
    previousOrganizationId.current = organizationId
  }, [context.data, context.isSuccess, queryClient])

  return (
    <OrganizationContextQueryContext.Provider value={context}>
      {children}
    </OrganizationContextQueryContext.Provider>
  )
}

export function useOrganizationContext() {
  const context = useContext(OrganizationContextQueryContext)
  if (!context) {
    throw new Error(
      'useOrganizationContext must be used within OrganizationContextProvider',
    )
  }
  return context
}

export function freshOrganizationContext(
  context: Pick<ContextQuery, 'data' | 'isFetching' | 'isSuccess'>,
) {
  return context.isSuccess && !context.isFetching ? context.data : undefined
}
