'use client'

import { Send } from 'lucide-react'
import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useConfirmGroupMessage, usePreviewGroupMessage, type GroupMessagePreview, type GroupMessageSend } from '@/lib/api'
import { apiErrorMessage } from '@/lib/utils/errorHandler'

export function GroupMessageDialog({ organizationId, groupId, groupName, joinCode, triggerLabel = 'Send message' }: { organizationId: string; groupId: string; groupName: string; joinCode: string; triggerLabel?: string }) {
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
    <DialogTrigger asChild><Button><Send />{triggerLabel}</Button></DialogTrigger>
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
