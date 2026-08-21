import {
  expect,
  type BrowserContext,
  type Page,
  type Request,
} from '@playwright/test'
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
  oldMessageRequest?: Request
  oldMessageRequestFailed: boolean
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
  if (text === 'an authenticated operator with delayed Organization A history') {
    const organizationA = {
      ...mockOrganizationContext,
      organization: {
        ...mockOrganizationContext.organization,
        id: 'organization-a',
        displayName: 'Organization A',
      },
    }
    const organizationB = {
      ...mockOrganizationContext,
      organization: {
        ...mockOrganizationContext.organization,
        id: 'organization-b',
        displayName: 'Organization B',
      },
    }
    await authenticate(world.context, 'REGULAR')
    await mockApi(page, {
      organizationContext: organizationA,
      organizationProfileForbidden: true,
    })

    let contextRequests = 0
    await page.route(
      '**/api/v1/organizations/current-context',
      async (route) => {
        contextRequests += 1
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: contextRequests === 1 ? organizationA : organizationB,
          }),
        })
      },
    )

    let messageRequests = 0
    await page.route(
      '**/api/v1/gateway/devices/*/messages*',
      async (route) => {
        messageRequests += 1
        const request = route.request()
        const fromA = messageRequests === 1
        if (fromA) {
          world.oldMessageRequest = request
          await new Promise((resolve) => setTimeout(resolve, 750))
        }
        try {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              data: [
                {
                  _id: fromA ? 'organization-a-message' : 'organization-b-message',
                  message: fromA
                    ? 'private Organization A message'
                    : 'Organization B message',
                  sender: '+12085550100',
                  status: 'received',
                  type: 'received',
                  receivedAt: new Date().toISOString(),
                  createdAt: new Date().toISOString(),
                },
              ],
              meta: { total: 1, page: 1, limit: 20, totalPages: 1 },
            }),
          })
        } catch {
          // The expected Organization A cancellation can close the intercepted
          // request before its deliberately delayed response is fulfillable.
        }
      },
    )
    page.on('requestfailed', (request) => {
      if (request === world.oldMessageRequest) {
        world.oldMessageRequestFailed = true
      }
    })

    await page.goto('/dashboard/messaging/history')
    await expect(page.getByText('Organization A').first()).toBeVisible()
    await expect.poll(() => messageRequests).toBe(1)
    return
  }
  if (text === 'the active browser context changes to Organization B') {
    await page
      .getByRole('link', { name: 'Organization profile' })
      .first()
      .click()
    await expect(page.getByText('Organization B').first()).toBeVisible()
    await page.goBack()
    return
  }
  if (text === 'only Organization B history is rendered') {
    await expect(page.getByText('Organization B message')).toBeVisible()
    await expect(page.getByText('private Organization A message')).toHaveCount(0)
    return
  }
  if (
    text ===
    'the delayed Organization A request is cancelled and cannot reappear'
  ) {
    await expect.poll(() => world.oldMessageRequestFailed).toBe(true)
    await page.waitForTimeout(900)
    await expect(page.getByText('private Organization A message')).toHaveCount(0)
    await expect(page.getByText('Organization B message')).toHaveCount(1)
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
    oldMessageRequestFailed: false,
  }
  for (const step of scenario.steps) await executeStep(world, step.text)
}
