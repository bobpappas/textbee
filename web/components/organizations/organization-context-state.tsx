'use client'

import { Building2, RefreshCw } from 'lucide-react'
import { signOut } from 'next-auth/react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Routes } from '@/config/routes'

export default function OrganizationContextState({
  state,
  onRefresh,
  isRefreshing = false,
}: {
  state: 'NO_ACCESS' | 'SELECTION_REQUIRED' | 'NO_PERMISSIONS'
  onRefresh: () => void
  isRefreshing?: boolean
}) {
  const noAccess = state === 'NO_ACCESS'
  const noPermissions = state === 'NO_PERMISSIONS'
  return (
    <section className="container mx-auto px-4 py-10 sm:px-6">
      <Card className="mx-auto max-w-xl">
        <CardContent className="flex flex-col items-center gap-4 p-8 text-center">
          <div className="rounded-full bg-muted p-3">
            <Building2 className="h-6 w-6" aria-hidden="true" />
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold tracking-tight">
              {noAccess
                ? 'No organization access'
                : noPermissions
                  ? 'No permissions assigned'
                  : 'Organization selection required'}
            </h1>
            <p className="text-sm text-muted-foreground">
              {noAccess
                ? 'Your account does not have active access to an organization. Ask an administrator to grant access, then refresh this page.'
                : noPermissions
                  ? 'Your membership is active, but an administrator has not assigned an organization or group role. Refresh after a role is granted.'
                  : 'Your account belongs to more than one organization. Organization switching is not available in this version. Ask a platform administrator for assistance.'}
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={onRefresh}
              disabled={isRefreshing}
            >
              <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
              {isRefreshing ? 'Refreshing…' : 'Refresh'}
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => signOut({ callbackUrl: Routes.login })}
            >
              Sign out
            </Button>
          </div>
        </CardContent>
      </Card>
    </section>
  )
}
