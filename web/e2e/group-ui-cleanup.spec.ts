import { expect, test } from '@playwright/test'
import { authenticate } from './session'
import { mockApi } from './mock-api'
import { mockOrganizationContext, mockOrganizationGroups } from '../test/fixtures'

const first = mockOrganizationGroups[0]
const second = { ...first, id: '64b7c42f18f0c31f8c9fd202', displayName: 'Second Test Group', joinCode: 'SECOND', rosterCount: 12 }

for (const role of ['Group sender', 'Group owner']) {
  for (const width of [390, 1280]) {
    test(`${role} selects a group and protects drafts at ${width}px`, async ({ page, context }) => {
      const supportRequests: string[] = []
      page.on('request', request => { if (request.url().includes('supporthq.app')) supportRequests.push(request.url()) })
      await page.setViewportSize({ width, height: 900 })
      await authenticate(context)
      await mockApi(page, { groups: [first, second], organizationContext: {
        ...mockOrganizationContext, roleLabel: role,
        capabilities: ['groups:read', 'group-messages:send', ...(role === 'Group owner' ? ['group-roster:manage', 'group-join-settings:manage'] : [])],
      } })
      await page.goto('/dashboard')
      await expect(page.getByRole('button', { name: 'Quick Start', exact: true })).toHaveCount(0)
      await expect(page.getByRole('link', { name: /Quick start|Download app|Contribute/i })).toHaveCount(0)
      await expect(page.getByText(`© ${new Date().getFullYear()} Bob Pappas · Built with TextBee`)).toBeVisible()
      await page.goto('/dashboard/communications')
      const cards = page.getByRole('group', { name: 'Select Group:' })
      const firstCard = cards.getByRole('button', { name: new RegExp(first.displayName) })
      const secondCard = cards.getByRole('button', { name: /Second Test Group/ })
      await expect(firstCard).toContainText('1 active member')
      await expect(secondCard).toContainText('12 active members')
      await expect(cards.locator('[aria-pressed="true"]')).toHaveCount(0)
      const send = page.getByRole('button', { name: 'Send group message', exact: true })
      await expect(send).toBeDisabled()
      await firstCard.focus()
      await page.keyboard.press('Enter')
      await expect(firstCard).toHaveAttribute('aria-pressed', 'true')
      await send.click()
      await page.getByLabel('Message', { exact: true }).fill('Draft only, never send')
      await page.keyboard.press('Escape')
      await secondCard.click()
      await expect(page.getByRole('alertdialog')).toBeVisible()
      await page.getByRole('button', { name: 'Keep editing' }).click()
      await expect(firstCard).toHaveAttribute('aria-pressed', 'true')
      await send.click()
      await expect(page.getByLabel('Message', { exact: true })).toHaveValue('Draft only, never send')
      await page.keyboard.press('Escape')
      await secondCard.click()
      await page.getByRole('button', { name: 'Discard and continue' }).click()
      await expect(secondCard).toHaveAttribute('aria-pressed', 'true')
      await send.click()
      await expect(page.getByRole('heading', { name: 'Send to Second Test Group' })).toBeVisible()
      await expect(page.getByLabel('Message', { exact: true })).toHaveValue('')
      await page.keyboard.press('Escape')
      const select = page.getByRole('combobox', { name: 'Resolution filter' })
      await expect(select).toHaveCSS('padding-right', '40px')
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
      await expect(page.locator('.shq-bubble')).toHaveCount(0)
      await expect(page.getByRole('button', { name: 'Open chat', exact: true })).toHaveCount(0)
      expect(supportRequests).toEqual([])
      await page.screenshot({ path: `/tmp/b059-${role.replace(' ', '-')}-${width}.png`, fullPage: true })
    })
  }
}

test('switching groups protects a reply and clears the previous conversation', async ({ page, context }) => {
  await authenticate(context)
  await mockApi(page, { groups: [first, second], organizationContext: { ...mockOrganizationContext, roleLabel: 'Group sender', capabilities: ['groups:read', 'group-messages:send'] } })
  await page.route('**/api/v1/organizations/**/communications/conversation-1**', route => route.fulfill({ json: { data: {
    id: 'conversation-1', contact: { displayName: 'Synthetic Contact', number: '***0123' }, entries: [{
      id: 'entry-1', direction: 'INBOUND', kind: 'MESSAGE', message: 'Synthetic incoming text', eventAt: '2026-10-07T12:00:00Z', author: 'Contact',
      group: { id: first.id, displayName: first.displayName }, attribution: { state: 'CONFIRMED', reason: 'Test attribution', candidateGroupIds: [], manuallyAssigned: false }, version: 1,
    }],
  } } }))
  await page.goto(`/dashboard/communications?group=${first.id}&conversation=conversation-1`)
  const reply = page.getByLabel('Reply to Synthetic Contact directly')
  await reply.fill('Unsent reply')
  const secondCard = page.getByRole('group', { name: 'Select Group:' }).getByRole('button', { name: /Second Test Group/ })
  await secondCard.click()
  await page.getByRole('button', { name: 'Keep editing' }).click()
  await expect(reply).toHaveValue('Unsent reply')
  await secondCard.click()
  await page.getByRole('button', { name: 'Discard and continue' }).click()
  await expect(page).not.toHaveURL(/conversation=/)
  await expect(page.getByText('Select a conversation to read and reply.')).toBeVisible()
  await expect(page.getByText('Synthetic incoming text')).toHaveCount(0)
})
