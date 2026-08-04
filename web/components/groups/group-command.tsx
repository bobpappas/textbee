'use client'

import { Badge } from '@/components/ui/badge'
import { CopyButton } from '@/components/shared/copy-button'
import type { OrganizationGroup } from '@/lib/api'

export function GroupCommand({ group }: { group: OrganizationGroup }) {
  const archived = group.status === 'ARCHIVED'
  return (
    <div className="min-w-0 rounded-lg border bg-muted/30 p-3">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <span className="break-words font-mono text-lg font-semibold">
          {group.joinCommand}
        </span>
        {archived ? (
          <Badge variant="secondary">Inactive</Badge>
        ) : (
          <CopyButton value={group.joinCommand} label={`${group.displayName} join command`} />
        )}
      </div>
      <p className="break-words text-sm text-muted-foreground">
        Text to {group.displayNumber}
      </p>
    </div>
  )
}
