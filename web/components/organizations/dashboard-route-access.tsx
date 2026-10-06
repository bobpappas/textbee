"use client";

import { redirect } from 'next/navigation'
import type { PropsWithChildren } from "react";
import { canAccessDashboardPath } from "@/lib/dashboard-access";
import {
  freshOrganizationContext,
  useOrganizationContext,
} from "./organization-context-provider";

export default function DashboardRouteAccess({
  path,
  children,
}: PropsWithChildren<{ path: string }>) {
  const query = useOrganizationContext();
  const context = freshOrganizationContext(query)
  if (path === '/dashboard/community') redirect('/dashboard');
  if (!context) return <p role="status">Checking organization access…</p>;
  if (!canAccessDashboardPath(path, context)) {
    return (
      <section className="p-6">
        <h1 className="text-xl font-semibold">Access unavailable</h1>
        <p>Your organization permissions do not allow this page.</p>
      </section>
    );
  }
  return <>{children}</>;
}
