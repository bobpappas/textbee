import {
  GROUP_MESSAGES_SEND,
  MESSAGES_READ,
  MESSAGES_SEND,
  WEBHOOKS_READ,
  type OrganizationCapability,
  type OrganizationContext,
} from "@/lib/api/types";

export function hasCapability(
  context: OrganizationContext | undefined,
  capability: OrganizationCapability,
) {
  return (
    context?.state === "ACTIVE" && context.capabilities.includes(capability)
  );
}

// Shared by navigation, command search, and the direct-route boundary.
export function canAccessDashboardPath(
  path: string,
  context?: OrganizationContext,
) {
  const pathname = path.split(/[?#]/)[0];
  const within = (base: string) =>
    pathname === base || pathname.startsWith(`${base}/`);
  if (within("/dashboard/community")) return false;
  if (within("/dashboard/messaging")) {
    return (
      hasCapability(context, MESSAGES_SEND) &&
      hasCapability(context, MESSAGES_READ)
    );
  }
  if (within("/dashboard/webhooks"))
    return hasCapability(context, WEBHOOKS_READ);
  if (within("/dashboard/communications"))
    return hasCapability(context, GROUP_MESSAGES_SEND);
  return true;
}
