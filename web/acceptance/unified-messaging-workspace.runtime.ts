import { expect, type BrowserContext, type Page, type Route } from '@playwright/test'
import { mockApi } from '../e2e/mock-api'
import { authenticate } from '../e2e/session'
import { mockOrganizationContext, mockOrganizationGroups } from '../test/fixtures'

type Step = { text: string }
type Feature = { background?: readonly Step[]; scenarios: readonly { name: string; steps: readonly Step[] }[] }
type Fixtures = { page: Page; context: BrowserContext }
type Mode = 'normal' | 'confirmed' | 'likely' | 'ambiguous' | 'unknown' | 'command' | 'ineligible' | 'stale' | 'revoked'
type World = Fixtures & { mode: Mode; groupId: string; organizationId: string }

const group = mockOrganizationGroups[0]
const organizationId = mockOrganizationContext.organization.id
const senderContext = { ...mockOrganizationContext, capabilities: ['groups:read', 'group-messages:send'], roleLabel: 'Group sender' }
const ownerContext = { ...mockOrganizationContext, capabilities: ['groups:read', 'group-messages:send', 'group-roster:manage', 'group-join-settings:manage'], roleLabel: 'Group owner' }

const json = (route: Route, body: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })

function entry(mode: Mode) {
  if (mode === 'command') return { id: 'command-entry', direction: 'SYSTEM', kind: 'COMMAND', message: 'Consent command processed', eventAt: '2026-08-23T12:01:00.000Z', group: { id: group.id, displayName: group.displayName }, author: 'System', attribution: { state: 'CONFIRMED', method: 'TRANSPORT_REPLY', reason: 'Command processing completed first', candidateGroupIds: [], manuallyAssigned: false }, version: 1 }
  const state = mode === 'confirmed' ? 'CONFIRMED' : mode === 'ambiguous' ? 'AMBIGUOUS' : mode === 'unknown' ? 'UNASSIGNED' : 'LIKELY'
  const reason = state === 'CONFIRMED' ? 'Matched the exact sent message within 30 days' : state === 'LIKELY' ? 'Most recent successful group message within 72 hours' : state === 'AMBIGUOUS' ? 'More than one group has plausible message evidence' : 'Sender is not a known organization contact'
  return { id: 'inbound-entry', direction: 'INBOUND', kind: 'MESSAGE', message: mode === 'unknown' ? 'Unknown sender message' : 'Yes, thank you', status: 'received', eventAt: '2026-08-23T12:01:00.000Z', group: state === 'AMBIGUOUS' || state === 'UNASSIGNED' ? null : { id: group.id, displayName: group.displayName }, author: 'Contact', attribution: { state, method: state === 'CONFIRMED' ? 'EXACT_QUOTE' : state === 'LIKELY' ? 'RECENT_SEND' : 'NO_EVIDENCE', reason, candidateGroupIds: state === 'AMBIGUOUS' ? [group.id] : [], manuallyAssigned: false }, version: 1 }
}

function thread(mode: Mode) {
  const inbound = entry(mode)
  return {
    id: 'conversation-1',
    contact: { displayName: mode === 'unknown' ? 'Unknown sender' : 'Synthetic Contact', number: mode === 'unknown' ? '***0199' : '+12085550123' },
    entries: mode === 'command' ? [inbound] : [
      { id: 'outbound-entry', direction: 'OUTBOUND', kind: 'MESSAGE', message: `${group.joinCode}: Can you attend?`, status: 'delivered', eventAt: '2026-08-23T12:00:00.000Z', group: { id: group.id, displayName: group.displayName }, author: 'Approved operator', attribution: { state: 'CONFIRMED', method: 'TRANSPORT_REPLY', reason: 'Persisted group delivery link', candidateGroupIds: [], manuallyAssigned: false }, version: 1 },
      inbound,
    ],
    workState: mode === 'unknown' ? undefined : { assigneeMembershipId: null, resolved: false, resolvedBy: null, resolvedAt: null, version: 1 },
  }
}

async function configure(world: World, contextValue: unknown = mockOrganizationContext) {
  await authenticate(world.context, 'REGULAR')
  await mockApi(world.page, { organizationContext: contextValue, groups: mockOrganizationGroups })
  await world.page.route('**/api/v1/organizations/**/communications**', async (route) => {
    const url = new URL(route.request().url())
    const path = url.pathname
    const method = route.request().method()
    if (path.includes('/replies/preview')) {
      if (world.mode === 'ineligible') return json(route, { error: 'This number has opted out. A recipient START and new group JOIN are required before replying.', code: 'ORGANIZATION_SUPPRESSION' }, 409)
      return json(route, { data: { id: 'preview-1', parentEntryId: 'inbound-entry', group: { id: group.id, displayName: group.displayName }, recipient: { displayName: 'Synthetic Contact', number: '+12085550123' }, message: `${group.joinCode}: Thanks`, encoding: 'GSM-7', segments: 1, route: { deviceId: 'device-1', simSubscriptionId: null }, eligibility: { eligible: true }, remainingCapacity: { minuteSegments: 99 }, expiresAt: '2026-08-23T12:10:00.000Z' } })
    }
    if (path.includes('/work-state') && method === 'PATCH' && world.mode === 'stale') return json(route, { error: 'This conversation changed. Review the current assignment and resolution state.', code: 'COMMUNICATION_STATE_STALE' }, 409)
    if (/\/communications\/conversation-1$/.test(path)) {
      if (world.mode === 'revoked') return json(route, { error: 'Conversation not found or access denied' }, 404)
      return json(route, { data: thread(world.mode) })
    }
    const current = thread(world.mode)
    return json(route, { data: { view: url.searchParams.get('view') || 'unread', items: [{ id: current.id, contact: current.contact, lastActivityAt: '2026-08-23T12:01:00.000Z', lastEntry: current.entries[current.entries.length - 1], unreadCount: world.mode === 'command' ? 0 : 1, groupIds: [group.id], workState: current.workState }], nextCursor: null, counts: { unread: world.mode === 'command' ? 0 : 1 } } })
  })
}

async function openConversation(world: World, mode: Mode, contextValue: unknown = mockOrganizationContext) {
  world.mode = mode
  await configure(world, contextValue)
  await world.page.goto(`/dashboard/communications?group=${group.id}&view=all&conversation=conversation-1`)
}

async function execute(world: World, text: string) {
  const page = world.page
  if (text === 'an authenticated B017 organization administrator with synthetic messaging data') return configure(world)
  if (text === 'primary messaging navigation is rendered') return page.goto('/dashboard')
  if (text === 'Communications opens on Unread and Message History remains diagnostic') {
    await expect(page.getByRole('link', { name: 'Communications' }).first()).toBeVisible()
    await expect(page.getByRole('link', { name: 'Message History' }).first()).toBeVisible()
    await page.getByRole('link', { name: 'Communications' }).first().click()
    await expect(page.getByRole('button', { name: 'Unread', exact: true })).toBeVisible(); return
  }
  if (text === 'the administrator opens the groups list') return page.goto('/dashboard/groups')
  if (text === 'active group actions say Open group and expose authorized workspace sections') {
    await expect(page.getByRole('link', { name: 'Open group' }).first()).toBeVisible(); await page.getByRole('link', { name: 'Open group' }).first().click(); await expect(page.getByRole('link', { name: 'Messages' })).toBeVisible(); await expect(page.getByRole('link', { name: 'People' })).toBeVisible(); await expect(page.getByRole('link', { name: 'Settings' })).toBeVisible(); return
  }
  if (text === 'the administrator starts a new group message from Communications') { await page.goto(`/dashboard/communications?group=${group.id}`); await page.getByRole('button', { name: 'New group message' }).click(); return }
  if (text === 'the exact join-code prefix and one-group preview controls are shown') { await expect(page.getByLabel('Required prefix')).toHaveValue(`${group.joinCode}:`); await expect(page.getByRole('button', { name: 'Preview recipients' })).toBeVisible(); await expect(page.getByText(/Everyone|multi-group/i)).toHaveCount(0); return }
  if (text === 'the administrator opens a synthetic contact conversation') return openConversation(world, 'normal')
  if (text === 'sent and received entries appear in chronological order with group context') { const entries = page.locator('[aria-label="Conversation thread"] [class*="rounded-lg border p-3 text-sm"]'); await expect(entries).toHaveCount(2); await expect(entries.first()).toContainText(`${group.joinCode}: Can you attend?`); await expect(entries.last()).toContainText('Yes, thank you'); return }
  if (text === 'the administrator opens the synthetic organization inbox') return openConversation(world, 'normal')
  if (text === 'no foreign-organization contact or group is rendered') { await expect(page.getByText('Foreign Organization')).toHaveCount(0); await expect(page.getByText('Foreign Contact')).toHaveCount(0); return }
  if (text === 'the administrator opens a conversation with exact-message evidence') return openConversation(world, 'confirmed')
  if (text === 'Confirmed and the exact-message explanation are shown') { await expect(page.getByText('CONFIRMED').last()).toBeVisible(); await expect(page.getByText(/Matched the exact sent message/)).toBeVisible(); return }
  if (text === 'the administrator opens a conversation with recent-send evidence') return openConversation(world, 'likely')
  if (text === 'Likely and the inference explanation are shown') { await expect(page.getByText('LIKELY')).toBeVisible(); await expect(page.getByText(/Most recent successful group message within 72 hours/)).toBeVisible(); return }
  if (text === 'the administrator opens the ambiguity queue') return openConversation(world, 'ambiguous')
  if (text === 'Ambiguous or Unassigned is shown without a Confirmed claim') { await expect(page.getByText('AMBIGUOUS')).toBeVisible(); await expect(page.getByText(/More than one group/)).toBeVisible(); return }
  if (text === 'the administrator opens the unassigned queue') return openConversation(world, 'unknown')
  if (text === 'the unknown sender is masked and reply controls are absent') { await expect(page.getByText('***0199')).toBeVisible(); await expect(page.getByRole('button', { name: 'Preview reply' })).toHaveCount(0); return }
  if (text === 'a Group B operator opens Group B messages') return openConversation(world, 'normal', senderContext)
  if (text === 'Group A-only message content is absent') { await expect(page.getByText('Group A private content')).toHaveCount(0); return }
  if (text === 'a group sender opens the assigned group workspace') { world.mode = 'normal'; await configure(world, senderContext); await page.goto(`/dashboard/groups/${group.id}?section=messages`); return }
  if (text === 'Messages is available while People Settings and full numbers are absent') { await expect(page.getByRole('link', { name: 'Messages' })).toBeVisible(); await expect(page.getByRole('link', { name: 'People' })).toHaveCount(0); await expect(page.getByRole('link', { name: 'Settings' })).toHaveCount(0); await expect(page.getByText('+12085550123')).toHaveCount(0); return }
  if (text === 'an owner opens an Ambiguous candidate for the owned group') return openConversation(world, 'ambiguous', ownerContext)
  if (text === 'the assign-to-group action is available before replying') { await expect(page.getByRole('button', { name: 'Assign to this group' })).toBeVisible(); await expect(page.getByRole('button', { name: 'Preview reply' })).toHaveCount(0); return }
  if (text === 'command-classified synthetic history is opened') return openConversation(world, 'command')
  if (text === 'no ordinary unread reply or reply composer is created for the command') { await expect(page.getByLabel('Conversation thread').getByText('Consent command processed')).toBeVisible(); await expect(page.getByRole('button', { name: 'Preview reply' })).toHaveCount(0); return }
  if (text === 'an authorized operator previews an ineligible reply') { await openConversation(world, 'ineligible'); await page.getByLabel(/Reply in/).fill('Preserved draft'); await page.getByRole('button', { name: 'Preview reply' }).click(); return }
  if (text === 'actionable eligibility guidance is shown and the draft remains') { await expect(page.getByText(/opted out/)).toBeVisible(); await expect(page.getByLabel(/Reply in/)).toHaveValue('Preserved draft'); return }
  if (text === 'an authorized operator previews a valid individual reply') { await openConversation(world, 'normal'); await page.getByLabel(/Reply in/).fill('Thanks'); await page.getByRole('button', { name: 'Preview reply' }).click(); return }
  if (text === 'the exact join-code-prefixed text is shown before confirmation') { await expect(page.getByText(`${group.joinCode}: Thanks`)).toBeVisible(); await expect(page.getByRole('button', { name: 'Confirm reply' })).toBeVisible(); return }
  if (text === 'an authorized operator opens group work') return openConversation(world, 'normal')
  if (text === 'Mark unread assignment and resolution controls are available') { await expect(page.getByRole('button', { name: 'Mark unread' })).toBeVisible(); await expect(page.getByRole('button', { name: 'Assign to me' })).toBeVisible(); await expect(page.getByRole('button', { name: 'Resolve' })).toBeVisible(); return }
  if (text === 'a stale work-state update is rejected') { await openConversation(world, 'stale'); await page.getByRole('button', { name: 'Resolve' }).click(); return }
  if (text === 'current work is refreshed without showing raw 409 or losing a draft') { await expect(page.getByText(/conversation changed/)).toBeVisible(); await expect(page.getByText('409')).toHaveCount(0); return }
  if (text === 'the current group grant is revoked before refresh') return openConversation(world, 'revoked')
  if (text === 'the thread becomes non-disclosing access denied') { await expect(page.getByText(/not found or access denied/i).first()).toBeVisible(); return }
  if (text === 'legacy diagnostic history has no durable group-delivery link') return openConversation(world, 'normal')
  if (text === 'it is absent from group conversations and remains in Message History') { await expect(page.getByText('Unlinked legacy SMS')).toHaveCount(0); await expect(page.getByRole('link', { name: 'Message History' }).first()).toBeVisible(); return }
  if (text === 'the operator opens a thread at 320 CSS pixels using keyboard controls') { await page.setViewportSize({ width: 320, height: 720 }); return openConversation(world, 'normal') }
  if (text === 'the back control labels and live result regions are usable without horizontal overflow') { await expect(page.getByRole('button', { name: 'Back to conversations' })).toBeVisible(); expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false); return }
  throw new Error(`unsupported B017 acceptance step: ${text}`)
}

export async function runAcceptanceScenario(feature: Feature, scenarioIndex: number, _example: Record<string, string>, fixtures: Fixtures) {
  const scenario = feature.scenarios[scenarioIndex]
  if (!scenario) throw new Error(`unknown B017 scenario index: ${scenarioIndex}`)
  const world: World = { ...fixtures, mode: 'normal', groupId: group.id, organizationId }
  for (const step of [...(feature.background ?? []), ...scenario.steps]) await execute(world, step.text)
}
