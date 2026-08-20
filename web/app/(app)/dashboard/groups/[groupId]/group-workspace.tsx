'use client'

import Link from 'next/link'
import { ArchiveRestore, FileUp, Pencil, Search, Send, UserPlus, UsersRound } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { GroupCommand } from '@/components/groups/group-command'
import { freshOrganizationContext, useOrganizationContext } from '@/components/organizations/organization-context-provider'
import ErrorState from '@/components/shared/error-state'
import PageHeader from '@/components/shared/page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import {
  GROUPS_MANAGE,
  GROUP_ROSTER_MANAGE,
  useAddRosterMember,
  useApplyRosterBulkAdd,
  useArchiveGroup,
  useAssignGroupOwner,
  useAssignGroupSender,
  useChangeGroupJoinSettings,
  useContactDetails,
  useGroup,
  usePreviewGroupMessage,
  useConfirmGroupMessage,
  useOrganizationOperators,
  useReactivateGroup,
  useReceivingNumbers,
  useRecordContactConsent,
  useRemoveRosterMember,
  useRenameGroup,
  useRenameContact,
  usePreviewRosterBulkAdd,
  useRevokeGroupOwner,
  useRevokeGroupSender,
  useRoster,
  type RosterMember,
  type RosterBulkImport,
  type GroupMessagePreview,
  type GroupMessageSend,
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
  const roster = useRoster(organizationId, groupId, search, Boolean(active && group.data && canRoster))

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
      <PageHeader title={group.data.displayName} description={archived ? 'Archived group detail' : 'Group detail and roster'} icon={UsersRound} actions={<div className="flex flex-wrap gap-2">{!archived && <GroupMessageDialog key={group.data.joinCode} organizationId={organizationId} groupId={groupId} groupName={group.data.displayName} joinCode={group.data.joinCode} />}<Button asChild variant="outline"><Link href="/dashboard/groups">Back to groups</Link></Button></div>} />
      <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(18rem,1fr)]">
        <div className="min-w-0 space-y-5">
          <Card className="min-w-0"><CardHeader><div className="flex flex-wrap items-center justify-between gap-2"><CardTitle>Join this group</CardTitle><Badge variant={archived ? 'secondary' : 'outline'}>{archived ? 'Archived' : 'Active'}</Badge></div></CardHeader><CardContent><GroupCommand group={group.data} />{!archived && <p className="mt-3 text-xs text-muted-foreground">Advertising must say: Message frequency varies. Message and data rates may apply. Reply STOP to stop all Boise Church of Christ texts; HELP for help. Include an administrator-controlled privacy or support contact.</p>}</CardContent></Card>
          {canRoster ? <Card className="min-w-0">
            <CardHeader><div className="flex flex-wrap items-center justify-between gap-3"><div><CardTitle>Roster</CardTitle><p className="mt-1 text-sm text-muted-foreground">{group.data.rosterCount} active people. Contacts do not receive application accounts.</p></div>{!archived && canRoster && <div className="flex flex-wrap gap-2"><BulkAddDialog organizationId={organizationId} groupId={groupId} /><AddPersonDialog organizationId={organizationId} groupId={groupId} /></div>}</div></CardHeader>
            <CardContent className="min-w-0 space-y-4">
              <Label className="relative block"><span className="sr-only">Search roster</span><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><Input className="pl-9" placeholder="Search this roster" value={search} onChange={(event) => setSearch(event.target.value)} /></Label>
              {roster.isPending ? <Skeleton className="h-32 w-full" /> : roster.isError ? <ErrorState title="Roster could not be loaded" error={roster.error} onRetry={() => roster.refetch()} /> : roster.data.length === 0 ? <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">{search ? 'No people match this search.' : 'No one has been added to this roster.'}</p> : <div className="grid min-w-0 gap-3">{roster.data.map((member) => <div key={member.id} className="flex min-w-0 flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><p className="break-words font-medium">{member.displayName}</p><p className="break-words text-sm text-muted-foreground">{member.displayNumber}</p><p className="mt-1 text-xs text-muted-foreground">{member.consentSource === 'TEXT_TO_JOIN' ? 'Consent: Text-to-Join' : member.consentSource === 'OPERATOR_AFFIRMATION' ? 'Consent: operator affirmation' : 'No active group consent'}</p></div>{!archived && canRoster && <div className="flex flex-wrap gap-2"><ContactDetailsDialog organizationId={organizationId} groupId={groupId} member={member} /><RemoveMemberDialog organizationId={organizationId} groupId={groupId} member={member} /></div>}</div>)}</div>}
            </CardContent>
          </Card> : <Card><CardHeader><CardTitle>Audience preview</CardTitle></CardHeader><CardContent><p className="text-sm">{group.data.rosterCount} active contacts are in this group. Sender access does not expose roster or contact details.</p></CardContent></Card>}
        </div>
        <div className="min-w-0 space-y-5">
          <Card><CardHeader><CardTitle>Owners</CardTitle></CardHeader><CardContent className="space-y-3"><p className="break-words text-sm">{group.data.owners.map((owner) => owner.displayName).join(', ') || 'No assigned owners'}</p>{canManage && !archived && <OwnerEditor organizationId={organizationId} groupId={groupId} currentOwnerIds={group.data.owners.map((owner) => owner.membershipId)} />}</CardContent></Card>
          {canManage && <Card><CardHeader><CardTitle>Senders</CardTitle></CardHeader><CardContent className="space-y-3"><p className="break-words text-sm">{(group.data.senders ?? []).map((sender) => sender.displayName).join(', ') || 'No assigned senders'}</p>{!archived && <SenderEditor organizationId={organizationId} groupId={groupId} currentSenderIds={(group.data.senders ?? []).map((sender) => sender.membershipId)} />}</CardContent></Card>}
          {canManage && <AdminSettings organizationId={organizationId} groupId={groupId} groupName={group.data.displayName} joinCode={group.data.joinCode} receivingNumberId={group.data.receivingNumberId} archived={archived} />}
        </div>
      </div>
    </section>
  )
}

function GroupMessageDialog({ organizationId, groupId, groupName, joinCode }: { organizationId: string; groupId: string; groupName: string; joinCode: string }) {
  const previewMutation = usePreviewGroupMessage(organizationId, groupId)
  const confirmMutation = useConfirmGroupMessage(organizationId, groupId)
  const [open, setOpen] = useState(false)
  const [body, setBody] = useState('')
  const [preview, setPreview] = useState<GroupMessagePreview | null>(null)
  const [result, setResult] = useState<GroupMessageSend | null>(null)
  const [requestId, setRequestId] = useState('')
  const [message, setMessage] = useState('')
  const reset = () => { setBody(''); setPreview(null); setResult(null); setRequestId(''); setMessage('') }
  const createPreview = () => {
    setMessage('')
    previewMutation.mutate(body, {
      onSuccess: (value) => { setPreview(value); setResult(null); setRequestId(crypto.randomUUID()) },
      onError: (error) => setMessage(apiErrorMessage(error) || 'Message preview could not be created.'),
    })
  }
  const confirm = () => {
    if (!preview || !requestId) return
    setMessage('')
    confirmMutation.mutate({ previewId: preview.id, requestId }, {
      onSuccess: setResult,
      onError: (error) => setMessage(apiErrorMessage(error) || 'The group message could not be confirmed.'),
    })
  }
  const capacity = (value: number) => value === -1 ? 'Unlimited' : value.toLocaleString()
  return <Dialog open={open} onOpenChange={(value) => { setOpen(value); if (!value) reset() }}>
    <DialogTrigger asChild><Button><Send />Send message</Button></DialogTrigger>
    <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
      <DialogHeader><DialogTitle>Send to {groupName}</DialogTitle><DialogDescription>Preview the exact recipients and required join-code prefix before confirming. Previewing never sends or reserves capacity.</DialogDescription></DialogHeader>
      {!result && <div className="min-w-0 space-y-4">
        <div className="space-y-2"><Label htmlFor="group-message-prefix">Required prefix</Label><Input id="group-message-prefix" value={`${preview?.joinCode || joinCode}:`} readOnly aria-readonly="true" /></div>
        <div className="space-y-2"><Label htmlFor="group-message-body">Message</Label><Textarea id="group-message-body" value={body} maxLength={1000} rows={5} onChange={(event) => { setBody(event.target.value); setPreview(null); setResult(null); setRequestId(''); setMessage('') }} /><p className="text-xs text-muted-foreground">The prefix is included in segment calculations and cannot be edited.</p></div>
        {!preview ? <Button type="button" onClick={createPreview} disabled={!body.trim() || previewMutation.isPending}>{previewMutation.isPending ? 'Building preview…' : 'Preview recipients'}</Button> : <div className="space-y-4">
          <div role="status" aria-live="polite" className="rounded-lg border p-4 text-sm"><p className="break-words font-medium">{preview.message}</p><p className="mt-2 text-muted-foreground">{preview.eligibleCount} eligible of {preview.candidateCount} candidates · {preview.totalSegments} segments total</p><p className="text-muted-foreground">Remaining local capacity: {capacity(preview.remainingCapacity.minuteSegments)} this minute · {capacity(preview.remainingCapacity.dailySegments)} today · {capacity(preview.remainingCapacity.rolling30DaySegments)} rolling 30 days</p></div>
          {preview.excluded.length > 0 && <div className="space-y-2"><p className="font-medium">Excluded before send ({preview.excludedCount})</p>{preview.excluded.map((item, index) => <div key={`${item.maskedNumber}-${index}`} className="rounded-lg border p-3 text-sm"><p className="break-words font-medium">{item.displayName} · {item.maskedNumber}</p><p className="break-words text-muted-foreground">{item.explanation}</p></div>)}</div>}
          {preview.eligibleCount === 0 && <p role="alert" className="rounded-lg border border-destructive/40 p-3 text-sm text-destructive">No recipients are eligible. Confirmation is disabled.</p>}
          {!preview.capacityAvailable && <p role="alert" className="rounded-lg border border-destructive/40 p-3 text-sm text-destructive">Local SMS capacity cannot accept this send. Wait for the active safety window to reset and create a new preview.</p>}
          <DialogFooter><Button variant="outline" onClick={() => setPreview(null)}>Edit message</Button><Button onClick={confirm} disabled={!preview.canConfirm || confirmMutation.isPending}>{confirmMutation.isPending ? 'Confirming…' : `Confirm send to ${preview.eligibleCount}`}</Button></DialogFooter>
        </div>}
      </div>}
      {result && <div className="space-y-4"><div role="status" aria-live="polite" className="rounded-lg border p-4"><p className="font-medium">Group send {result.status.toLowerCase()}</p><p className="mt-1 break-words text-sm text-muted-foreground">{Object.entries(result.counts).map(([status, count]) => `${status.toLowerCase()}: ${count}`).join(' · ')}</p></div><div className="grid gap-2">{result.recipients.map((item, index) => <div key={`${item.maskedNumber}-${index}`} className="flex min-w-0 flex-col justify-between gap-1 rounded-lg border p-3 text-sm sm:flex-row"><span className="break-words">{item.displayName} · {item.maskedNumber}</span><Badge variant={item.status === 'FAILED' ? 'destructive' : item.status === 'EXCLUDED' ? 'secondary' : 'outline'}>{item.status}</Badge></div>)}</div><DialogFooter><Button onClick={() => setOpen(false)}>Close</Button></DialogFooter></div>}
      <p role="alert" aria-live="assertive" className="text-sm text-destructive">{message}</p>
    </DialogContent>
  </Dialog>
}

function ContactDetailsDialog({ organizationId, groupId, member }: { organizationId: string; groupId: string; member: RosterMember }) {
  const [open, setOpen] = useState(false)
  const details = useContactDetails(organizationId, groupId, member.contactId, open)
  const rename = useRenameContact(organizationId, groupId)
  const recordConsent = useRecordContactConsent(organizationId, groupId)
  const [displayName, setDisplayName] = useState(member.displayName)
  const [affirmed, setAffirmed] = useState(false)
  const [methodNote, setMethodNote] = useState('')
  const [nameMessage, setNameMessage] = useState('')
  const [consentMessage, setConsentMessage] = useState('')
  const source = details.data?.consentSource === 'TEXT_TO_JOIN' ? 'Text-to-Join' : 'Operator affirmation'
  const reset = () => { setAffirmed(false); setMethodNote(''); setNameMessage(''); setConsentMessage('') }
  return <Dialog open={open} onOpenChange={(value) => { setOpen(value); if (!value) reset() }}><DialogTrigger asChild><Button size="sm" variant="outline"><Pencil />Edit details</Button></DialogTrigger><DialogContent className="max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle>Contact details</DialogTitle><DialogDescription>Update the presentation name or review this person&apos;s consent for this group. These are separate actions.</DialogDescription></DialogHeader>{details.isPending ? <Skeleton className="h-48 w-full" /> : details.isError ? <ErrorState title="Contact details could not be loaded" error={details.error} onRetry={() => details.refetch()} /> : details.data && <div className="min-w-0 space-y-5"><form className="space-y-4" onSubmit={(event) => { event.preventDefault(); setNameMessage(''); rename.mutate({ contactId: member.contactId, displayName }, { onSuccess: () => setNameMessage('Name updated.'), onError: (error) => setNameMessage(apiErrorMessage(error) || 'Contact name could not be updated.') }) }}><div className="space-y-2"><Label htmlFor={`contact-name-${member.contactId}`}>Display name</Label><Input id={`contact-name-${member.contactId}`} value={displayName} required maxLength={100} onChange={(event) => setDisplayName(event.target.value)} /></div><div className="space-y-2"><Label htmlFor={`contact-number-${member.contactId}`}>Mobile number</Label><Input id={`contact-number-${member.contactId}`} value={details.data.displayNumber} readOnly aria-readonly="true" /></div><div className="flex flex-wrap items-center gap-3"><Button type="submit" disabled={!displayName.trim() || rename.isPending}>{rename.isPending ? 'Saving…' : 'Save name'}</Button><p role="status" aria-live="polite" className="text-sm text-muted-foreground">{nameMessage}</p></div></form><div className="space-y-3 border-t pt-4"><div><p className="font-medium">Group consent</p><p className="text-sm text-muted-foreground">{details.data.consentStatus === 'ACTIVE' ? 'Active' : details.data.consentStatus === 'OPTED_OUT' ? 'Opted out' : 'Missing'}</p></div>{details.data.consentStatus === 'ACTIVE' && <div className="rounded-lg border p-3 text-sm"><p>Source: {source}</p>{details.data.consentedAt && <p className="text-muted-foreground">Recorded {new Date(details.data.consentedAt).toLocaleString()}</p>}<p className="mt-2 text-muted-foreground">Active consent is read-only. Removing this person from the group ends it.</p></div>}{details.data.consentStatus === 'OPTED_OUT' && <div className="rounded-lg border border-destructive/40 p-3 text-sm"><p className="font-medium">This person has opted out of organization messaging.</p><p className="mt-1 text-muted-foreground">{details.data.recoveryGuidance}</p></div>}{details.data.consentStatus === 'MISSING' && <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); setConsentMessage(''); recordConsent.mutate({ contactId: member.contactId, affirmed, methodNote: methodNote || undefined }, { onSuccess: () => { setAffirmed(false); setMethodNote(''); setConsentMessage('Consent recorded.') }, onError: (error) => setConsentMessage(apiErrorMessage(error) || 'Consent could not be recorded.') }) }}><div className="flex items-start gap-3"><Checkbox id={`contact-details-consent-${member.contactId}`} checked={affirmed} onCheckedChange={(checked) => setAffirmed(checked === true)} /><Label htmlFor={`contact-details-consent-${member.contactId}`} className="font-normal leading-5">This person asked to receive messages or provided this number for church communications.</Label></div><div className="space-y-2"><Label htmlFor={`contact-details-note-${member.contactId}`}>Consent method note (optional)</Label><Textarea id={`contact-details-note-${member.contactId}`} value={methodNote} maxLength={500} onChange={(event) => setMethodNote(event.target.value)} /></div><Button type="submit" disabled={!affirmed || recordConsent.isPending}>{recordConsent.isPending ? 'Recording…' : 'Record consent'}</Button></form>}<p role="status" aria-live="polite" className="text-sm text-muted-foreground">{consentMessage}</p></div><DialogFooter><Button type="button" variant="outline" onClick={() => setOpen(false)}>Close</Button></DialogFooter></div>}</DialogContent></Dialog>
}

function BulkAddDialog({ organizationId, groupId }: { organizationId: string; groupId: string }) {
  const previewMutation = usePreviewRosterBulkAdd(organizationId, groupId)
  const applyMutation = useApplyRosterBulkAdd(organizationId, groupId)
  const [open, setOpen] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<RosterBulkImport | null>(null)
  const [affirmed, setAffirmed] = useState(false)
  const [message, setMessage] = useState('')
  const readyCount = (preview?.counts.READY_NEW_CONTACT || 0) + (preview?.counts.READY_EXISTING_CONTACT || 0)
  const createPreview = async () => {
    if (!file) return
    setMessage('')
    try {
      const content = await file.text()
      previewMutation.mutate(content, { onSuccess: (value) => { setPreview(value); setAffirmed(false) }, onError: (error) => setMessage(apiErrorMessage(error) || 'CSV preview could not be created.') })
    } catch {
      setMessage('The selected file could not be read.')
    }
  }
  const reset = () => { setFile(null); setPreview(null); setAffirmed(false); setMessage('') }
  return <Dialog open={open} onOpenChange={(value) => { setOpen(value); if (!value) reset() }}><DialogTrigger asChild><Button variant="outline"><FileUp />Bulk add</Button></DialogTrigger><DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto"><DialogHeader><DialogTitle>Bulk add people</DialogTitle><DialogDescription>Preview a UTF-8 CSV before adding ready rows. No preview sends messages or creates application accounts.</DialogDescription></DialogHeader>{!preview ? <div className="space-y-4"><a className="text-sm font-medium underline" href="/samples/group-roster-template.csv" download>Download CSV template</a><div className="space-y-2"><Label htmlFor="roster-csv">CSV file</Label><Input id="roster-csv" type="file" accept=".csv,text/csv" onChange={(event) => setFile(event.target.files?.[0] || null)} /><p className="text-xs text-muted-foreground">Required headers: display_name and mobile_number. consent_note is optional. Maximum 1,000 non-blank rows.</p></div><p role="alert" className="text-sm text-destructive">{message}</p><DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={createPreview} disabled={!file || previewMutation.isPending}>{previewMutation.isPending ? 'Validating…' : 'Preview rows'}</Button></DialogFooter></div> : <div className="min-w-0 space-y-4"><div role="status" aria-live="polite" className="rounded-lg border p-3 text-sm"><p className="font-medium">{preview.status === 'APPLIED' ? 'Bulk add complete' : `${preview.totalRows} rows reviewed; ${readyCount} ready.`}</p><p className="mt-1 break-words text-muted-foreground">{Object.entries(preview.counts).map(([key, count]) => `${key}: ${count}`).join(' · ')}</p></div><div className="grid gap-2">{preview.rows.map((row) => <div key={row.rowNumber} className="grid min-w-0 gap-1 rounded-lg border p-3 text-sm sm:grid-cols-[4rem_minmax(0,1fr)_minmax(0,1fr)]"><span>Row {row.rowNumber}</span><span className="break-words">{row.displayName || row.redactedNumber || 'Invalid row'}</span><span className="break-words"><strong>{row.outcome || row.classification}</strong><br />{row.displayNumber || row.redactedNumber} {row.reason}</span></div>)}</div>{preview.status === 'PREVIEW' && <div className="flex items-start gap-3"><Checkbox id="bulk-consent" checked={affirmed} onCheckedChange={(checked) => setAffirmed(checked === true)} /><Label htmlFor="bulk-consent" className="font-normal leading-5">Every person being added asked to receive messages or provided their number for church communications.</Label></div>}<p role="alert" aria-live="assertive" className="text-sm text-destructive">{message}</p><DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Close</Button>{preview.status === 'PREVIEW' && <Button disabled={!affirmed || readyCount === 0 || applyMutation.isPending} onClick={() => applyMutation.mutate(preview.id, { onSuccess: setPreview, onError: (error) => setMessage(apiErrorMessage(error) || 'Ready rows could not be applied.') })}>{applyMutation.isPending ? 'Applying…' : `Apply ${readyCount} ready rows`}</Button>}</DialogFooter></div>}</DialogContent></Dialog>
}

function AddPersonDialog({ organizationId, groupId }: { organizationId: string; groupId: string }) {
  const mutation = useAddRosterMember(organizationId, groupId)
  const [open, setOpen] = useState(false)
  const [displayName, setDisplayName] = useState('')
  const [mobileNumber, setMobileNumber] = useState('')
  const [consentAffirmed, setConsentAffirmed] = useState(false)
  const [consentMethodNote, setConsentMethodNote] = useState('')
  const [message, setMessage] = useState('')
  const submit = (event: React.FormEvent) => {
    event.preventDefault(); setMessage('')
    mutation.mutate({ displayName, mobileNumber, consentAffirmed, consentMethodNote: consentMethodNote || undefined }, { onSuccess: (member) => { setOpen(false); setDisplayName(''); setMobileNumber(''); setConsentAffirmed(false); setConsentMethodNote(''); setMessage(member.reusedContact ? 'Existing organization contact added.' : '') }, onError: (error) => setMessage(apiErrorMessage(error) || 'Person could not be added.') })
  }
  return <Dialog open={open} onOpenChange={setOpen}><DialogTrigger asChild><Button><UserPlus />Add person</Button></DialogTrigger><DialogContent><DialogHeader><DialogTitle>Add person</DialogTitle><DialogDescription>Add a phone-only contact to this group. This does not create a login, invitation, or email workflow.</DialogDescription></DialogHeader><form className="space-y-4" onSubmit={submit}><div className="space-y-2"><Label htmlFor="contact-name">Display name</Label><Input id="contact-name" value={displayName} maxLength={100} required onChange={(event) => setDisplayName(event.target.value)} /></div><div className="space-y-2"><Label htmlFor="contact-mobile">US mobile number</Label><Input id="contact-mobile" type="tel" value={mobileNumber} required placeholder="(208) 555-0123" onChange={(event) => setMobileNumber(event.target.value)} /><p className="text-xs text-muted-foreground">Syntax validation does not prove carrier assignment or SMS capability.</p></div><div className="flex items-start gap-3"><Checkbox id="contact-consent" checked={consentAffirmed} onCheckedChange={(checked) => { const affirmed = checked === true; setConsentAffirmed(affirmed); if (!affirmed) setConsentMethodNote('') }} /><Label htmlFor="contact-consent" className="font-normal leading-5">This person asked to receive messages or provided this number for church communications.</Label></div><p className="text-sm text-muted-foreground">Without this affirmation, the person is added to the roster but cannot receive messages until consent is recorded.</p><div className="space-y-2"><Label htmlFor="contact-consent-note">Consent method note (optional; requires affirmation)</Label><Textarea id="contact-consent-note" value={consentMethodNote} maxLength={200} disabled={!consentAffirmed} onChange={(event) => setConsentMethodNote(event.target.value)} /><p className="text-xs text-muted-foreground">Describe the request source without including documents, credentials, or unnecessary sensitive information.</p></div><p role="alert" aria-live="assertive" className="text-sm text-destructive">{message}</p><DialogFooter><Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" disabled={!displayName.trim() || !mobileNumber.trim() || mutation.isPending}>{mutation.isPending ? 'Adding…' : 'Add person'}</Button></DialogFooter></form></DialogContent></Dialog>
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

function SenderEditor({ organizationId, groupId, currentSenderIds }: { organizationId: string; groupId: string; currentSenderIds: string[] }) {
  const operators = useOrganizationOperators(organizationId)
  const assign = useAssignGroupSender(organizationId, groupId)
  const revoke = useRevokeGroupSender(organizationId, groupId)
  const [reason, setReason] = useState('Group sender assignment changed by administrator')
  return <div className="space-y-3 border-t pt-3"><p className="text-sm font-medium">Manage senders</p><p className="text-xs text-muted-foreground">Senders may preview counts and send to this group, but cannot view or change the roster.</p>{operators.data?.filter((operator) => operator.status === 'ACTIVE').map((operator) => { const assigned = currentSenderIds.includes(operator.membershipId); return <div key={operator.membershipId} className="flex flex-wrap items-center justify-between gap-2 text-sm"><span className="break-words">{operator.displayName}</span><Button size="sm" variant="outline" onClick={() => assigned ? revoke.mutate({ membershipId: operator.membershipId, reason }) : assign.mutate(operator.membershipId)}>{assigned ? 'Revoke' : 'Assign'}</Button></div> })}<Label htmlFor="sender-change-reason" className="text-xs">Revocation reason</Label><Input id="sender-change-reason" value={reason} maxLength={200} onChange={(event) => setReason(event.target.value)} /></div>
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
