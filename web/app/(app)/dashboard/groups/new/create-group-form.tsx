'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { freshOrganizationContext, useOrganizationContext } from '@/components/organizations/organization-context-provider'
import ErrorState from '@/components/shared/error-state'
import PageHeader from '@/components/shared/page-header'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { GROUPS_MANAGE, useCreateGroup, useOrganizationOperators, useReceivingNumbers } from '@/lib/api'
import { apiErrorMessage } from '@/lib/utils/errorHandler'
import { UsersRound } from 'lucide-react'

export default function CreateGroupForm() {
  const router = useRouter()
  const context = useOrganizationContext()
  const active = freshOrganizationContext(context)
  const organizationId = active?.state === 'ACTIVE' ? active.organization.id : ''
  const canManage = active?.state === 'ACTIVE' && active.capabilities.includes(GROUPS_MANAGE)
  const receivingNumbers = useReceivingNumbers(organizationId)
  const operators = useOrganizationOperators(organizationId, canManage)
  const create = useCreateGroup(organizationId)
  const [displayName, setDisplayName] = useState('')
  const [joinCode, setJoinCode] = useState('')
  const [receivingNumberId, setReceivingNumberId] = useState('')
  const [ownerIds, setOwnerIds] = useState<string[]>([])
  const [message, setMessage] = useState('')

  const selectedReceivingNumberId =
    receivingNumberId ||
    (receivingNumbers.data?.length === 1 ? receivingNumbers.data[0].id : '')

  if (!canManage) return <div className="container mx-auto px-4 py-6"><ErrorState title="Group administration unavailable" error={new Error('Organization administrator access is required.')} /></div>

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    setMessage('')
    create.mutate({ displayName, joinCode, receivingNumberId: selectedReceivingNumberId, ownerMembershipIds: ownerIds }, {
      onSuccess: (group) => router.push(`/dashboard/groups/${group.id}`),
      onError: (error) => setMessage(apiErrorMessage(error) || 'Group could not be created.'),
    })
  }

  return (
    <section className="container mx-auto px-4 py-6 sm:px-6">
      <PageHeader title="Create group" description="Create a phone-only roster and choose its SMS join command." icon={UsersRound} />
      <Card className="max-w-2xl"><CardContent className="pt-6">
        <form className="space-y-5" onSubmit={submit}>
          <div className="space-y-2"><Label htmlFor="group-name">Group name</Label><Input id="group-name" value={displayName} maxLength={100} required onChange={(event) => setDisplayName(event.target.value)} /></div>
          <div className="space-y-2"><Label htmlFor="join-code">Join code</Label><Input id="join-code" value={joinCode} minLength={2} maxLength={20} pattern="[A-Za-z0-9]+" required onChange={(event) => setJoinCode(event.target.value.toUpperCase())} /><p className="break-words font-mono text-sm" aria-live="polite">JOIN {joinCode || 'CODE'}</p><p className="text-sm text-muted-foreground">2–20 letters or digits. Unique for this gateway number.</p></div>
          <div className="space-y-2"><Label htmlFor="receiving-number">Receiving number</Label><select id="receiving-number" className="h-9 w-full rounded-md border bg-background px-3 text-sm" value={selectedReceivingNumberId} required onChange={(event) => setReceivingNumberId(event.target.value)}><option value="">Select an available number</option>{receivingNumbers.data?.map((number) => <option key={number.id} value={number.id}>{number.displayNumber}</option>)}</select>{receivingNumbers.isSuccess && receivingNumbers.data.length === 0 && <p role="alert" className="text-sm text-destructive">Receiving number configuration is required before a group can be created.</p>}</div>
          <fieldset className="space-y-2"><legend className="text-sm font-medium">Owners (optional)</legend>{operators.data?.map((operator) => <label key={operator.membershipId} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={ownerIds.includes(operator.membershipId)} onChange={(event) => setOwnerIds((current) => event.target.checked ? [...current, operator.membershipId] : current.filter((id) => id !== operator.membershipId))} />{operator.displayName}</label>)}</fieldset>
          <p role="status" aria-live="polite" className="text-sm text-destructive">{message}</p>
          <div className="flex flex-wrap gap-2"><Button type="submit" disabled={create.isPending || !selectedReceivingNumberId}>{create.isPending ? 'Creating…' : 'Create group'}</Button><Button type="button" variant="outline" onClick={() => router.push('/dashboard/groups')}>Cancel</Button></div>
        </form>
      </CardContent></Card>
    </section>
  )
}
