'use client'

import Link from 'next/link'
import { ArchiveRestore, Search, UserPlus, UsersRound } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { GroupCommand } from '@/components/groups/group-command'
import { freshOrganizationContext, useOrganizationContext } from '@/components/organizations/organization-context-provider'
import ErrorState from '@/components/shared/error-state'
import PageHeader from '@/components/shared/page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import {
  GROUPS_MANAGE,
  GROUP_ROSTER_MANAGE,
  useAddRosterMember,
  useArchiveGroup,
  useAssignGroupOwner,
  useChangeGroupJoinSettings,
  useGroup,
  useOrganizationOperators,
  useReactivateGroup,
  useReceivingNumbers,
  useRemoveRosterMember,
  useRenameGroup,
  useRevokeGroupOwner,
  useRoster,
  type RosterMember,
  type ActiveOrganizationContext,
} from '@/lib/api'
import { apiErrorMessage } from '@/lib/utils/errorHandler'

export default function GroupWorkspace({ groupId }: { groupId: string }) {
  const context = useOrganizationContext()
  const fresh = freshOrganizationContext(context)
  const active = fresh?.state === 'ACTIVE' ? (fresh as ActiveOrganizationContext) : null
  const organizationId = active?.organization.id ?? ''
  const canManage = Boolean(active?.capabilities.includes(GROUPS_MANAGE))
  const canRoster = Boolean(active?.capabilities.includes(GROUP_ROSTER_MANAGE))
  const group = useGroup(organizationId, groupId, { enabled: Boolean(active), retry: false })
  const refreshedAfterDenial = useRef(false)
  const [search, setSearch] = useState('')
  const roster = useRoster(organizationId, groupId, search, Boolean(active && group.data))

  useEffect(() => {
    const status = (group.error as any)?.response?.status
    if (
      group.isError &&
      [403, 404].includes(status) &&
      !refreshedAfterDenial.current
    ) {
      refreshedAfterDenial.current = true
      void context.refetch()
    }
  }, [context, group.error, group.isError])

  if (!active || group.isPending) return <div aria-label="Loading group" className="container mx-auto space-y-3 px-4 py-6"><Skeleton className="h-10 w-64" /><Skeleton className="h-64 w-full" /></div>
  if (group.isError) return <div className="container mx-auto px-4 py-6"><ErrorState title="Group not found or access denied" error={group.error} /></div>
  const archived = group.data.status === 'ARCHIVED'

  return (
    <section className="container mx-auto min-w-0 px-4 py-6 sm:px-6">
      <PageHeader title={group.data.displayName} description={archived ? 'Archived group detail' : 'Group detail and roster'} icon={UsersRound} actions={<Button asChild variant="outline"><Link href="/dashboard/groups">Back to groups</Link></Button>} />
      <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(18rem,1fr)]">
        <div className="min-w-0 space-y-5">
          <Card className="min-w-0"><CardHeader><div className="flex flex-wrap items-center justify-between gap-2"><CardTitle>Join this group</CardTitle><Badge variant={archived ? 'secondary' : 'outline'}>{archived ? 'Archived' : 'Active'}</Badge></div></CardHeader><CardContent><GroupCommand group={group.data} /></CardContent></Card>
          <Card className="min-w-0">
            <CardHeader><div className="flex flex-wrap items-center justify-between gap-3"><div><CardTitle>Roster</CardTitle><p className="mt-1 text-sm text-muted-foreground">{group.data.rosterCount} active people. Contacts do not receive application accounts.</p></div>{!archived && canRoster && <AddPersonDialog organizationId={organizationId} groupId={groupId} />}</div></CardHeader>
            <CardContent className="min-w-0 space-y-4">
              <Label className="relative block"><span className="sr-only">Search roster</span><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><Input className="pl-9" placeholder="Search this roster" value={search} onChange={(event) => setSearch(event.target.value)} /></Label>
              {roster.isPending ? <Skeleton className="h-32 w-full" /> : roster.isError ? <ErrorState title="Roster could not be loaded" error={roster.error} onRetry={() => roster.refetch()} /> : roster.data.length === 0 ? <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">{search ? 'No people match this search.' : 'No one has been added to this roster.'}</p> : <div className="grid min-w-0 gap-3">{roster.data.map((member) => <div key={member.id} className="flex min-w-0 flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><p className="break-words font-medium">{member.displayName}</p><p className="break-words text-sm text-muted-foreground">{member.displayNumber}</p></div>{!archived && canRoster && <RemoveMemberDialog organizationId={organizationId} groupId={groupId} member={member} />}</div>)}</div>}
            </CardContent>
          </Card>
        </div>
        <div className="min-w-0 space-y-5">
          <Card><CardHeader><CardTitle>Owners</CardTitle></CardHeader><CardContent className="space-y-3"><p className="break-words text-sm">{group.data.owners.map((owner) => owner.displayName).join(', ') || 'No assigned owners'}</p>{canManage && !archived && <OwnerEditor organizationId={organizationId} groupId={groupId} currentOwnerIds={group.data.owners.map((owner) => owner.membershipId)} />}</CardContent></Card>
          {canManage && <AdminSettings organizationId={organizationId} groupId={groupId} groupName={group.data.displayName} joinCode={group.data.joinCode} receivingNumberId={group.data.receivingNumberId} archived={archived} />}
        </div>
      </div>
    </section>
  )
}

function AddPersonDialog({ organizationId, groupId }: { organizationId: string; groupId: string }) {
  const mutation = useAddRosterMember(organizationId, groupId)
  const [open, setOpen] = useState(false)
  const [displayName, setDisplayName] = useState('')
  const [mobileNumber, setMobileNumber] = useState('')
  const [message, setMessage] = useState('')
  const submit = (event: React.FormEvent) => {
    event.preventDefault(); setMessage('')
    mutation.mutate({ displayName, mobileNumber }, { onSuccess: (member) => { setOpen(false); setDisplayName(''); setMobileNumber(''); setMessage(member.reusedContact ? 'Existing organization contact added.' : '') }, onError: (error) => setMessage(apiErrorMessage(error) || 'Person could not be added.') })
  }
  return <Dialog open={open} onOpenChange={setOpen}><DialogTrigger asChild><Button><UserPlus />Add person</Button></DialogTrigger><DialogContent><DialogHeader><DialogTitle>Add person</DialogTitle><DialogDescription>Add a phone-only contact to this group. This does not create a login, invitation, or email workflow.</DialogDescription></DialogHeader><form className="space-y-4" onSubmit={submit}><div className="space-y-2"><Label htmlFor="contact-name">Display name</Label><Input id="contact-name" value={displayName} maxLength={100} required onChange={(event) => setDisplayName(event.target.value)} /></div><div className="space-y-2"><Label htmlFor="contact-mobile">US mobile number</Label><Input id="contact-mobile" type="tel" value={mobileNumber} required placeholder="(208) 555-0123" onChange={(event) => setMobileNumber(event.target.value)} /><p className="text-xs text-muted-foreground">Syntax validation does not prove carrier assignment or SMS capability.</p></div><p role="alert" aria-live="assertive" className="text-sm text-destructive">{message}</p><DialogFooter><Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" disabled={mutation.isPending}>{mutation.isPending ? 'Adding…' : 'Add person'}</Button></DialogFooter></form></DialogContent></Dialog>
}

function RemoveMemberDialog({ organizationId, groupId, member }: { organizationId: string; groupId: string; member: RosterMember }) {
  const mutation = useRemoveRosterMember(organizationId, groupId)
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [message, setMessage] = useState('')
  return <Dialog open={open} onOpenChange={setOpen}><DialogTrigger asChild><Button size="sm" variant="outline">Remove from group</Button></DialogTrigger><DialogContent><DialogHeader><DialogTitle>Remove {member.displayName}?</DialogTitle><DialogDescription>This removes membership from this group only. The organization contact and memberships in other groups remain.</DialogDescription></DialogHeader><div className="space-y-2"><Label htmlFor={`remove-reason-${member.id}`}>Administrative reason</Label><Textarea id={`remove-reason-${member.id}`} value={reason} maxLength={200} required onChange={(event) => setReason(event.target.value)} /></div><p role="alert" className="text-sm text-destructive">{message}</p><DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button variant="destructive" disabled={!reason.trim() || mutation.isPending} onClick={() => mutation.mutate({ membershipId: member.id, reason }, { onSuccess: () => setOpen(false), onError: (error) => setMessage(apiErrorMessage(error) || 'Membership could not be removed.') })}>{mutation.isPending ? 'Removing…' : 'Remove membership'}</Button></DialogFooter></DialogContent></Dialog>
}

function OwnerEditor({ organizationId, groupId, currentOwnerIds }: { organizationId: string; groupId: string; currentOwnerIds: string[] }) {
  const operators = useOrganizationOperators(organizationId)
  const assign = useAssignGroupOwner(organizationId, groupId)
  const revoke = useRevokeGroupOwner(organizationId, groupId)
  const [reason, setReason] = useState('Owner assignment changed by administrator')
  return <div className="space-y-3 border-t pt-3"><p className="text-sm font-medium">Manage owners</p>{operators.data?.map((operator) => { const assigned = currentOwnerIds.includes(operator.membershipId); return <div key={operator.membershipId} className="flex flex-wrap items-center justify-between gap-2 text-sm"><span className="break-words">{operator.displayName}</span><Button size="sm" variant="outline" onClick={() => assigned ? revoke.mutate({ membershipId: operator.membershipId, reason }) : assign.mutate(operator.membershipId)}>{assigned ? 'Revoke' : 'Assign'}</Button></div> })}<Label htmlFor="owner-change-reason" className="text-xs">Revocation reason</Label><Input id="owner-change-reason" value={reason} maxLength={200} onChange={(event) => setReason(event.target.value)} /></div>
}

function AdminSettings({ organizationId, groupId, groupName, joinCode: initialCode, receivingNumberId: initialNumberId, archived }: { organizationId: string; groupId: string; groupName: string; joinCode: string; receivingNumberId: string; archived: boolean }) {
  const rename = useRenameGroup(organizationId, groupId)
  const settings = useChangeGroupJoinSettings(organizationId, groupId)
  const archive = useArchiveGroup(organizationId, groupId)
  const reactivate = useReactivateGroup(organizationId, groupId)
  const numbers = useReceivingNumbers(organizationId)
  const [name, setName] = useState(groupName)
  const [joinCode, setJoinCode] = useState(initialCode)
  const [numberId, setNumberId] = useState(initialNumberId)
  const [reason, setReason] = useState('')
  const [message, setMessage] = useState('')
  if (archived) return <Card><CardHeader><CardTitle>Archived group</CardTitle></CardHeader><CardContent className="space-y-3"><p className="text-sm text-muted-foreground">Roster, owner, name, and join-setting changes are disabled. The command remains reserved.</p><Button onClick={() => reactivate.mutate()} disabled={reactivate.isPending}><ArchiveRestore />{reactivate.isPending ? 'Reactivating…' : 'Reactivate group'}</Button></CardContent></Card>
  return <Card><CardHeader><CardTitle>Group settings</CardTitle></CardHeader><CardContent className="space-y-5"><form className="space-y-2" onSubmit={(event) => { event.preventDefault(); rename.mutate(name, { onSuccess: () => setMessage('Group name updated.'), onError: (error) => setMessage(apiErrorMessage(error) || 'Group name could not be updated.') }) }}><Label htmlFor="edit-group-name">Group name</Label><Input id="edit-group-name" value={name} maxLength={100} onChange={(event) => setName(event.target.value)} /><Button size="sm" type="submit">Save name</Button></form><form className="space-y-2" onSubmit={(event) => { event.preventDefault(); settings.mutate({ joinCode, receivingNumberId: numberId }, { onSuccess: () => setMessage('Join settings updated.'), onError: (error) => setMessage(apiErrorMessage(error) || 'Join settings could not be updated.') }) }}><Label htmlFor="edit-join-code">Join code</Label><Input id="edit-join-code" value={joinCode} pattern="[A-Za-z0-9]+" minLength={2} maxLength={20} onChange={(event) => setJoinCode(event.target.value.toUpperCase())} /><p className="font-mono text-sm">JOIN {joinCode}</p><Label htmlFor="edit-receiving-number">Receiving number</Label><select id="edit-receiving-number" className="h-9 w-full rounded-md border bg-background px-3 text-sm" value={numberId} onChange={(event) => setNumberId(event.target.value)}>{numbers.data?.map((number) => <option key={number.id} value={number.id}>{number.displayNumber}</option>)}</select><p className="text-xs text-muted-foreground">Unique for this gateway number.</p><Button size="sm" type="submit">Save join settings</Button></form><div className="space-y-2 border-t pt-4"><Label htmlFor="archive-reason">Archive reason</Label><Textarea id="archive-reason" value={reason} maxLength={200} onChange={(event) => setReason(event.target.value)} /><p className="text-xs text-muted-foreground">Archiving is reversible and preserves owners, roster, settings, and history.</p><Button variant="destructive" disabled={!reason.trim() || archive.isPending} onClick={() => archive.mutate(reason)}>{archive.isPending ? 'Archiving…' : 'Archive group'}</Button></div><p role="status" aria-live="polite" className="text-sm text-muted-foreground">{message}</p></CardContent></Card>
}
