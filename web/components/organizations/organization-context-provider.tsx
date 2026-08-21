'use client'

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useSession } from 'next-auth/react'
import { useOrganizationContextQuery } from '@/lib/api'
import { queryKeys } from '@/lib/api/query-keys'
import { OrganizationScopeProvider } from '@/lib/organization-scope'

type ContextQuery = ReturnType<typeof useOrganizationContextQuery>

const OrganizationContextQueryContext = createContext<ContextQuery | null>(null)

export default function OrganizationContextProvider({
  enabled,
  children,
}: PropsWithChildren<{ enabled: boolean }>) {
  const queryClient = useQueryClient()
  const { data: session } = useSession()
  const contextEnabled = enabled && Boolean(session?.user)
  const context = useOrganizationContextQuery({ enabled: contextEnabled })
  const previousOrganizationId = useRef<string | null>(null)
  const transitionId = useRef(0)
  const [readyOrganizationId, setReadyOrganizationId] = useState<string | null>(
    null,
  )

  const resolvedOrganizationId =
    contextEnabled && context.isSuccess && context.data.state === 'ACTIVE'
      ? context.data.organization.id
      : null
  const visibleOrganizationId =
    !context.isFetching && readyOrganizationId === resolvedOrganizationId
      ? readyOrganizationId
      : null

  useEffect(() => {
    const currentTransition = ++transitionId.current
    const previousOrganization = previousOrganizationId.current

    const transition = async () => {
      if (!contextEnabled) {
        await queryClient.cancelQueries()
        queryClient.clear()
      } else if (
        previousOrganization &&
        previousOrganization !== resolvedOrganizationId
      ) {
        await queryClient.cancelQueries({
          queryKey: queryKeys.organization(previousOrganization),
        })
        queryClient.removeQueries({
          queryKey: queryKeys.organization(previousOrganization),
        })
      }

      if (currentTransition !== transitionId.current) return
      previousOrganizationId.current = resolvedOrganizationId
      setReadyOrganizationId(resolvedOrganizationId)
    }

    void transition()
  }, [contextEnabled, queryClient, resolvedOrganizationId])

  return (
    <OrganizationContextQueryContext.Provider value={context}>
      <OrganizationScopeProvider organizationId={visibleOrganizationId}>
        {children}
      </OrganizationScopeProvider>
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
