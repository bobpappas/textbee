import { expect, type BrowserContext, type Page } from '@playwright/test'
import { mockApi } from '../e2e/mock-api'
import { authenticate } from '../e2e/session'
import { mockOrganizationContext, mockOrganizationGroups } from '../test/fixtures'

type Step = { keyword: string; text: string }
type Scenario = { name: string; steps: readonly Step[] }
type Feature = { background?: readonly Step[]; scenarios: readonly Scenario[] }
type Fixtures = { page: Page; context: BrowserContext }

async function setup(fixtures: Fixtures) {
  await authenticate(fixtures.context, 'REGULAR')
  await mockApi(fixtures.page, { organizationContext: mockOrganizationContext })
  await fixtures.page.goto(`/dashboard/groups/${mockOrganizationGroups[0].id}`)
}

async function chooseCsv(page: Page) {
  await page.getByRole('button', { name: 'Bulk add' }).click()
  await page.getByLabel('CSV file').setInputFiles({
    name: 'synthetic-roster.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from('display_name,mobile_number,consent_note\nSynthetic Person,208-555-0124,Asked in person\nInvalid Person,911,\nDuplicate Person,208-555-0124,'),
  })
  await page.getByRole('button', { name: 'Preview rows' }).click()
}

export async function runAcceptanceScenario(
  feature: Feature,
  scenarioIndex: number,
  _example: Record<string, string>,
  fixtures: Fixtures,
) {
  if (!feature.scenarios[scenarioIndex]) throw new Error(`unknown B015 scenario index: ${scenarioIndex}`)
  const { page } = fixtures
  await setup(fixtures)
  if (scenarioIndex === 0) {
    await page.getByRole('button', { name: 'Edit name' }).click()
    await expect(page.getByLabel('Mobile number')).toHaveAttribute('readonly', '')
    await page.getByLabel('Display name').fill('Jordan Rivera')
    await page.getByRole('button', { name: 'Save name' }).click()
    await expect(page.getByText('Jordan Rivera')).toBeVisible()
    await expect(page.getByText('(208) 555-0123')).toBeVisible()
    return
  }
  if (scenarioIndex === 1) {
    await chooseCsv(page)
    await expect(page.getByText('READY_NEW_CONTACT', { exact: true })).toBeVisible()
    await expect(page.getByText('INVALID', { exact: true })).toBeVisible()
    await expect(page.getByText('DUPLICATE_IN_FILE', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Apply 1 ready rows' })).toBeDisabled()
    return
  }
  if (scenarioIndex === 2) {
    await chooseCsv(page)
    await page.getByLabel(/Every person being added/).check()
    await page.getByRole('button', { name: 'Apply 1 ready rows' }).click()
    await expect(page.getByText('Bulk add complete')).toBeVisible()
    await expect(page.getByText('ADDED', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: /login|invitation|email|send SMS/i })).toHaveCount(0)
    return
  }
  await page.setViewportSize({ width: 320, height: 720 })
  await page.getByRole('button', { name: 'Edit name' }).click()
  await expect(page.getByLabel('Mobile number')).toHaveAttribute('readonly', '')
  await page.getByRole('button', { name: 'Cancel' }).click()
  await page.getByRole('button', { name: 'Bulk add' }).click()
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false)
}
