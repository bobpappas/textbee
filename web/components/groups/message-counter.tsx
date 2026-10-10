import { normalizeSms, smsUnits } from '@/lib/sms-text'

export function MessageCounter({ body, joinCode, recipients }: { body: string; joinCode: string; recipients?: number }) {
  const trimmed = body.trim()
  const normalized = normalizeSms(trimmed)
  const info = smsUnits(`${joinCode}: ${normalized}`)
  const unicode = info.encoding === 'Unicode'
  const capacity = info.segments === 1 ? (unicode ? 70 : 160) : info.segments * (unicode ? 67 : 153)
  return <div id="group-message-counter" role="status" aria-live="polite" aria-atomic="true" className="space-y-1 text-xs text-muted-foreground [overflow-wrap:anywhere]">
    <p className="font-medium text-foreground">{info.units} / {capacity} SMS character units · {info.segments} {info.segments === 1 ? 'segment' : 'segments'} per person · {unicode ? 'Unicode' : 'Standard text'}</p>
    <p>Includes the required prefix. {normalized !== trimmed && 'Common punctuation is automatically simplified; URLs stay unchanged.'}</p>
    {unicode && <p>Emoji or other Unicode characters reduce capacity to 70 units for one segment, or 67 per segment for longer messages. Characters using Unicode: {info.unsupported.map(c => /\s/u.test(c) ? `U+${c.codePointAt(0)!.toString(16).toUpperCase()}` : c).join(' ')}</p>}
    {recipients !== undefined && <p>{recipients} recipients × {info.segments} segments = {recipients * info.segments} total. Preview confirms the eligible audience.</p>}
    <details><summary className="cursor-pointer">How characters are counted</summary><p>Most characters use one unit. Some symbols, such as ^ and €, use two in standard SMS; many emoji use two or more Unicode units. Longer messages reserve space for joining the pieces: 153 standard or 67 Unicode units per segment.</p></details>
  </div>
}
