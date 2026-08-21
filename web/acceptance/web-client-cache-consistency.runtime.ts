import { expect, type BrowserContext, type Page } from '@playwright/test'
import { mockApi } from '../e2e/mock-api'
import { authenticate } from '../e2e/session'
import { mockOrganizationContext } from '../test/fixtures'

type Step = { keyword: string; text: string }
type Scenario = { name: string; steps: readonly Step[] }
type Feature = { scenarios: readonly Scenario[] }
type Fixtures = { page: Page; context: BrowserContext }
type World = Fixtures & {
  messageRequests: string[]
  webhookRequests: string[]
  requestCountBeforeRefresh: number
}

async function executeStep(world: World, text: string) {
  const { page } = world
  if (text === 'an authenticated organization operator using mocked history data') {
    await authenticate(world.context, 'REGULAR')
    await mockApi(page, { organizationContext: mockOrganizationContext })
    page.on('request', (request) => {
      const url = request.url()
      if (/\/gateway\/devices\/[^/]+\/messages/.test(url)) {
        world.messageRequests.push(url)
      }
      if (url.includes('/webhooks/notifications')) {
        world.webhookRequests.push(url)
      }
    })
    return
  }
  if (text === 'the operator opens message history and requests a refresh') {
    await page.goto('/dashboard/messaging/history')
    await expect(page.getByText('Hello from textbee')).toBeVisible()
    world.requestCountBeforeRefresh = world.messageRequests.length
    await page.getByRole('button', { name: 'Refresh' }).click()
    await expect.poll(() => world.messageRequests.length).toBeGreaterThan(
      world.requestCountBeforeRefresh,
    )
    return
  }
  if (text === 'exactly one additional message request is made') {
    expect(world.messageRequests.length - world.requestCountBeforeRefresh).toBe(1)
    return
  }
  if (text === 'each server message is rendered once') {
    await expect(page.getByText('Hello from textbee')).toHaveCount(1)
    await expect(page.getByText('Reply from a customer')).toHaveCount(1)
    return
  }
  if (
    text === 'the operator opens webhook delivery history and requests a refresh'
  ) {
    await page.goto('/dashboard/webhooks/deliveries')
    await expect(page.getByText(/refreshes every 15 seconds/i)).toBeVisible()
    await expect.poll(() => world.webhookRequests.length).toBeGreaterThan(0)
    world.requestCountBeforeRefresh = world.webhookRequests.length
    await page.getByRole('button', { name: 'Refresh' }).click()
    await expect.poll(() => world.webhookRequests.length).toBeGreaterThan(
      world.requestCountBeforeRefresh,
    )
    return
  }
  if (text === 'the webhook request contains every active filter dimension') {
    const request = new URL(world.webhookRequests.at(-1) ?? '')
    for (const parameter of [
      'eventType',
      'status',
      'deviceId',
      'webhookSubscriptionId',
      'start',
      'end',
      'page',
      'limit',
    ]) {
      expect(request.searchParams.has(parameter), parameter).toBe(true)
    }
    return
  }
  if (text === 'exactly one additional webhook request is made') {
    expect(world.webhookRequests.length - world.requestCountBeforeRefresh).toBe(1)
    return
  }
  throw new Error(`unsupported B031 acceptance step: ${text}`)
}

export async function runAcceptanceScenario(
  feature: Feature,
  scenarioIndex: number,
  _example: Record<string, string>,
  fixtures: Fixtures,
) {
  const scenario = feature.scenarios[scenarioIndex]
  if (!scenario) throw new Error(`unknown acceptance scenario: ${scenarioIndex}`)
  const world: World = {
    ...fixtures,
    messageRequests: [],
    webhookRequests: [],
    requestCountBeforeRefresh: 0,
  }
  for (const step of scenario.steps) await executeStep(world, step.text)
}
