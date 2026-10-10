export const DISPATCH_TICK_MS = 1000
export const slotSpacing = (cost: number, limit: number) => Math.max(DISPATCH_TICK_MS, limit === -1 ? 0 : Math.ceil(cost * 60_000 / limit))
/** Pure scheduler, shared by ETA simulation and dispatch. All times are epoch ms. */
export type SegmentEvent = { at: number; segments: number }
export type ScheduledItem = { id: string; segments: number; notBefore: number }
export function nextSlot(
  now: number,
  nextAt: number,
  cost: number,
  limit: number,
  history: SegmentEvent[],
) {
  if (cost < 1 || !Number.isInteger(cost))
    throw new Error('Invalid segment cost')
  if (limit !== -1 && (!Number.isInteger(limit) || limit < 1 || cost > limit))
    return null
  let at = Math.max(now, nextAt)
  if (limit === -1) return at
  for (;;) {
    const active = history.filter((e) => e.at > at - 60_000 && e.at <= at)
    if (active.reduce((n, e) => n + e.segments, 0) + cost <= limit) return at
    at = Math.min(...active.map((e) => e.at + 60_000))
  }
}
export function schedule(
  now: number,
  nextAt: number,
  limit: number,
  history: SegmentEvent[],
  items: ScheduledItem[],
) {
  const pending = [...items]
  const events = [...history]
  const result: Array<{ id: string; at: number }> = []
  let clock = now
  while (pending.length) {
    if (!pending.some((i) => i.notBefore <= clock))
      clock = Math.max(clock, Math.min(...pending.map((i) => i.notBefore)))
    const index = pending.findIndex((i) => i.notBefore <= clock)
    const item = pending.splice(index, 1)[0]
    const at = nextSlot(clock, nextAt, item.segments, limit, events)
    if (at === null) return null
    result.push({ id: item.id, at })
    events.push({ at, segments: item.segments })
    nextAt =
      at + slotSpacing(item.segments, limit)
    clock = at
  }
  return result
}
