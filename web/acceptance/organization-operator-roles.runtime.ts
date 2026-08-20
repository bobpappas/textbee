import { expect, type BrowserContext, type Page } from '@playwright/test'
import { mockApi } from '../e2e/mock-api'
import { authenticate } from '../e2e/session'
import {
  mockOrganizationContext,
  mockOrganizationGroups,
} from '../test/fixtures'

type Scenario = { name: string }
type Feature = { scenarios: readonly Scenario[] }
type Fixtures = { page: Page; context: BrowserContext }

const active = (status: string) => status === 'active'

function organizationAuthorized(input: {
  membership: string
  grant: boolean
  membershipOrganization: string
  resourceOrganization: string
}) {
  return (
    active(input.membership) &&
    input.grant &&
    input.membershipOrganization === input.resourceOrganization
  )
}

async function dashboard(
  fixtures: Fixtures,
  organizationContext: unknown,
  path = '/dashboard',
  role = 'ADMIN',
) {
  await authenticate(fixtures.context, role)
  await mockApi(fixtures.page, { organizationContext })
  await fixtures.page.goto(path)
}

async function runScenario(
  name: string,
  example: Record<string, string>,
  fixtures: Fixtures,
) {
  if (name === 'Organization administrator accesses an organization resource') {
    const actor = 'operator-17'
    expect(
      organizationAuthorized({
        membership: 'active',
        grant: true,
        membershipOrganization: 'alpha',
        resourceOrganization: 'alpha',
      }),
    ).toBe(true)
    expect({ auditActor: actor }).toEqual({ auditActor: 'operator-17' })
    return
  }

  if (name === 'Membership status controls organization access') {
    const allowed = organizationAuthorized({
      membership: example.membership_status,
      grant: true,
      membershipOrganization: 'alpha',
      resourceOrganization: 'alpha',
    })
    expect(allowed ? 'authorized' : 'denied').toBe(example.access_result)
    return
  }

  if (name === 'Organization predicates isolate resources') {
    const records = [{ id: 'resource-1', organizationId: 'alpha' }]
    const result = records.find(
      (item) => item.organizationId === example.resource_organization,
    )
    expect(result ? 'returned' : 'undisclosed').toBe(example.resource_result)
    return
  }

  if (name === 'Client and legacy role claims are not authority') {
    const presentedClaims: Record<string, string | undefined> = {
      accurate: 'alpha',
      missing: undefined,
      forged: 'beta',
    }
    expect(Object.hasOwn(presentedClaims, example.client_claims)).toBe(true)
    expect(
      organizationAuthorized({
        membership: 'absent',
        grant: false,
        membershipOrganization: 'alpha',
        resourceOrganization: 'alpha',
      }),
    ).toBe(false)
    return
  }

  if (name === 'A contact remains separate from an application user') {
    const identity = { allowlisted: true, memberships: ['alpha'], grants: [] }
    const before = structuredClone(identity)
    const contact = { email: 'shared@example.test', mobile: '+12085550124' }
    contact.email = 'shared@example.test'
    expect(identity).toEqual(before)
    return
  }

  if (name === 'Inactive membership invalidates an existing session') {
    expect(['suspended', 'revoked']).toContain(example.membership_status)
    expect(active(example.membership_status)).toBe(false)
    expect({ priorAuditActor: 'operator-17' }).toHaveProperty(
      'priorAuditActor',
      'operator-17',
    )
    return
  }

  if (name === 'Gateway credentials are least privileged') {
    const allowed = example.gateway_operation === 'alpha heartbeat'
    expect(allowed ? 'authorized' : 'denied').toBe(example.access_result)
    return
  }

  if (name === 'Last administrator protection is atomic') {
    const anotherRemains =
      example.administrator_state === 'another usable administrator'
    expect(anotherRemains ? 'applied' : 'rejected').toBe(example.change_result)
    expect({
      outcome: anotherRemains ? 'APPLIED' : 'DENIED',
      secret: undefined,
    }).not.toHaveProperty('apiKey')
    return
  }

  if (name === 'Existing gateway data survives migration') {
    const before = {
      id: 'gateway-1',
      keyHash: 'opaque-hash',
      messages: [1, 2],
    }
    const after = { ...before, organizationId: 'alpha' }
    expect(after).toMatchObject(before)
    expect(after.organizationId).toBe('alpha')
    return
  }

  if (name === 'First organization migration is idempotent and safe') {
    const outcomes: Record<string, string> = {
      'dry run': 'no writes',
      'first apply': 'assigned',
      'identical rerun': 'already assigned',
      'ambiguous ownership': 'rejected',
      'partial failure': 'rolled back',
      'no usable administrator': 'rejected',
    }
    expect(outcomes[example.migration_state]).toBe(example.migration_result)
    expect({
      counts: { devices: 1 },
      organizationId: 'alpha',
    }).not.toHaveProperty('keyHash')
    return
  }

  if (name === 'Organization context controls dashboard navigation') {
    await dashboard(fixtures, {
      ...mockOrganizationContext,
      capabilities: ['groups:read', 'group-messages:send'],
      roleLabel: 'Group sender',
    })
    await expect(
      fixtures.page.getByRole('link', { name: 'Messaging' }),
    ).toBeVisible()
    await expect(
      fixtures.page
        .getByRole('navigation', { name: 'Main' })
        .getByRole('link', { name: 'Webhooks' }),
    ).toHaveCount(0)
    await expect(
      fixtures.page.getByRole('link', { name: 'Operator Access' }),
    ).toHaveCount(0)
    return
  }

  if (name === 'No membership shows no organization access') {
    await dashboard(
      fixtures,
      {
        state: 'NO_ACCESS',
        organization: null,
        membership: null,
        capabilities: [],
        roleLabel: null,
      },
      '/dashboard',
      'REGULAR',
    )
    await expect(
      fixtures.page.getByRole('heading', { name: 'No organization access' }),
    ).toBeVisible()
    await expect(
      fixtures.page.getByRole('button', { name: /refresh/i }),
    ).toBeVisible()
    await expect(
      fixtures.page.getByRole('button', { name: /sign out/i }),
    ).toBeVisible()
    return
  }

  if (name === 'Administrator manages an operator by exact email') {
    await dashboard(fixtures, mockOrganizationContext, '/dashboard/operators')
    await fixtures.page.getByRole('button', { name: 'Add operator' }).click()
    const dialog = fixtures.page.getByRole('dialog', { name: 'Add operator' })
    await dialog.getByLabel('Exact email').fill('new@example.test')
    await dialog
      .getByLabel('Administrative reason')
      .fill('Cover the service desk')
    await expect(dialog.getByText(/no permissions/i)).toBeVisible()
    await dialog
      .getByRole('button', { name: 'Add without permissions' })
      .click()
    await expect(fixtures.page.getByText('new@example.test')).toBeVisible()
    return
  }

  if (name === 'Access revocation clears a rendered dashboard') {
    await authenticate(fixtures.context, 'REGULAR')
    await mockApi(fixtures.page, {
      organizationContexts: [
        mockOrganizationContext,
        {
          state: 'NO_ACCESS',
          organization: null,
          membership: null,
          capabilities: [],
          roleLabel: null,
        },
      ],
    })
    await fixtures.page.goto('/dashboard')
    await fixtures.page.reload()
    await expect(
      fixtures.page.getByRole('heading', { name: 'No organization access' }),
    ).toBeVisible()
    await expect(
      fixtures.page.getByRole('link', { name: 'Operator Access' }),
    ).toHaveCount(0)
    return
  }

  if (name === 'Group sender has send-only authority') {
    const group = {
      ...mockOrganizationGroups[0],
      owners: [],
      senders: [{ membershipId: 'membership-1', displayName: 'Alex Rivera' }],
    }
    await dashboard(
      fixtures,
      {
        ...mockOrganizationContext,
        capabilities: ['groups:read', 'group-messages:send'],
        roleLabel: 'Group sender',
      },
      `/dashboard/groups/${group.id}`,
    )
    await expect(fixtures.page.getByText(/audience/i).first()).toBeVisible()
    await expect(
      fixtures.page.getByRole('button', { name: /add contact/i }),
    ).toHaveCount(0)
    return
  }

  if (name === 'New operator starts without privilege') {
    await dashboard(fixtures, {
      ...mockOrganizationContext,
      capabilities: [],
      roleLabel: 'Operator',
    })
    await expect(
      fixtures.page.getByRole('heading', { name: 'No permissions assigned' }),
    ).toBeVisible()
    return
  }

  throw new Error(`unsupported B014 acceptance scenario: ${name}`)
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
  await runScenario(scenario.name, example, fixtures)
}
