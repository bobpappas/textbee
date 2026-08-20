'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import OrganizationContextState from '@/components/organizations/organization-context-state'
import {
  freshOrganizationContext,
  useOrganizationContext,
} from '@/components/organizations/organization-context-provider'
import ErrorState from '@/components/shared/error-state'
import PageHeader from '@/components/shared/page-header'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import {
  OPERATORS_MANAGE,
  useAddOrganizationOperator,
  useChangeOrganizationAdmin,
  useChangeOrganizationOperatorStatus,
  useOrganizationOperators,
  type OrganizationOperator,
  type ActiveOrganizationContext,
} from '@/lib/api'
import { apiErrorMessage } from '@/lib/utils/errorHandler'

type Change =
  | { kind: 'admin'; operator: OrganizationOperator; enabled: boolean }
  | {
      kind: 'status'
      operator: OrganizationOperator
      status: 'ACTIVE' | 'SUSPENDED' | 'REVOKED'
    }

const changed = (value?: string) =>
  value
    ? new Intl.DateTimeFormat(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(new Date(value))
    : '—'

export default function OperatorAccess() {
  const context = useOrganizationContext()
  const fresh = freshOrganizationContext(context)
  const active: ActiveOrganizationContext | null =
    fresh?.state === 'ACTIVE' && fresh.capabilities.includes(OPERATORS_MANAGE)
      ? (fresh as ActiveOrganizationContext)
      : null
  const operators = useOrganizationOperators(
    active?.organization.id ?? '',
    Boolean(active),
  )
  const [status, setStatus] = useState('ALL')
  const [admin, setAdmin] = useState('ALL')
  const filtered = useMemo(
    () =>
      (operators.data ?? []).filter(
        (operator) =>
          (status === 'ALL' || operator.status === status) &&
          (admin === 'ALL' ||
            operator.organizationAdmin === (admin === 'ADMIN')),
      ),
    [admin, operators.data, status],
  )

  if (context.isPending || context.isFetching) {
    return (
      <div className="container mx-auto space-y-4 px-4 py-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-72 w-full" />
      </div>
    )
  }
  if (context.isError) {
    return (
      <div className="container mx-auto px-4 py-6">
        <ErrorState
          title="Organization context could not be loaded"
          error={context.error}
          onRetry={() => context.refetch()}
        />
      </div>
    )
  }
  if (context.data?.state !== 'ACTIVE') {
    return (
      <OrganizationContextState
        state={context.data?.state ?? 'NO_ACCESS'}
        onRefresh={() => context.refetch()}
        isRefreshing={context.isFetching}
      />
    )
  }
  if (!active) {
    return (
      <div className="container mx-auto px-4 py-6">
        <ErrorState
          title="Operator Access is unavailable"
          error={
            new Error(
              'Your current organization grant does not permit operator administration.',
            )
          }
        />
      </div>
    )
  }

  return (
    <div className="container mx-auto space-y-6 px-4 py-6">
      <PageHeader
        title="Operator Access"
        description={`${active.organization.displayName} dashboard access. Operators authenticate; contacts receive SMS and never log in.`}
      />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap gap-3">
          <label className="space-y-1 text-sm">
            Status
            <select
              aria-label="Filter by membership status"
              className="block rounded-md border bg-background px-3 py-2"
              value={status}
              onChange={(event) => setStatus(event.target.value)}
            >
              <option value="ALL">All statuses</option>
              <option value="ACTIVE">Active</option>
              <option value="SUSPENDED">Suspended</option>
              <option value="REVOKED">Revoked</option>
            </select>
          </label>
          <label className="space-y-1 text-sm">
            Organization role
            <select
              aria-label="Filter by organization role"
              className="block rounded-md border bg-background px-3 py-2"
              value={admin}
              onChange={(event) => setAdmin(event.target.value)}
            >
              <option value="ALL">All roles</option>
              <option value="ADMIN">Administrators</option>
              <option value="MEMBER">Non-administrators</option>
            </select>
          </label>
        </div>
        <AddOperator organizationId={active.organization.id} />
      </div>
      {operators.isPending ? (
        <Skeleton className="h-72 w-full" />
      ) : operators.isError ? (
        <ErrorState
          title="Operators could not be loaded"
          error={operators.error}
          onRetry={() => operators.refetch()}
        />
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            No operators match these filters.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {filtered.map((operator) => (
            <OperatorCard
              key={operator.membershipId}
              operator={operator}
              organizationId={active.organization.id}
              usableAdminCount={
                (operators.data ?? []).filter(
                  (item) => item.status === 'ACTIVE' && item.organizationAdmin,
                ).length
              }
            />
          ))}
        </div>
      )}
    </div>
  )
}

function AddOperator({ organizationId }: { organizationId: string }) {
  const mutation = useAddOrganizationOperator(organizationId)
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [reason, setReason] = useState('')
  const [message, setMessage] = useState('')
  const submit = () =>
    mutation.mutate(
      { email, reason },
      {
        onSuccess: () => {
          setOpen(false)
          setEmail('')
          setReason('')
          setMessage('')
        },
        onError: (error) =>
          setMessage(
            apiErrorMessage(error) || 'The operator could not be added.',
          ),
      },
    )
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>Add operator</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add operator</DialogTitle>
          <DialogDescription>
            Add an already approved application user by exact email. The new
            membership starts with no permissions.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="operator-email">Exact email</Label>
            <Input
              id="operator-email"
              type="email"
              autoComplete="off"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="operator-add-reason">Administrative reason</Label>
            <Textarea
              id="operator-add-reason"
              value={reason}
              maxLength={500}
              onChange={(event) => setReason(event.target.value)}
            />
          </div>
          <p role="alert" className="text-sm text-destructive">
            {message}
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            disabled={
              !email.trim() || reason.trim().length < 2 || mutation.isPending
            }
            onClick={submit}
          >
            {mutation.isPending ? 'Adding…' : 'Add without permissions'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function OperatorCard({
  operator,
  organizationId,
  usableAdminCount,
}: {
  operator: OrganizationOperator
  organizationId: string
  usableAdminCount: number
}) {
  const [change, setChange] = useState<Change | null>(null)
  const lastUsableAdmin =
    operator.status === 'ACTIVE' &&
    operator.organizationAdmin &&
    usableAdminCount === 1
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{operator.displayName}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <dl className="grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <dt className="text-muted-foreground">Email</dt>
            <dd className="break-all">{operator.email}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Membership</dt>
            <dd>{operator.status}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Organization role</dt>
            <dd>
              {operator.organizationAdmin
                ? 'Administrator'
                : 'No organization role'}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Last change</dt>
            <dd>{changed(operator.changedAt)}</dd>
          </div>
        </dl>
        <p className="text-sm">
          <span className="text-muted-foreground">Group assignments: </span>
          {[
            ...(operator.groupOwners ?? []).map((name) => `${name} (owner)`),
            ...(operator.groupSenders ?? []).map((name) => `${name} (sender)`),
          ].join(', ') || 'None'}{' '}
          {operator.status === 'ACTIVE' && (
            <Link
              className="ml-2 text-primary underline"
              href="/dashboard/groups"
            >
              Manage on Groups
            </Link>
          )}
        </p>
        {lastUsableAdmin && (
          <p className="text-sm text-muted-foreground">
            Another active administrator is required before this operator can be
            demoted, suspended, or revoked.
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          {operator.status === 'ACTIVE' ? (
            <>
              <Button
                size="sm"
                variant="outline"
                disabled={lastUsableAdmin && operator.organizationAdmin}
                onClick={() =>
                  setChange({
                    kind: 'admin',
                    operator,
                    enabled: !operator.organizationAdmin,
                  })
                }
              >
                {operator.organizationAdmin
                  ? 'Revoke administrator'
                  : 'Grant administrator'}
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={lastUsableAdmin}
                onClick={() =>
                  setChange({ kind: 'status', operator, status: 'SUSPENDED' })
                }
              >
                Suspend
              </Button>
              <Button
                size="sm"
                variant="destructive"
                disabled={lastUsableAdmin}
                onClick={() =>
                  setChange({ kind: 'status', operator, status: 'REVOKED' })
                }
              >
                Revoke membership
              </Button>
            </>
          ) : (
            <Button
              size="sm"
              onClick={() =>
                setChange({ kind: 'status', operator, status: 'ACTIVE' })
              }
            >
              Reactivate
            </Button>
          )}
        </div>
        <ConfirmChange
          organizationId={organizationId}
          change={change}
          onClose={() => setChange(null)}
        />
      </CardContent>
    </Card>
  )
}

function ConfirmChange({
  organizationId,
  change,
  onClose,
}: {
  organizationId: string
  change: Change | null
  onClose: () => void
}) {
  const statusMutation = useChangeOrganizationOperatorStatus(organizationId)
  const adminMutation = useChangeOrganizationAdmin(organizationId)
  const [reason, setReason] = useState('')
  const [message, setMessage] = useState('')
  if (!change) return null
  const description =
    change.kind === 'admin'
      ? `${change.enabled ? 'Grant' : 'Revoke'} organization-administrator authority for ${change.operator.displayName}.`
      : `${change.status === 'ACTIVE' ? 'Reactivate' : change.status === 'SUSPENDED' ? 'Suspend' : 'Revoke'} ${change.operator.displayName}'s organization membership. Access changes on the next API request.`
  const submit = () => {
    const callbacks = {
      onSuccess: () => {
        setReason('')
        setMessage('')
        onClose()
      },
      onError: (error: Error) =>
        setMessage(
          apiErrorMessage(error) || 'The access change could not be applied.',
        ),
    }
    if (change.kind === 'admin')
      adminMutation.mutate(
        {
          membershipId: change.operator.membershipId,
          enabled: change.enabled,
          reason,
        },
        callbacks,
      )
    else
      statusMutation.mutate(
        {
          membershipId: change.operator.membershipId,
          status: change.status,
          reason,
        },
        callbacks,
      )
  }
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Confirm access change</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="operator-change-reason">Required reason</Label>
          <Textarea
            id="operator-change-reason"
            value={reason}
            maxLength={500}
            onChange={(event) => setReason(event.target.value)}
          />
          <p role="alert" className="text-sm text-destructive">
            {message}
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={
              reason.trim().length < 2 ||
              statusMutation.isPending ||
              adminMutation.isPending
            }
            onClick={submit}
          >
            Confirm change
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
