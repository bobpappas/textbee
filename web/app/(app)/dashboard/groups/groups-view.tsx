'use client'

import Link from 'next/link'
import { Plus, UsersRound } from 'lucide-react'
import { useState } from 'react'
import { freshOrganizationContext, useOrganizationContext } from '@/components/organizations/organization-context-provider'
import OrganizationContextState from '@/components/organizations/organization-context-state'
import EmptyState from '@/components/shared/empty-state'
import ErrorState from '@/components/shared/error-state'
import PageHeader from '@/components/shared/page-header'
import { GroupCommand } from '@/components/groups/group-command'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { GROUPS_MANAGE, GROUPS_READ, useGroups, type ActiveOrganizationContext } from '@/lib/api'

export default function GroupsView() {
  const context = useOrganizationContext()
  const fresh = freshOrganizationContext(context)
  const active = fresh?.state === 'ACTIVE' ? (fresh as ActiveOrganizationContext) : null
  const canRead = Boolean(active?.capabilities.includes(GROUPS_READ))
  const canManage = Boolean(active?.capabilities.includes(GROUPS_MANAGE))
  const [includeArchived, setIncludeArchived] = useState(false)
  const groups = useGroups(active?.organization.id ?? '', includeArchived && canManage, {
    enabled: canRead,
    retry: false,
  })

  if (context.isPending || context.isFetching) {
    return <div aria-label="Loading groups" className="container mx-auto space-y-3 px-4 py-6"><Skeleton className="h-10 w-56" /><Skeleton className="h-44 w-full" /></div>
  }
  if (context.data?.state === 'NO_ACCESS' || context.data?.state === 'SELECTION_REQUIRED') {
    return <OrganizationContextState state={context.data.state} onRefresh={() => context.refetch()} isRefreshing={context.isFetching} />
  }
  if (!canRead) {
    return <div className="container mx-auto px-4 py-6"><ErrorState title="No group access" error={new Error('You are not assigned to an active group.')} /></div>
  }

  return (
    <section className="container mx-auto min-w-0 px-4 py-6 sm:px-6">
      <PageHeader
        title={canManage ? 'Manage groups' : 'My Groups'}
        description={canManage ? 'Create groups, manage owners, and maintain active or archived rosters.' : 'Open the active groups you own and maintain their rosters.'}
        icon={UsersRound}
        actions={canManage ? <Button asChild><Link href="/dashboard/groups/new"><Plus />Create group</Link></Button> : undefined}
      />
      {canManage && (
        <label className="mb-4 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={includeArchived} onChange={(event) => setIncludeArchived(event.target.checked)} />
          Include archived groups
        </label>
      )}
      {groups.isPending ? (
        <div className="space-y-3"><Skeleton className="h-44 w-full" /><Skeleton className="h-44 w-full" /></div>
      ) : groups.isError ? (
        <ErrorState title="Groups could not be loaded" error={groups.error} onRetry={() => groups.refetch()} />
      ) : groups.data.length === 0 ? (
        <Card><CardContent className="pt-6"><EmptyState icon={UsersRound} title={canManage ? 'No groups yet' : 'No assigned groups'} hint={canManage ? 'Create the first organization group.' : 'An organization administrator can assign you to a group.'} /></CardContent></Card>
      ) : (
        <div className="grid min-w-0 gap-4 lg:grid-cols-2">
          {groups.data.map((group) => (
            <Card key={group.id} className="min-w-0">
              <CardHeader className="space-y-3">
                <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
                  <CardTitle className="min-w-0 break-words">{group.displayName}</CardTitle>
                  <Badge variant={group.status === 'ACTIVE' ? 'outline' : 'secondary'}>{group.status === 'ACTIVE' ? 'Active' : 'Archived'}</Badge>
                </div>
                <GroupCommand group={group} />
              </CardHeader>
              <CardContent className="space-y-4">
                <dl className="grid grid-cols-2 gap-3 text-sm">
                  <div><dt className="text-muted-foreground">Roster</dt><dd>{group.rosterCount} people</dd></div>
                  <div><dt className="text-muted-foreground">Owners</dt><dd className="break-words">{group.owners.map((owner) => owner.displayName).join(', ') || 'No assigned owners'}</dd></div>
                </dl>
                <Button asChild variant="outline"><Link href={`/dashboard/groups/${group.id}`}>{group.status === 'ACTIVE' ? 'Open group' : 'View archived group'}</Link></Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </section>
  )
}
