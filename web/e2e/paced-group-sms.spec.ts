import { expect, test } from "@playwright/test";
import { authenticate } from "./session";
import { mockApi } from "./mock-api";
import {
  mockOrganizationContext,
  mockOrganizationGroups,
} from "../test/fixtures";
const group = mockOrganizationGroups[0];
for (const width of [320, 375, 390])
  test(`paced preview and progress at ${width}px`, async ({
    page,
    context,
  }) => {
    await page.setViewportSize({ width, height: 850 });
    await authenticate(context);
    await mockApi(page, {
      organizationContext: {
        ...mockOrganizationContext,
        roleLabel: "Group owner",
        capabilities: [
          "groups:read",
          "group-messages:send",
          "group-roster:manage",
        ],
      },
    });
    let accepted = false;
    const pacing = {
      generatedAt: new Date().toISOString(),
      rate: 10,
      waitingForGateway: false,
      startAt: new Date().toISOString(),
      finishAt: new Date(Date.now() + 180000).toISOString(),
      capacityAvailable: true,
      queuedAheadSegments: 18,
    };
    const body =
      "Document https://example.test/" + "a".repeat(180) + "?x=%20&y=1#section";
    const result = {
      id: "paced-send",
      status: "QUEUED",
      groupName: group.displayName,
      message: body,
      counts: { pending: 6 },
      recipients: [],
      createdAt: new Date().toISOString(),
      pacing: { ...pacing, total: 6, counts: { QUEUED: 6 } },
    };
    await page.route(
      "**/api/v1/organizations/**/groups/**/messages**",
      async (route) => {
        const path = new URL(route.request().url()).pathname;
        if (path.endsWith("/preview"))
          return route.fulfill({
            json: {
              data: {
                id: "preview",
                joinCode: group.joinCode,
                message: `${group.joinCode}: ${body}`,
                eligibleCount: 6,
                candidateCount: 6,
                excludedCount: 0,
                excluded: [],
                segmentsPerRecipient: 3,
                totalSegments: 18,
                remainingCapacity: {
                  minuteSegments: 10,
                  dailySegments: 200,
                  rolling30DaySegments: 2000,
                },
                capacityAvailable: true,
                canConfirm: true,
                pacing,
                textAdvice: {
                  encoding: "GSM-7",
                  unsupported: [],
                  trimUnits: 12,
                  saveOneSegmentTotal: 6,
                },
              },
            },
          });
        if (path.endsWith("/confirm")) {
          accepted = true;
          return route.fulfill({ json: { data: result } });
        }
        return route.fulfill({
          json: {
            data: path.endsWith("/paced-send")
              ? result
              : accepted
                ? [result]
                : [],
          },
        });
      },
    );
    await page.goto("/dashboard/communications");
    await page
      .getByRole("group", { name: "Select Group:" })
      .getByRole("button", { name: new RegExp(group.displayName) })
      .click();
    await page
      .getByRole("button", { name: "Send group message", exact: true })
      .click();
    await page.getByLabel("Message", { exact: true }).fill(body);
    await page.getByRole("button", { name: "Preview recipients" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText(/18 segments already queued/)).toBeVisible();
    await expect(
      dialog.getByText(/Estimated sending completion/),
    ).toBeVisible();
    await expect(
      dialog.getByRole("button", { name: "Queue message to 6" }),
    ).toBeEnabled();
    expect(
      await dialog.evaluate((e) => e.scrollWidth <= e.clientWidth + 1),
    ).toBe(true);
    await page.addStyleTag({ content: "html { font-size: 20px; }" });
    expect(
      await dialog.evaluate((e) => e.scrollWidth <= e.clientWidth + 1),
    ).toBe(true);
    await dialog.getByRole("button", { name: "Queue message to 6" }).click();
    await expect(dialog.getByText("Message accepted")).toBeVisible();
    await page.keyboard.press("Escape");
    await page.reload();
    await expect(
      page.getByRole("region", { name: "Group sending progress" }),
    ).toContainText("Queued");
  });
