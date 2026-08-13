import { expect, type BrowserContext, type Page } from "@playwright/test";
import { mockApi } from "../e2e/mock-api";
import { authenticate } from "../e2e/session";
import {
  mockOrganizationContext,
  mockOrganizationGroups,
  mockRosterMembers,
} from "../test/fixtures";

type Step = { keyword: string; text: string };
type Scenario = { name: string; steps: readonly Step[] };
type Feature = { scenarios: readonly Scenario[] };
type Fixtures = { page: Page; context: BrowserContext };

const groupId = mockOrganizationGroups[0].id;

async function openGroup(
  fixtures: Fixtures,
  options: { archived?: boolean; rosterMembers?: any[] } = {},
) {
  await authenticate(fixtures.context, "REGULAR");
  const groups = structuredClone(mockOrganizationGroups);
  if (options.archived) groups[0].status = "ARCHIVED";
  await mockApi(fixtures.page, {
    organizationContext: mockOrganizationContext,
    groups,
    rosterMembers: options.rosterMembers,
  });
  await fixtures.page.goto(`/dashboard/groups/${groupId}`);
}

export async function runAcceptanceScenario(
  _feature: Feature,
  scenarioIndex: number,
  _example: Record<string, string>,
  fixtures: Fixtures,
) {
  const { page } = fixtures;

  if (scenarioIndex === 0 || scenarioIndex === 1) {
    let submitted: Record<string, unknown> | undefined;
    page.on("request", (request) => {
      if (request.method() === "POST" && request.url().includes("/roster"))
        submitted = request.postDataJSON();
    });
    await openGroup(fixtures);
    await page.getByRole("button", { name: "Add person" }).click();
    await page.getByLabel("Display name").fill("Consent Test Contact");
    await page.getByLabel("US mobile number").fill("(208) 555-0124");
    const submit = page.getByRole("button", { name: "Add person" }).last();
    if (scenarioIndex === 0) {
      await expect(submit).toBeDisabled();
      return;
    }
    await page
      .getByLabel(
        "This person asked to receive messages or provided this number for church communications.",
      )
      .check();
    await page
      .getByLabel("Consent method note (optional)")
      .fill("In-person request");
    await submit.click();
    await expect
      .poll(() => submitted)
      .toMatchObject({
        consentAffirmed: true,
        consentMethodNote: "In-person request",
      });
    return;
  }

  if (scenarioIndex === 2) {
    await openGroup(fixtures, {
      rosterMembers: [
        {
          ...mockRosterMembers[0],
          consentStatus: "ACTIVE",
          consentSource: "TEXT_TO_JOIN",
        },
      ],
    });
    await expect(page.getByText("Consent: Text-to-Join")).toBeVisible();
    await expect(page.getByText(/JOIN UNIFIEDYA/i).first()).toBeVisible();
    await expect(page.getByText(/original inbound message/i)).toHaveCount(0);
    return;
  }

  if (scenarioIndex === 3) {
    await openGroup(fixtures, {
      rosterMembers: [
        {
          ...mockRosterMembers[0],
          consentStatus: "MISSING",
          consentSource: undefined,
        },
      ],
    });
    await expect(page.getByText("No active group consent")).toBeVisible();
    return;
  }

  if (scenarioIndex === 4) {
    await openGroup(fixtures);
    await expect(page.getByText("JOIN UNIFIEDYA").first()).toBeVisible();
    await expect(page.getByText(/message frequency varies/i)).toBeVisible();
    await expect(
      page.getByText(/message and data rates may apply/i),
    ).toBeVisible();
    await expect(
      page.getByText(/STOP.*all Boise Church of Christ texts/i),
    ).toBeVisible();
    await expect(page.getByText(/HELP.*privacy or support/i)).toBeVisible();
    return;
  }

  await openGroup(fixtures, { archived: true });
  await expect(page.getByText(/inactive/i).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Add person" })).toHaveCount(0);
}
