'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Download, Send } from 'lucide-react'
import { Routes } from '@/config/routes'
import GenerateApiKey from '../api-keys/generate-api-key'
import InlineRegisterPanel from './inline-register-panel'

type StepActionsProps = {
  stepId: string
  // A completed step can still be reopened. Its actions stay available (you
  // may want a second device or a replacement key), but anything that only
  // makes sense for an unfinished step, like Skip, is dropped.
  isDone?: boolean
  isSaving: boolean
  subLoading: boolean
  onSkipStep: (stepId: string) => void
}

// Call-to-action block for the currently selected onboarding step.
export default function StepActions({
  stepId,
  isDone = false,
  isSaving,
  onSkipStep,
}: StepActionsProps) {
  switch (stepId) {
    case 'download_app':
      return (
        <>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              window.open(
                Routes.downloadAndroidApp,
                '_blank',
                'noopener,noreferrer',
              )
            }
          >
            <Download className="h-4 w-4" />
            Get APK instructions
          </Button>
          {!isDone && (
            <Button
              variant="link"
              size="sm"
              className="h-auto px-2 text-muted-foreground"
              disabled={isSaving}
              onClick={() => onSkipStep('download_app')}
            >
              Skip →
            </Button>
          )}
        </>
      )
    case 'api_key':
      return (
        <GenerateApiKey
          triggerLabel={
            isDone ? 'Generate another API key' : 'Generate API Key'
          }
          triggerVariant={isDone ? 'outline' : 'default'}
        />
      )
    case 'register_device':
      return <InlineRegisterPanel />
    case 'first_message':
      return (
        <Button size="sm" asChild>
          <Link href="/dashboard/messaging">
            <Send className="h-4 w-4" />
            Go to messaging
          </Link>
        </Button>
      )
    default:
      return null
  }
}
