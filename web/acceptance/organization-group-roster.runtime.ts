import { expect, type BrowserContext, type Page } from '@playwright/test'
import { mockApi } from '../e2e/mock-api'
import { authenticate } from '../e2e/session'
import { mockOrganizationContext, mockOrganizationGroups } from '../test/fixtures'

type Step = { keyword: string; text: string }
type Scenario = { name: string; steps: readonly Step[] }
type Feature = { background?: readonly Step[]; scenarios: readonly Scenario[] }
type Fixtures = { page: Page; context: BrowserContext }

const ownerContext = {
  ...mockOrganizationContext,
  capabilities: ['groups:read', 'group-roster:manage', 'group-join-settings:manage'],
  roleLabel: 'Group owner',
}

async function setup(fixtures: Fixtures, owner = false, overrides = {}) {
  await authenticate(fixtures.context, 'REGULAR')
  await mockApi(fixtures.page, {
    organizationContext: owner ? ownerContext : mockOrganizationContext,
    ...overrides,
  })
}

async function assertNoOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false)
}

export async function runAcceptanceScenario(
  feature: Feature,
  scenarioIndex: number,
  _example: Record<string, string>,
  fixtures: Fixtures,
) {
  const scenario = feature.scenarios[scenarioIndex]
  if (!scenario) throw new Error(`unknown B024 scenario index: ${scenarioIndex}`)
  const { page } = fixtures

  if (scenarioIndex === 0) {
    await setup(fixtures)
    await page.goto('/dashboard/groups/new')
    await page.getByLabel('Group name').fill('Youth Group')
    await page.getByLabel('Join code').fill('YOUTH')
    await page.getByRole('button', { name: 'Create group' }).click()
    await expect(page.getByRole('heading', { name: 'Youth Group' })).toBeVisible()
    await expect(page.getByText('JOIN YOUTH').first()).toBeVisible()
    await expect(page.getByText('(208) 555-0100').first()).toBeVisible()
    return
  }
  if (scenarioIndex === 1) {
    await setup(fixtures, true)
    await page.goto('/dashboard/groups')
    await expect(page.getByText('Unified Young Adults')).toBeVisible()
    await expect(page.getByRole('link', { name: 'Create group' })).toHaveCount(0)
    return
  }
  if (scenarioIndex === 2 || scenarioIndex === 12) {
    await setup(fixtures, true, { groupAccessDenied: true })
    await page.goto('/dashboard/groups/64b7c42f18f0c31f8c9fd999')
    await expect(page.getByText('Group not found or access denied')).toBeVisible()
    await expect(page.getByText('Unified Young Adults')).toHaveCount(0)
    return
  }
  if (scenarioIndex === 3) {
    await setup(fixtures)
    await page.goto(`/dashboard/groups/${mockOrganizationGroups[0].id}`)
    await expect(page.getByText('Manage owners')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Assign' })).toBeVisible()
    return
  }
  if (scenarioIndex === 4 || scenarioIndex === 5 || scenarioIndex === 7) {
    await setup(fixtures, true)
    await page.goto(`/dashboard/groups/${mockOrganizationGroups[0].id}`)
    await page.getByRole('button', { name: 'Add person' }).click()
    await expect(page.getByLabel('Display name')).toBeVisible()
    await expect(page.getByLabel('US mobile number')).toBeVisible()
    await expect(page.getByLabel(/email/i)).toHaveCount(0)
    if (scenarioIndex === 7) {
      await page.getByLabel('Display name').fill('Invalid Number')
      await page.getByLabel('US mobile number').fill('911')
      await expect(page.getByText(/added to this roster/i)).toHaveCount(0)
    }
    return
  }
  if (scenarioIndex === 6) {
    await setup(fixtures, true)
    await page.goto(`/dashboard/groups/${mockOrganizationGroups[0].id}`)
    await page.getByRole('button', { name: 'Remove from group' }).click()
    await expect(page.getByText(/organization contact and memberships in other groups remain/i)).toBeVisible()
    await page.getByLabel('Administrative reason').fill('Moved to another roster')
    await page.getByRole('button', { name: 'Remove membership' }).click()
    await expect(page.getByText('Jordan Lee')).toHaveCount(0)
    return
  }
  if (scenarioIndex === 8) {
    await setup(fixtures)
    await page.goto('/dashboard/groups/new')
    await expect(page.getByText('Unique for this gateway number.')).toBeVisible()
    await expect(page.getByText(/unique in this organization/i)).toHaveCount(0)
    return
  }
  if (scenarioIndex === 9 || scenarioIndex === 10) {
    const archived = [{ ...mockOrganizationGroups[0], status: 'ARCHIVED' }]
    await setup(fixtures, false, { groups: archived })
    if (scenarioIndex === 9) {
      await page.goto('/dashboard/groups')
      await page.getByLabel('Include archived groups').check()
      await expect(page.getByText('Inactive')).toBeVisible()
    } else {
      await page.goto(`/dashboard/groups/${archived[0].id}`)
      await expect(page.getByRole('heading', { name: 'Archived group' })).toBeVisible()
      await expect(page.getByRole('button', { name: 'Reactivate group' })).toBeVisible()
      await expect(page.getByRole('button', { name: 'Add person' })).toHaveCount(0)
    }
    return
  }
  if (scenarioIndex === 11) {
    await setup(fixtures)
    await page.goto(`/dashboard/groups/${mockOrganizationGroups[0].id}`)
    await page.getByLabel('Join code').fill('NEWCODE')
    await page.getByRole('button', { name: 'Save join settings' }).click()
    await expect(page.getByText('JOIN NEWCODE').first()).toBeVisible()
    return
  }
  if (scenarioIndex === 13) {
    await setup(fixtures, true)
    await page.setViewportSize({ width: 320, height: 720 })
    await page.goto(`/dashboard/groups/${mockOrganizationGroups[0].id}`)
    await expect(page.getByRole('button', { name: 'Add person' })).toBeVisible()
    await assertNoOverflow(page)
    return
  }
  await setup(fixtures, true)
  await page.goto(`/dashboard/groups/${mockOrganizationGroups[0].id}`)
  await expect(page.getByText('JOIN UNIFIEDYA')).toBeVisible()
  await expect(page.getByText(/inbound|acknowledgement|consent decision/i)).toHaveCount(0)
}
