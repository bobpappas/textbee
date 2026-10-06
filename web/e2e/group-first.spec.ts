import { expect, test } from "@playwright/test";
import { authenticate } from "./session";
import { mockApi } from "./mock-api";
import { mockOrganizationContext } from "../test/fixtures";

for (const width of [390, 1280]) {
  test(`operators see group workflows and no administrator tools at ${width}px`, async ({
    page,
    context,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await authenticate(context);
    await mockApi(page, {
      organizationContext: {
        ...mockOrganizationContext,
        roleLabel: "Group sender",
        capabilities: ["groups:read", "group-messages:send"],
      },
    });
    await page.goto("/dashboard");
    await expect(
      page.getByRole("link", { name: "Send group message" }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Community", exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("link", {
        name: /Webhooks|Administrator testing|Message History/,
      }),
    ).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Add device" })).toHaveCount(
      0,
    );
    await page
      .getByRole("button", { name: /search/i })
      .first()
      .click();
    await page.getByRole("combobox").fill("sms");
    await expect(
      page.getByRole("option", {
        name: /Individual SMS|Bulk SMS|Message history/i,
      }),
    ).toHaveCount(0);
    await page.keyboard.press("Escape");
    await page.getByRole("link", { name: "Send group message" }).click();
    await expect(page.getByLabel("Group context")).toHaveValue("");
    await expect(
      page.getByRole("button", { name: "Send group message" }),
    ).toHaveCount(0);
    for (const path of [
      "/dashboard/messaging",
      "/dashboard/messaging/bulk",
      "/dashboard/messaging/history",
      "/dashboard/messaging/api-guide",
      "/dashboard/webhooks",
      "/dashboard/webhooks/deliveries",
    ]) {
      await page.goto(path);
      await expect(
        page.getByRole("heading", { name: "Access unavailable" }),
      ).toBeVisible();
    }
    await page.goto("/dashboard/community");
    await expect(page).toHaveURL(/\/dashboard$/);
  });
}

test("organization admins retain testing and webhooks without Community", async ({
  page,
  context,
}) => {
  await authenticate(context);
  await mockApi(page, { organizationContext: mockOrganizationContext });
  await page.goto("/dashboard");
  await expect(
    page.getByRole("link", { name: "Administrator testing", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Community", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("link", { name: "Administrator testing", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Administrator testing" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Individual SMS", exact: true }),
  ).toBeVisible();
  await page.goto("/dashboard/webhooks");
  await expect(
    page.getByRole("heading", { name: "Webhooks", exact: true }).first(),
  ).toBeVisible();
});
