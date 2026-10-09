import { expect, test } from "@playwright/test";
import { encode } from "next-auth/jwt";
import { TEST_AUTH_SECRET } from "../playwright.config";
import { authenticate } from "./session";
import { mockApi } from "./mock-api";

async function applicant(context: any) {
  const value = await encode({
    token: {
      id: "request:synthetic",
      admission: "onboarding",
      accessToken: "onboarding-test-token",
    },
    secret: TEST_AUTH_SECRET,
  });
  await context.addCookies([
    {
      name: "next-auth.session-token",
      value,
      domain: "localhost",
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
}
for (const state of ["PENDING", "REJECTED", "REVOKED"]) {
  test(`applicant ${state} stays outside the dashboard`, async ({
    page,
    context,
  }) => {
    await applicant(context);
    const calls: string[] = [];
    await page.route("**/api/v1/**", async (route) => {
      calls.push(new URL(route.request().url()).pathname);
      await route.fulfill({ json: { data: { state } } });
    });
    await page.goto("/dashboard/admin/access-requests");
    await expect(page).toHaveURL(/\/access-request$/);
    await expect(
      page.getByRole("heading", {
        name:
          state === "PENDING"
            ? "Awaiting administrator approval"
            : state === "REJECTED"
              ? "Access request declined"
              : "Your access has been revoked",
      }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
    expect(
      calls.every((path) => path === "/api/v1/auth/access-requests/status"),
    ).toBe(true);
  });
}
test("approved applicant refreshes status and can reauthenticate", async ({
  page,
  context,
}) => {
  await applicant(context);
  let state = "PENDING";
  await page.route("**/api/v1/auth/access-requests/status", (route) =>
    route.fulfill({ json: { data: { state } } }),
  );
  await page.goto("/access-request");
  await expect(
    page.getByRole("heading", { name: "Awaiting administrator approval" }),
  ).toBeVisible();
  state = "APPROVED";
  await page.getByRole("button", { name: "Check status" }).click();
  await page.getByRole("link", { name: "Continue to TextBee" }).click();
  await expect(page).toHaveURL(/\/login$/);
});
test("organization administrator cannot open the platform approval page", async ({
  page,
  context,
}) => {
  await authenticate(context, "REGULAR");
  await mockApi(page);
  await page.goto("/dashboard/admin/access-requests");
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(
    page.getByRole("link", { name: "Access requests", exact: true }),
  ).toHaveCount(0);
});
test("platform admin explicitly selects grants and confirms approval on mobile", async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await authenticate(context, "ADMIN");
  await mockApi(page);
  let state = "PENDING";
  let submitted: any;
  await page.route("**/api/v1/auth/access-requests**", async (route) => {
    const url = new URL(route.request().url());
    let data: any;
    if (url.pathname.endsWith("/decision")) {
      submitted = route.request().postDataJSON();
      state = "APPROVED";
      data = { state, version: 1 };
    } else if (url.pathname.endsWith("/options")) {
      data = url.searchParams.has("organizationId")
        ? [{ _id: "64b7c42f18f0c31f8c9fd202", displayName: "Synthetic Group" }]
        : [
            {
              _id: "64b7c42f18f0c31f8c9fd201",
              displayName: "Synthetic Organization",
            },
          ];
    } else
      data = {
        items: [
          {
            id: "64b7c42f18f0c31f8c9fd203",
            name: "Synthetic Applicant",
            email: "applicant@example.test",
            state,
            version: state === "PENDING" ? 0 : 1,
            createdAt: "2026-10-09T12:00:00Z",
          },
        ],
        hasMore: false,
      };
    await route.fulfill({ json: { data } });
  });
  await page.goto("/dashboard/admin/access-requests");
  await page.getByRole("button", { name: "Review approval" }).click();
  await expect(
    page.getByRole("button", { name: "Review decision" }),
  ).toBeDisabled();
  await page
    .getByLabel("Organization", { exact: true })
    .selectOption("64b7c42f18f0c31f8c9fd201");
  await page.getByLabel("Synthetic Group").selectOption("owner");
  await page.getByLabel("Administrative reason").fill("Synthetic acceptance");
  await page.getByRole("button", { name: "Review decision" }).click();
  await expect(page.getByText("Synthetic Group: group owner")).toBeVisible();
  expect(submitted).toBeUndefined();
  await page.getByRole("button", { name: "Confirm decision" }).click();
  await expect(
    page.getByRole("button", { name: "Revoke access" }),
  ).toBeVisible();
  expect(submitted).toEqual({
    action: "approve",
    version: 0,
    reason: "Synthetic acceptance",
    organizationId: "64b7c42f18f0c31f8c9fd201",
    groups: [{ groupId: "64b7c42f18f0c31f8c9fd202", role: "owner" }],
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
