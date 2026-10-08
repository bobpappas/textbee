'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { ArrowLeft, Inbox, MessageSquareText, Search, Send } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { freshOrganizationContext, useOrganizationContext } from '@/components/organizations/organization-context-provider'
import ErrorState from '@/components/shared/error-state'
import PageHeader from '@/components/shared/page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import {
  useAssignAttribution,
  useCommunications,
  useConfirmReply,
  useConversation,
  useConversationReadState,
  useConversationWorkState,
  useGroups,
  usePreviewReply,
  type ActiveOrganizationContext,
  type CommunicationEntry,
  type ReplyPreview,
} from '@/lib/api'
import { apiErrorMessage } from '@/lib/utils/errorHandler'
import { hasCapability } from '@/lib/dashboard-access'
import { ORGANIZATION_PROFILE_MANAGE } from '@/lib/api/types'
import { GroupMessageDialog } from '@/components/groups/group-message-dialog'

type View = 'unread' | 'recent' | 'all' | 'groups'
type WorkspaceNavigation = { updates: Record<string, string | undefined>; destination?: string }

export default function CommunicationsWorkspace({
  groupId: fixedGroupId,
  embedded = false,
}: {
  groupId?: string
  embedded?: boolean
}) {
  const context = useOrganizationContext()
  const fresh = freshOrganizationContext(context)
  const active = fresh?.state === 'ACTIVE' ? (fresh as ActiveOrganizationContext) : null
  const organizationId = active?.organization.id ?? ''
  const administrator = hasCapability(active ?? undefined, ORGANIZATION_PROFILE_MANAGE)
  const params = useSearchParams()
  const router = useRouter()
  const groups = useGroups(organizationId, false, { enabled: Boolean(active && !fixedGroupId), retry: false })
  const composingGroup = params?.get('compose') === 'group'
  const selectedGroupId = fixedGroupId || params?.get('group') || ''
  const view = (['unread', 'recent', 'all', 'groups'].includes(params?.get('view') || '') ? params?.get('view') : 'unread') as View
  const selectedConversationId = params?.get('conversation') || ''
  const [search, setSearch] = useState(params?.get('search') || '')
  const [resolution, setResolution] = useState<'open' | 'resolved' | ''>((params?.get('resolution') as 'open' | 'resolved') || '')
  const [groupDraftDirty, setGroupDraftDirty] = useState(false)
  const [replyDraftDirty, setReplyDraftDirty] = useState(false)
  const [draftRevision, setDraftRevision] = useState(0)
  const [pendingNavigation, setPendingNavigation] = useState<WorkspaceNavigation | null>(null)
  const communications = useCommunications(
    organizationId,
    { view, groupId: selectedGroupId || undefined, search: search || undefined, resolution },
    { enabled: Boolean(active && (administrator || selectedGroupId)), retry: false },
  )
  const thread = useConversation(
    organizationId,
    selectedConversationId,
    selectedGroupId || undefined,
    { enabled: Boolean(active && selectedConversationId && (administrator || selectedGroupId)), retry: false, retryOnMount: false },
  )

  useEffect(() => {
    if (!selectedConversationId || !thread.isError) return
    const status = (thread.error as any)?.response?.status
    if ((status === 403 || status === 404) && thread.errorUpdatedAt > context.dataUpdatedAt) {
      void context.refetch()
    }
  }, [context, selectedConversationId, thread.error, thread.errorUpdatedAt, thread.isError])

  const performNavigation = ({ updates, destination }: WorkspaceNavigation) => {
    const next = new URLSearchParams(params?.toString() || '')
    Object.entries(updates).forEach(([key, value]) => value ? next.set(key, value) : next.delete(key))
    const path = fixedGroupId ? `/dashboard/groups/${fixedGroupId}` : '/dashboard/communications'
    setDraftRevision((value) => value + 1)
    setGroupDraftDirty(false)
    setReplyDraftDirty(false)
    router.push(destination || `${path}?${next.toString()}`)
  }

  const navigate = (updates: Record<string, string | undefined>, destination?: string) => {
    if (groupDraftDirty || replyDraftDirty) {
      setPendingNavigation({ updates, destination })
      return
    }
    performNavigation({ updates, destination })
  }

  if (!active) return <ErrorState title="Communications unavailable" error={new Error('Select an active organization.')} />

  const selectedGroup = groups.data?.find((group) => group.id === selectedGroupId)
  const content = (
    <div className="min-w-0 space-y-4">
      {!fixedGroupId && (
        <div className="space-y-3 rounded-lg border p-4">
          <h2 id="group-selection-label" className="font-medium">Select Group:</h2>
          {groups.isPending ? <p role="status">Loading groups…</p> : groups.isError ? (
            <ErrorState title="Groups could not be loaded" error={groups.error} onRetry={() => groups.refetch()} />
          ) : <div role="group" aria-labelledby="group-selection-label" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {groups.data?.map((group) => (
              <button key={group.id} type="button" aria-pressed={selectedGroupId === group.id}
                onClick={() => { if (selectedGroupId !== group.id) navigate({ group: group.id, conversation: undefined }) }}
                className={`min-w-0 rounded-lg border p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${selectedGroupId === group.id ? 'border-primary bg-primary/10 ring-1 ring-primary' : 'hover:bg-muted/50'}`}>
                <span className="block break-words font-medium">{group.displayName}</span>
                <span className="text-sm text-muted-foreground">{group.rosterCount} active member{group.rosterCount === 1 ? '' : 's'}</span>
                {selectedGroupId === group.id && <span className="ml-2 text-xs font-medium text-primary">Selected</span>}
              </button>
            ))}
          </div>}
          {groups.isSuccess && !groups.data?.length && <p role="status" className="text-sm text-muted-foreground">No groups are available to message. Ask your organization administrator for group access.</p>}
          <div className="flex flex-wrap gap-2">
            {selectedGroup ? <GroupMessageDialog key={`${selectedGroup.id}:${draftRevision}`} organizationId={organizationId} groupId={selectedGroup.id} groupName={selectedGroup.displayName} joinCode={selectedGroup.joinCode} triggerLabel="Send group message" onDraftChange={setGroupDraftDirty} /> : <Button disabled><Send />Send group message</Button>}
            {administrator && !composingGroup && <Button variant="outline" onClick={() => navigate({ group: undefined, conversation: undefined })}>Organization inbox</Button>}
          </div>
          {!selectedGroup && groups.isSuccess && Boolean(groups.data?.length) && <p role="status" className="text-sm text-muted-foreground">Choose a group above, then select Send group message. Preview recipients and SMS segments before confirming.</p>}
        </div>
      )}
      <AlertDialog open={pendingNavigation !== null} onOpenChange={(open) => { if (!open) setPendingNavigation(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Discard unsent draft?</AlertDialogTitle><AlertDialogDescription>Your draft belongs to the current group and conversation. Discard it before leaving; it will not be copied to another group.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Keep editing</AlertDialogCancel><AlertDialogAction onClick={() => { if (pendingNavigation) performNavigation(pendingNavigation); setPendingNavigation(null) }}>Discard and continue</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <nav aria-label="Communications views" className="flex max-w-full gap-2 overflow-x-auto pb-1">
        {(['unread', 'recent', 'all', 'groups'] as View[]).map((item) => (
          <Button key={item} size="sm" variant={view === item ? 'default' : 'outline'} onClick={() => navigate({ view: item, conversation: undefined })}>
            {item[0].toUpperCase() + item.slice(1)}
          </Button>
        ))}
      </nav>

      {view === 'groups' && !fixedGroupId ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {groups.data?.map((group) => (
            <Card key={group.id}><CardHeader><CardTitle>{group.displayName}</CardTitle></CardHeader><CardContent><Button asChild variant="outline"><Link href={`/dashboard/groups/${group.id}?section=messages`} onClick={(event) => { event.preventDefault(); navigate({}, `/dashboard/groups/${group.id}?section=messages`) }}>Open group</Link></Button></CardContent></Card>
          ))}
        </div>
      ) : (
        <>
          <div className="grid min-w-0 gap-3 sm:grid-cols-[minmax(0,1fr)_10rem]">
            <Label className="relative block"><span className="sr-only">Search conversations</span><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><Input className="pl-9" value={search} placeholder="Search contacts" onChange={(event) => setSearch(event.target.value)} /></Label>
            <NativeSelect aria-label="Resolution filter"  value={resolution} onChange={(event) => setResolution(event.target.value as typeof resolution)}><option value="">Any status</option><option value="open">Open</option><option value="resolved">Resolved</option></NativeSelect>
          </div>
          <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(16rem,22rem)_minmax(0,1fr)]">
            <section aria-label="Conversation list" className={selectedConversationId ? 'hidden min-w-0 lg:block' : 'min-w-0'}>
              {!selectedGroupId && (!administrator || composingGroup) ? <p className="py-6 text-sm text-muted-foreground">Select a group to view its conversations.</p> : communications.isPending ? <Skeleton className="h-64 w-full" /> : communications.isError ? <ErrorState title="Conversations could not be loaded" error={communications.error} onRetry={() => communications.refetch()} /> : communications.data.items.length === 0 ? (
                <Card><CardContent className="py-10 text-center"><Inbox className="mx-auto mb-3 h-8 w-8" /><p className="font-medium">{view === 'unread' ? 'All caught up' : 'No conversations found'}</p>{view === 'unread' && <Button className="mt-3" variant="outline" onClick={() => navigate({ view: 'recent' })}>Open Recent</Button>}</CardContent></Card>
              ) : communications.data.items.map((item) => (
                <button key={item.id} type="button" onClick={() => navigate({ conversation: item.id })} className={`mb-2 w-full min-w-0 rounded-lg border p-3 text-left focus-visible:outline-none focus-visible:ring-2 ${selectedConversationId === item.id ? 'border-primary' : ''}`}>
                  <div className="flex min-w-0 items-start justify-between gap-2"><span className="truncate font-medium">{item.contact.displayName}</span>{item.unreadCount > 0 && <Badge>{item.unreadCount} unread</Badge>}</div>
                  <p className="truncate text-sm text-muted-foreground">{item.lastEntry.message}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{new Date(item.lastActivityAt).toLocaleString()}</p>
                </button>
              ))}
            </section>
            <section aria-label="Conversation thread" className={!selectedConversationId ? 'hidden min-w-0 lg:block' : 'min-w-0'}>
              {!selectedConversationId ? <Card><CardContent className="py-16 text-center text-muted-foreground">Select a conversation to read and reply.</CardContent></Card> : thread.isPending ? <Skeleton className="h-80 w-full" /> : thread.isError ? <ErrorState title="Conversation not found or access denied" error={thread.error} onRetry={() => thread.refetch()} /> : (
                <ConversationThreadView key={`${selectedGroupId}:${selectedConversationId}:${draftRevision}`} onDraftChange={setReplyDraftDirty} organizationId={organizationId} groupId={selectedGroupId} thread={thread.data} onBack={() => navigate({ conversation: undefined })} />
              )}
            </section>
          </div>
        </>
      )}
    </div>
  )

  return embedded ? content : (
    <section className="container mx-auto min-w-0 px-4 py-6 sm:px-6">
      <PageHeader icon={MessageSquareText} title="Group Messages" description="Send concise group updates, read conversations, and reply within your authorized groups." />
      {content}
    </section>
  )
}

function ConversationThreadView({ organizationId, groupId, thread, onBack, onDraftChange }: { onDraftChange: (dirty: boolean) => void; organizationId: string; groupId: string; thread: any; onBack: () => void }) {
  const readState = useConversationReadState(organizationId)
  const workState = useConversationWorkState(organizationId)
  const attribution = useAssignAttribution(organizationId)
  const previewReply = usePreviewReply(organizationId, thread.id)
  const confirmReply = useConfirmReply(organizationId, thread.id)
  const [body, setBody] = useState('')
  const [preview, setPreview] = useState<ReplyPreview | null>(null)
  const [requestId, setRequestId] = useState('')
  const [message, setMessage] = useState('')
  useEffect(() => {
    onDraftChange(Boolean(body.trim()))
    return () => onDraftChange(false)
  }, [body, onDraftChange])
  const latestInbound = useMemo(() => [...thread.entries].reverse().find((entry: CommunicationEntry) => entry.direction === 'INBOUND'), [thread.entries])
  const replyGroupId = groupId || latestInbound?.group?.id || ''
  const ambiguous = latestInbound?.attribution.state === 'AMBIGUOUS'
  const canReply = Boolean(
    latestInbound &&
    replyGroupId &&
    latestInbound.group?.id === replyGroupId &&
    !['AMBIGUOUS', 'UNASSIGNED'].includes(latestInbound.attribution.state),
  )
  const createPreview = () => {
    if (!latestInbound || !replyGroupId) return
    setMessage('')
    previewReply.mutate({ parentEntryId: latestInbound.id, groupId: replyGroupId, body }, {
      onSuccess: (value) => { setPreview(value); setRequestId(crypto.randomUUID()) },
      onError: (error) => setMessage(apiErrorMessage(error) || 'Reply preview could not be created.'),
    })
  }
  const confirm = () => {
    if (!preview || !requestId) return
    confirmReply.mutate({ previewId: preview.id, requestId }, {
      onSuccess: () => { setBody(''); setPreview(null); setRequestId(''); setMessage('Reply accepted for delivery.') },
      onError: (error) => setMessage(apiErrorMessage(error) || 'Reply could not be confirmed. Your draft is preserved.'),
    })
  }
  return <Card className="min-w-0 overflow-hidden">
    <CardHeader className="border-b"><div className="flex min-w-0 items-center gap-2"><Button className="lg:hidden" size="icon" variant="ghost" aria-label="Back to conversations" onClick={onBack}><ArrowLeft /></Button><div className="min-w-0"><CardTitle className="truncate">{thread.contact.displayName}</CardTitle><p className="text-sm text-muted-foreground">{thread.contact.number}</p></div></div></CardHeader>
    <CardContent className="min-w-0 space-y-4 pt-4">
      <div className="max-h-[28rem] space-y-3 overflow-y-auto" aria-live="polite">
        {thread.entries.map((entry: CommunicationEntry) => <div key={entry.id} className={`max-w-[92%] rounded-lg border p-3 text-sm ${entry.direction === 'OUTBOUND' ? 'ml-auto bg-primary/5' : ''}`}><div className="flex flex-wrap items-center gap-2"><strong>{entry.author}</strong>{entry.group && <Badge variant="outline">{entry.group.displayName}</Badge>}<Badge variant={entry.attribution.state === 'CONFIRMED' ? 'default' : 'secondary'}>{entry.attribution.state}{entry.attribution.manuallyAssigned ? ' — manually assigned' : ''}</Badge></div><p className="mt-2 whitespace-pre-wrap break-words">{entry.message}</p><p className="mt-2 text-xs text-muted-foreground">{entry.attribution.reason} · {new Date(entry.eventAt).toLocaleString()}</p></div>)}
      </div>
      {thread.workState && groupId && <div className="flex flex-wrap gap-2 border-t pt-3"><Button size="sm" variant="outline" onClick={() => readState.mutate({ conversationId: thread.id, groupId, read: false })}>Mark unread</Button><Button size="sm" variant="outline" onClick={() => workState.mutate({ conversationId: thread.id, groupId, action: 'assign-self', version: thread.workState.version }, { onError: (error) => setMessage(apiErrorMessage(error) || 'Assignment changed elsewhere. Current work state was refreshed.') })}>Assign to me</Button><Button size="sm" variant="outline" onClick={() => workState.mutate({ conversationId: thread.id, groupId, action: thread.workState.resolved ? 'reopen' : 'resolve', version: thread.workState.version }, { onError: (error) => setMessage(apiErrorMessage(error) || 'Resolution changed elsewhere. Current work state was refreshed.') })}>{thread.workState.resolved ? 'Reopen' : 'Resolve'}</Button></div>}
      {ambiguous && replyGroupId && latestInbound ? <div className="rounded-lg border p-3"><p className="text-sm">Resolve the group attribution before replying.</p><Button className="mt-2" size="sm" onClick={() => attribution.mutate({ entryId: latestInbound.id, groupId: replyGroupId, reason: 'Operator reviewed the stored candidate evidence' })}>Assign to this group</Button></div> : canReply && latestInbound ? <div className="space-y-3 border-t pt-4"><Label htmlFor="conversation-reply">Reply to {thread.contact.displayName} directly</Label><Textarea id="conversation-reply" value={body} rows={4} maxLength={1000} onChange={(event) => { setBody(event.target.value); setPreview(null); setRequestId('') }} />{preview && <div role="status" className="rounded-lg border p-3 text-sm"><p className="break-words font-medium">{preview.message}</p><p className="text-muted-foreground">{preview.encoding} · {preview.segments} segment{preview.segments === 1 ? '' : 's'} · {preview.recipient.displayName} {preview.recipient.number}</p></div>}<p role="alert" aria-live="assertive" className="text-sm text-destructive">{message}</p><div className="flex gap-2">{!preview ? <Button disabled={!body.trim() || previewReply.isPending} onClick={createPreview}>{previewReply.isPending ? 'Checking…' : 'Preview reply'}</Button> : <Button disabled={confirmReply.isPending} onClick={confirm}>{confirmReply.isPending ? 'Confirming…' : 'Confirm reply'}</Button>}</div></div> : null}
    </CardContent>
  </Card>
}
