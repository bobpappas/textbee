"use client";
import { useCallback, useEffect, useState } from "react";
import { signOut, useSession } from "next-auth/react";
import Link from "next/link";
import { resolveBrowserApiBaseUrl } from "@/lib/api-base-url";
import { Button } from "@/components/ui/button";

export default function AccessRequestPage() {
  const { data: session } = useSession();
  const [state, setState] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const refresh = useCallback(async () => {
    if (!session?.user.accessToken) return;
    setLoading(true);
    setError("");
    try {
      const response = await fetch(
        `${resolveBrowserApiBaseUrl(process.env.NEXT_PUBLIC_API_BASE_URL)}/auth/access-requests/status`,
        {
          headers: { Authorization: `Bearer ${session.user.accessToken}` },
          cache: "no-store",
        },
      );
      if (!response.ok)
        throw new Error(
          response.status === 401
            ? "Your session expired. Sign out and sign in with Google again."
            : "Unable to check your request. Please try again shortly.",
        );
      setState((await response.json()).data.state);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [session?.user.accessToken]);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  const title =
    state === "APPROVED"
      ? "Your access is approved"
      : state === "REJECTED"
        ? "Access request declined"
        : state === "REVOKED"
          ? "Your access has been revoked"
          : "Awaiting administrator approval";
  return (
    <section className="mx-auto max-w-lg space-y-5 p-6 py-16">
      <h1 className="text-2xl font-bold">{title}</h1>
      <p>
        {state === "APPROVED"
          ? "Sign in with Google again to start using TextBee with your approved permissions."
          : state === "REJECTED" || state === "REVOKED"
            ? "Contact your administrator if you believe you should have access. Signing in again will not submit another request."
            : "Your request has been recorded. A platform administrator will review it and assign your organization and group access."}
      </p>
      {error && <p role="alert">{error}</p>}
      <div className="flex flex-wrap gap-3">
        {state === "APPROVED" ? (
          <Button asChild>
            <Link href="/login">Continue to TextBee</Link>
          </Button>
        ) : (
          <Button onClick={refresh} disabled={loading}>
            {loading ? "Checking…" : "Check status"}
          </Button>
        )}
        <Button
          variant="outline"
          onClick={() => signOut({ callbackUrl: "/login" })}
        >
          Sign out
        </Button>
      </div>
    </section>
  );
}
