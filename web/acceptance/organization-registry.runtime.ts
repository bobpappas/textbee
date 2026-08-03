import { expect, type BrowserContext, type Page } from '@playwright/test'
import { mockApi } from '../e2e/mock-api'
import { authenticate } from '../e2e/session'

type Step = { keyword: string; text: string }
type Scenario = { name: string; steps: readonly Step[] }
type Feature = {
  background?: readonly Step[]
  scenarios: readonly Scenario[]
}
type Fixtures = { page: Page; context: BrowserContext }
type World = Fixtures & { organizationName?: string }

const expand = (text: string, example: Record<string, string>) =>
  text.replace(/<([A-Za-z0-9_]+)>/g, (_match, key) => {
    if (!(key in example))
      throw new Error(`missing acceptance example value: ${key}`)
    return example[key]
  })

async function executeStep(world: World, text: string) {
  const { page, context } = world
  if (text === 'an authenticated platform administrator') {
    await authenticate(context, 'ADMIN')
    return
  }
  if (text === 'an authenticated ordinary user') {
    await authenticate(context, 'REGULAR')
    return
  }
  if (text === 'an empty organization registry') {
    await mockApi(page)
    return
  }
  if (text === 'a forbidden organization registry API') {
    await mockApi(page, { organizationsForbidden: true })
    return
  }
  if (
    text === 'the administrator opens the organization registry' ||
    text === 'the user opens the organization registry directly'
  ) {
    await page.goto('/dashboard/admin/organizations')
    return
  }
  if (
    text === 'the administrator opens the organization registry at 375 pixels'
  ) {
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto('/dashboard/admin/organizations')
    return
  }
  if (text.startsWith('creates organization ')) {
    const name = text.slice('creates organization '.length)
    world.organizationName = name
    await page.getByRole('button', { name: 'Create organization' }).click()
    const dialog = page.getByRole('dialog', { name: 'Create organization' })
    await dialog.getByLabel('Organization name').fill(name)
    await dialog.getByRole('button', { name: 'Create' }).click()
    await expect(dialog).toBeHidden()
    return
  }
  if (
    text.startsWith('organization ') &&
    text.endsWith(' appears after server confirmation')
  ) {
    const name = text.slice(
      'organization '.length,
      -' appears after server confirmation'.length,
    )
    await expect(page.getByText(name).first()).toBeVisible()
    return
  }
  if (
    text.startsWith('organization ') &&
    text.endsWith(' remains after a browser refresh')
  ) {
    const name = text.slice(
      'organization '.length,
      -' remains after a browser refresh'.length,
    )
    await page.reload()
    await expect(page.getByText(name).first()).toBeVisible()
    return
  }
  if (text === 'the organization registry shows access denied') {
    await expect(page.getByText('Access denied')).toBeVisible()
    return
  }
  if (text === 'no organization registry data is disclosed') {
    await expect(page.getByRole('link', { name: 'Organizations' })).toHaveCount(
      0,
    )
    await expect(page.getByRole('link', { name: 'Manage' })).toHaveCount(0)
    return
  }
  if (text === 'opens the created organization profile') {
    await page.getByRole('link', { name: 'Manage' }).first().click()
    await expect(page.getByText('Your role:')).toBeVisible()
    return
  }
  if (text.startsWith('renames the organization to ')) {
    const name = text.slice('renames the organization to '.length)
    await page.getByLabel('Organization name').fill(name)
    await page.getByRole('button', { name: 'Save changes' }).click()
    await expect(page.getByText('Organization name updated.')).toBeVisible()
    return
  }
  if (text.startsWith('the profile shows server-confirmed name ')) {
    const name = text.slice('the profile shows server-confirmed name '.length)
    await expect(page.getByLabel('Organization name')).toHaveValue(name)
    return
  }
  if (
    text.startsWith('server-confirmed name ') &&
    text.endsWith(' remains after a browser refresh')
  ) {
    const name = text.slice(
      'server-confirmed name '.length,
      -' remains after a browser refresh'.length,
    )
    await page.reload()
    await expect(page.getByLabel('Organization name')).toHaveValue(name)
    return
  }
  if (text === 'the registry has no horizontal page overflow') {
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth >
          document.documentElement.clientWidth,
      ),
    ).toBe(false)
    return
  }
  if (text === 'the Organizations command is keyboard searchable') {
    await page.keyboard.press('Control+k')
    await page
      .getByPlaceholder('Search pages, settings and actions…')
      .fill('organizations')
    await expect(
      page.getByRole('option', { name: /Organizations/ }),
    ).toBeVisible()
    return
  }
  throw new Error(`unsupported B020 acceptance step: ${text}`)
}

export async function runAcceptanceScenario(
  feature: Feature,
  scenarioIndex: number,
  example: Record<string, string>,
  fixtures: Fixtures,
) {
  const scenario = feature.scenarios[scenarioIndex]
  if (!scenario)
    throw new Error(`unknown acceptance scenario index: ${scenarioIndex}`)
  const world: World = { ...fixtures }
  for (const step of [...(feature.background ?? []), ...scenario.steps]) {
    await executeStep(world, expand(step.text, example))
  }
}
