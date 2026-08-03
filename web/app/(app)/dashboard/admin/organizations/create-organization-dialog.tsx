'use client'

import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useCreateOrganization } from '@/lib/api'
import { apiErrorMessage } from '@/lib/utils/errorHandler'
import { useToast } from '@/hooks/use-toast'

export default function CreateOrganizationDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [displayName, setDisplayName] = useState('')
  const [fieldError, setFieldError] = useState('')
  const [summary, setSummary] = useState('')
  const idempotencyKey = useRef<string | null>(null)
  const createOrganization = useCreateOrganization()
  const { toast } = useToast()

  useEffect(() => {
    if (!open) {
      setDisplayName('')
      setFieldError('')
      setSummary('')
      idempotencyKey.current = null
      createOrganization.reset()
    }
  }, [open])

  const validate = () => {
    const normalized = displayName.trim()
    const length = Array.from(normalized).length
    if (length < 2 || length > 100) {
      setFieldError('Organization name must contain 2 to 100 characters.')
      return null
    }
    setFieldError('')
    return normalized
  }

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    const normalized = validate()
    if (!normalized) return
    idempotencyKey.current ??= crypto.randomUUID()
    setSummary('')
    createOrganization.mutate(
      { displayName: normalized, idempotencyKey: idempotencyKey.current },
      {
        onSuccess: () => {
          toast({
            title: 'Organization created',
            description: `${normalized} is ready to manage.`,
          })
          onOpenChange(false)
        },
        onError: (error: any) => {
          const message =
            apiErrorMessage(error) || 'Organization creation did not complete.'
          if (error?.response?.data?.field === 'displayName') {
            setFieldError(message)
          } else {
            setSummary(`${message} You can retry this submission safely.`)
          }
        },
      },
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Create organization</DialogTitle>
          <DialogDescription>
            You will become its initial organization administrator.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="organization-name">Organization name</Label>
            <Input
              id="organization-name"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              aria-invalid={Boolean(fieldError)}
              aria-describedby={
                fieldError ? 'organization-name-error' : undefined
              }
              autoComplete="organization"
              autoFocus
            />
            {fieldError && (
              <p
                id="organization-name-error"
                role="alert"
                className="text-sm text-destructive"
              >
                {fieldError}
              </p>
            )}
          </div>
          <p aria-live="polite" className="text-sm text-muted-foreground">
            {summary}
          </p>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={createOrganization.isPending}
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={createOrganization.isPending}>
              {createOrganization.isPending ? 'Creating…' : 'Create'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
