'use client'

import Link from 'next/link'
import { Building2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import ErrorState from '@/components/shared/error-state'
import PageHeader from '@/components/shared/page-header'
import { useOrganizationProfile, useRenameOrganization } from '@/lib/api'
import { apiErrorMessage } from '@/lib/utils/errorHandler'

const date = (value?: string | null) =>
  value
    ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(
        new Date(value),
      )
    : '—'

export default function OrganizationProfile({
  organizationId,
}: {
  organizationId: string
}) {
  const profile = useOrganizationProfile(organizationId)
  const rename = useRenameOrganization(organizationId)
  const [displayName, setDisplayName] = useState('')
  const [message, setMessage] = useState('')
  const [fieldError, setFieldError] = useState('')

  useEffect(() => {
    if (profile.data) setDisplayName(profile.data.displayName)
    if (profile.isError) setDisplayName('')
  }, [profile.data, profile.isError])

  if (profile.isPending) {
    return (
      <div className="container mx-auto space-y-4 px-4 py-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-72 w-full" />
      </div>
    )
  }
  if (profile.isError) {
    return (
      <div className="container mx-auto px-4 py-6">
        <ErrorState
          error={profile.error}
          title={
            [403, 404].includes((profile.error as any)?.response?.status)
              ? 'Organization not found or access denied'
              : 'Organization could not be loaded'
          }
          onRetry={
            [403, 404].includes((profile.error as any)?.response?.status)
              ? undefined
              : () => profile.refetch()
          }
        />
      </div>
    )
  }

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    const normalized = displayName.trim()
    if (
      Array.from(normalized).length < 2 ||
      Array.from(normalized).length > 100
    ) {
      setFieldError('Organization name must contain 2 to 100 characters.')
      return
    }
    setFieldError('')
    setMessage('')
    rename.mutate(
      { displayName: normalized },
      {
        onSuccess: (updated) => {
          setDisplayName(updated.displayName)
          setMessage('Organization name updated.')
        },
        onError: (error) =>
          setMessage(apiErrorMessage(error) || 'Changes could not be saved.'),
      },
    )
  }

  return (
    <section className="container mx-auto px-4 py-6 sm:px-6">
      <PageHeader
        title={profile.data.displayName}
        description="Organization profile"
        icon={Building2}
      />
      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>Profile</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <dl className="grid gap-4 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-muted-foreground">Status</dt>
              <dd>Active</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Created</dt>
              <dd>{date(profile.data.createdAt)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Activated</dt>
              <dd>{date(profile.data.activatedAt)}</dd>
            </div>
          </dl>
          <p className="text-sm">
            <span className="text-muted-foreground">Your role:</span>{' '}
            Organization administrator
          </p>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="organization-profile-name">
                Organization name
              </Label>
              <Input
                id="organization-profile-name"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                aria-invalid={Boolean(fieldError)}
                aria-describedby={fieldError ? 'profile-name-error' : undefined}
              />
              {fieldError && (
                <p
                  id="profile-name-error"
                  role="alert"
                  className="text-sm text-destructive"
                >
                  {fieldError}
                </p>
              )}
            </div>
            <p aria-live="polite" className="text-sm text-muted-foreground">
              {message}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={rename.isPending}>
                {rename.isPending ? 'Saving…' : 'Save changes'}
              </Button>
              <Button variant="outline" asChild>
                <Link href="/dashboard/admin/organizations">
                  Back to organizations
                </Link>
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </section>
  )
}
