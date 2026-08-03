import { expect, type BrowserContext, type Page } from '@playwright/test'
import { mockApi, type MockApiOverrides } from '../e2e/mock-api'
import { authenticate } from '../e2e/session'
import { mockOrganizationContext } from '../test/fixtures'

type Step = { keyword: string; text: string }
type Scenario = { name: string; steps: readonly Step[] }
type Feature = {
  background?: readonly Step[]
  scenarios: readonly Scenario[]
}
type Fixtures = { page: Page; context: BrowserContext }
type World = Fixtures & {
  backendRequests: string[]
  overrides?: MockApiOverrides
}

const noAccess = {
  state: 'NO_ACCESS',
  organization: null,
  membership: null,
  capabilities: [],
  roleLabel: null,
}
const selectionRequired = {
  ...noAccess,
  state: 'SELECTION_REQUIRED',
}

async function configure(
  world: World,
  role: string,
  overrides: MockApiOverrides,
) {
  await authenticate(world.context, role)
  world.overrides = overrides
  await mockApi(world.page, overrides)
}

async function executeStep(world: World, text: string) {
  const { page } = world
  if (
    text === 'an authenticated operator with one active organization context'
  ) {
    await configure(world, 'REGULAR', {
      organizationContext: mockOrganizationContext,
    })
    return
  }
  if (
    text ===
    'an authenticated platform administrator without organization access'
  ) {
    await configure(world, 'ADMIN', { organizationContext: noAccess })
    return
  }
  if (text === 'an authenticated operator requiring organization selection') {
    await configure(world, 'REGULAR', {
      organizationContext: selectionRequired,
    })
    return
  }
  if (
    text ===
    'an authenticated operator whose organization access will be revoked'
  ) {
    await configure(world, 'REGULAR', {
      organizationContexts: [mockOrganizationContext, noAccess],
      organizationContext: mockOrganizationContext,
    })
    return
  }
  if (
    text ===
    'an authenticated operator whose profile request is denied after context loads'
  ) {
    await configure(world, 'REGULAR', {
      organizationContexts: [mockOrganizationContext, noAccess],
      organizationContext: mockOrganizationContext,
      organizationContextDelayMs: 1500,
      organizationProfileForbidden: true,
    })
    return
  }
  if (text === 'the operator opens the dashboard') {
    await page.goto('/dashboard')
    return
  }
  if (text === 'the administrator opens the dashboard') {
    await page.goto('/dashboard')
    return
  }
  if (text === 'the operator opens an organization-aware route directly') {
    await page.goto('/dashboard/admin/organizations/forged-organization')
    return
  }
  if (
    text === 'the active organization profile is opened and context refreshes'
  ) {
    await page.goto('/dashboard')
    await page
      .getByRole('link', { name: 'Organization profile' })
      .first()
      .click()
    await expect(page.getByLabel('Organization name')).toBeVisible()
    await page.reload()
    return
  }
  if (text === 'the operator opens the denied organization profile') {
    await page.goto('/dashboard')
    await expect(
      page.getByLabel(
        `Organization: ${mockOrganizationContext.organization.displayName}`,
      ),
    ).toBeVisible()
    await page.goto(
      `/dashboard/admin/organizations/${mockOrganizationContext.organization.id}`,
    )
    return
  }
  if (text === 'the operator opens account navigation at 320 pixels') {
    await page.setViewportSize({ width: 320, height: 720 })
    await page.goto('/dashboard')
    await page.getByRole('button', { name: 'Open account navigation' }).click()
    return
  }
  if (text === 'the operator opens legacy message history') {
    page.on('request', (request) => {
      if (
        request.url().includes('/api/v1/gateway/') ||
        request.url().includes('/api/v1/webhooks') ||
        request.url().includes('/api/v1/auth/api-keys')
      ) {
        world.backendRequests.push(request.url())
      }
    })
    await page.goto('/dashboard/messaging/history')
    await expect(page.getByRole('heading', { name: 'Messaging' })).toBeVisible()
    return
  }
  if (text === 'the shell displays the active organization name and role') {
    await expect(
      page.getByLabel(
        `Organization: ${mockOrganizationContext.organization.displayName}`,
      ),
    ).toBeVisible()
    await expect(
      page.getByText(mockOrganizationContext.roleLabel).first(),
    ).toBeVisible()
    return
  }
  if (text === 'Organization profile navigation is available') {
    await expect(
      page.getByRole('link', { name: 'Organization profile' }).first(),
    ).toBeVisible()
    return
  }
  if (text === 'no organization identity or profile navigation is displayed') {
    await expect(
      page.getByText(mockOrganizationContext.organization.displayName),
    ).toHaveCount(0)
    await expect(
      page.getByRole('link', { name: 'Organization profile' }),
    ).toHaveCount(0)
    return
  }
  if (text === 'the platform Organizations registry remains available') {
    await expect(
      page.getByRole('link', { name: 'Organizations' }).first(),
    ).toBeVisible()
    return
  }
  if (text === 'the page shows Organization selection required') {
    await expect(
      page.getByRole('heading', { name: 'Organization selection required' }),
    ).toBeVisible()
    return
  }
  if (text === 'no organization identity is disclosed') {
    await expect(page.getByText('Boise Church of Christ')).toHaveCount(0)
    await expect(page.getByText('Another organization')).toHaveCount(0)
    return
  }
  if (text === 'the page shows No organization access') {
    await expect(
      page.getByRole('heading', { name: 'No organization access' }),
    ).toBeVisible()
    return
  }
  if (
    text === 'stale organization identity and profile navigation are absent'
  ) {
    await expect(
      page.getByText(mockOrganizationContext.organization.displayName),
    ).toHaveCount(0)
    await expect(
      page.getByRole('link', { name: 'Organization profile' }),
    ).toHaveCount(0)
    return
  }
  if (text === 'loading hides the cached organization identity') {
    await expect(
      page.getByLabel('Loading organization context').first(),
    ).toBeVisible()
    await expect(
      page.getByText(mockOrganizationContext.organization.displayName),
    ).toHaveCount(0)
    return
  }
  if (text === 'the refreshed page shows No organization access') {
    await expect(
      page.getByRole('heading', { name: 'No organization access' }),
    ).toBeVisible()
    return
  }
  if (
    text === 'mobile organization identity and profile navigation are available'
  ) {
    const sheet = page.getByRole('dialog', { name: 'Account navigation' })
    await expect(
      sheet.getByText(mockOrganizationContext.organization.displayName),
    ).toBeVisible()
    await expect(
      sheet.getByRole('link', { name: 'Organization profile' }),
    ).toBeVisible()
    return
  }
  if (text === 'the page has no horizontal overflow') {
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth >
          document.documentElement.clientWidth,
      ),
    ).toBe(false)
    return
  }
  if (text === 'legacy backend requests contain no organization selector') {
    expect(world.backendRequests.length).toBeGreaterThan(0)
    for (const request of world.backendRequests) {
      const url = new URL(request)
      expect(url.searchParams.has('organizationId')).toBe(false)
      expect(url.pathname).not.toContain('/organizations/')
    }
    return
  }
  throw new Error(`unsupported B022 acceptance step: ${text}`)
}

export async function runAcceptanceScenario(
  feature: Feature,
  scenarioIndex: number,
  _example: Record<string, string>,
  fixtures: Fixtures,
) {
  const scenario = feature.scenarios[scenarioIndex]
  if (!scenario) {
    throw new Error(`unknown acceptance scenario index: ${scenarioIndex}`)
  }
  const world: World = { ...fixtures, backendRequests: [] }
  for (const step of [...(feature.background ?? []), ...scenario.steps]) {
    await executeStep(world, step.text)
  }
}
