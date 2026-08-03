'use client'

import Link from 'next/link'
import { Building2, Plus } from 'lucide-react'
import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import EmptyState from '@/components/shared/empty-state'
import ErrorState from '@/components/shared/error-state'
import PageHeader from '@/components/shared/page-header'
import { useOrganizations, useRetryOrganizationProvisioning } from '@/lib/api'
import type { OrganizationRegistryItem } from '@/lib/api/types'
import CreateOrganizationDialog from './create-organization-dialog'
import { useToast } from '@/hooks/use-toast'
import { apiErrorMessage } from '@/lib/utils/errorHandler'

const date = (value?: string | null) =>
  value
    ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(
        new Date(value),
      )
    : '—'

const statusLabel = (status: OrganizationRegistryItem['status']) =>
  status === 'ACTIVE'
    ? 'Active'
    : status === 'PROVISIONING_FAILED'
      ? 'Provisioning failed'
      : 'Provisioning'

function Actions({ organization }: { organization: OrganizationRegistryItem }) {
  const retry = useRetryOrganizationProvisioning()
  const { toast } = useToast()
  if (organization.status !== 'ACTIVE') {
    return (
      <Button
        size="sm"
        variant="outline"
        disabled={retry.isPending}
        onClick={() =>
          retry.mutate(organization.id, {
            onSuccess: () =>
              toast({
                title: 'Provisioning complete',
                description: `${organization.displayName} is ready to manage.`,
              }),
            onError: (error) =>
              toast({
                title: 'Provisioning retry failed',
                description:
                  apiErrorMessage(error) || 'Try the provisioning retry again.',
                variant: 'destructive',
              }),
          })
        }
      >
        {retry.isPending ? 'Retrying…' : 'Retry provisioning'}
      </Button>
    )
  }
  return organization.canManageProfile ? (
    <Button size="sm" variant="outline" asChild>
      <Link href={`/dashboard/admin/organizations/${organization.id}`}>
        Manage
      </Link>
    </Button>
  ) : null
}

export default function OrganizationRegistry() {
  const [createOpen, setCreateOpen] = useState(false)
  const organizations = useOrganizations()

  return (
    <section className="container mx-auto px-4 py-6 sm:px-6">
      <PageHeader
        title="Organizations"
        description="Create organizations and manage profiles you administer."
        icon={Building2}
        actions={
          organizations.isSuccess ? (
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Create organization
            </Button>
          ) : undefined
        }
      />

      {organizations.isPending ? (
        <div aria-label="Loading organizations" className="space-y-3">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      ) : organizations.isError ? (
        <ErrorState
          error={organizations.error}
          title={
            (organizations.error as any)?.response?.status === 403
              ? 'Access denied'
              : 'Organizations could not be loaded'
          }
          onRetry={
            (organizations.error as any)?.response?.status === 403
              ? undefined
              : () => organizations.refetch()
          }
        />
      ) : organizations.data.length === 0 ? (
        <Card>
          <CardContent>
            <EmptyState
              icon={Building2}
              title="No organizations yet"
              hint="Create the first organization to begin."
            />
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="hidden overflow-hidden rounded-lg border md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Organization</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Activated</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {organizations.data.map((organization) => (
                  <TableRow key={organization.id}>
                    <TableCell className="font-medium">
                      {organization.displayName}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {statusLabel(organization.status)}
                      </Badge>
                    </TableCell>
                    <TableCell>{date(organization.createdAt)}</TableCell>
                    <TableCell>{date(organization.activatedAt)}</TableCell>
                    <TableCell className="text-right">
                      <Actions organization={organization} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="grid gap-3 md:hidden">
            {organizations.data.map((organization) => (
              <Card key={organization.id}>
                <CardContent className="space-y-3 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <h3 className="min-w-0 break-words font-medium">
                      {organization.displayName}
                    </h3>
                    <Badge variant="outline">
                      {statusLabel(organization.status)}
                    </Badge>
                  </div>
                  <dl className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <dt className="text-muted-foreground">Created</dt>
                      <dd>{date(organization.createdAt)}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Activated</dt>
                      <dd>{date(organization.activatedAt)}</dd>
                    </div>
                  </dl>
                  <div className="flex justify-end">
                    <Actions organization={organization} />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}
      <CreateOrganizationDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
      />
    </section>
  )
}
