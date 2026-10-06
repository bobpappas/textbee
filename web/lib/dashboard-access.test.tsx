import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useEffect } from "react";
import { mockOrganizationContext } from "@/test/fixtures";
import {
  visibleNavItems,
  visibleMobileNavItems,
} from "@/app/(app)/dashboard/(components)/nav-items";
import { visibleSearchEntries } from "@/app/(app)/dashboard/(components)/search/search-registry";
import { canAccessDashboardPath } from "./dashboard-access";
import type { ActiveOrganizationContext } from "@/lib/api/types";
import DashboardRouteAccess from "@/components/organizations/dashboard-route-access";

const state = vi.hoisted(() => ({ query: {} as any }));
vi.mock("@/components/organizations/organization-context-provider", () => ({
  useOrganizationContext: () => state.query,
  freshOrganizationContext: (q: any) =>
    q.isSuccess && !q.isFetching ? q.data : undefined,
}));
const admin: ActiveOrganizationContext = {
  ...mockOrganizationContext,
  capabilities: [...mockOrganizationContext.capabilities],
};
const operator: ActiveOrganizationContext = {
  ...admin,
  capabilities: ["groups:read", "group-messages:send"],
};
const restricted = [
  "/dashboard/messaging",
  "/dashboard/messaging/bulk",
  "/dashboard/messaging/history",
  "/dashboard/messaging/api-guide",
  "/dashboard/webhooks",
  "/dashboard/webhooks/deliveries",
];

describe("Group-first access boundaries", () => {
  it.each([
    "Group owner",
    "Group sender",
    "No grants",
    "Suspended",
    "Platform admin only",
  ])(
    "keeps administrator tools out of %s navigation, search, and direct routes",
    (role) => {
      const context: any =
        role === "Suspended"
          ? { state: "NO_ACCESS", capabilities: [] }
          : {
              ...operator,
              roleLabel: role,
              capabilities:
                role === "Group owner" || role === "Group sender"
                  ? operator.capabilities
                  : [],
            };
      const sessionRole = role === "Platform admin only" ? "ADMIN" : "REGULAR";
      const links = [
        ...visibleNavItems(sessionRole, context),
        ...visibleMobileNavItems(sessionRole, context),
        ...visibleSearchEntries(sessionRole, context),
      ];
      for (const path of restricted) {
        expect(canAccessDashboardPath(path, context)).toBe(false);
        expect(links.some((item) => item.href === path)).toBe(false);
      }
      expect(links.some((item) => item.href.includes("/community"))).toBe(
        false,
      );
      expect(links.some((item) => item.label === "Operator Access")).toBe(
        false,
      );
      expect(links.some((item) => item.label === "Organization profile")).toBe(
        false,
      );
    },
  );

  it("retains group workflows for operators and secondary testing tools for organization admins", () => {
    expect(
      visibleMobileNavItems("REGULAR", operator).map((x) => x.label),
    ).toContain("Group Messages");
    expect(
      visibleSearchEntries("REGULAR", operator).map((x) => x.label),
    ).toContain("Group Messages");
    expect(
      canAccessDashboardPath(
        "/dashboard/communications?compose=group",
        operator,
      ),
    ).toBe(true);
    for (const path of restricted)
      expect(canAccessDashboardPath(path, admin)).toBe(true);
    expect(visibleNavItems("REGULAR", admin).map((x) => x.label)).toContain(
      "Administrator testing",
    );
    expect(canAccessDashboardPath("/dashboard/community", admin)).toBe(false);
  });

  it.each(restricted)(
    "never mounts restricted children for an operator visiting %s",
    (path) => {
      const mounted = vi.fn();
      function Secret() {
        useEffect(mounted, []);
        return <p>Protected content</p>;
      }
      state.query = { isSuccess: true, isFetching: false, data: operator };
      render(
        <DashboardRouteAccess path={path}>
          <Secret />
        </DashboardRouteAccess>,
      );
      expect(screen.getByText("Access unavailable")).toBeInTheDocument();
      expect(mounted).not.toHaveBeenCalled();
      expect(screen.queryByText("Protected content")).not.toBeInTheDocument();
    },
  );

  it("unmounts protected children during refresh, failure, and permission revocation", () => {
    state.query = {
      isSuccess: true,
      isFetching: false,
      data: mockOrganizationContext,
    };
    const view = () => (
      <DashboardRouteAccess path="/dashboard/messaging">
        <p>Protected content</p>
      </DashboardRouteAccess>
    );
    const { rerender } = render(view());
    expect(screen.getByText("Protected content")).toBeInTheDocument();
    state.query.isFetching = true;
    rerender(view());
    expect(screen.queryByText("Protected content")).not.toBeInTheDocument();
    state.query = {
      isSuccess: false,
      isFetching: false,
      data: mockOrganizationContext,
    };
    rerender(view());
    expect(screen.queryByText("Protected content")).not.toBeInTheDocument();
    state.query = { isSuccess: true, isFetching: false, data: operator };
    rerender(view());
    expect(screen.getByText("Access unavailable")).toBeInTheDocument();
  });
});
