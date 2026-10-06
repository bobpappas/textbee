import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { waitFor } from "@testing-library/react";
import OrganizationContextProvider from "@/components/organizations/organization-context-provider";
import { ApiEndpoints } from "@/config/api";
import { API_BASE_URL, mockOrganizationContext } from "@/test/fixtures";
import { server } from "@/test/msw/server";
import { renderWithProviders, screen } from "@/test/render";
import DashboardPage from "./page";

describe("Group-first dashboard", () => {
  it("gives operators a group action without mounting administrator tools or fetching their data", async () => {
    const requests: string[] = [];
    const observe = ({ request }: { request: Request }) =>
      requests.push(new URL(request.url).pathname);
    server.events.on("request:start", observe);
    try {
      server.use(
        http.get(
          `${API_BASE_URL}${ApiEndpoints.organizations.currentContext()}`,
          () =>
            HttpResponse.json({
              data: {
                ...mockOrganizationContext,
                capabilities: ["groups:read", "group-messages:send"],
                roleLabel: "Group owner",
              },
            }),
        ),
      );
      renderWithProviders(
        <OrganizationContextProvider enabled>
          <DashboardPage />
        </OrganizationContextProvider>,
      );
      expect(
        await screen.findByRole("link", { name: "Send group message" }),
      ).toHaveAttribute("href", "/dashboard/communications?compose=group");
      expect(
        screen.queryByRole("button", { name: "Add device" }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "New API key" }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("link", { name: /Webhooks/ }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("link", { name: "Send SMS" }),
      ).not.toBeInTheDocument();
      await waitFor(() => expect(requests).toHaveLength(1));
      expect(requests[0]).toContain("organizations/current-context");
    } finally {
      server.events.removeListener("request:start", observe);
    }
  });
});
