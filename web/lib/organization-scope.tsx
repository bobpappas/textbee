'use client'

import { createContext, useContext, type PropsWithChildren } from 'react'

const ActiveOrganizationIdContext = createContext<string | null>(null)

export function OrganizationScopeProvider({
  organizationId,
  children,
}: PropsWithChildren<{ organizationId: string | null }>) {
  return (
    <ActiveOrganizationIdContext.Provider value={organizationId}>
      {children}
    </ActiveOrganizationIdContext.Provider>
  )
}

export function useActiveOrganizationId() {
  return useContext(ActiveOrganizationIdContext)
}
