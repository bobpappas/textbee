"use client";
import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { resolveBrowserApiBaseUrl } from "@/lib/api-base-url";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

type AccessRequest = {
  id: string;
  name: string;
  email: string;
  state: string;
  version: number;
  createdAt: string;
};
type Option = { _id: string; displayName: string };
export default function AccessRequests() {
  const { data: session } = useSession();
  const [items, setItems] = useState<AccessRequest[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<AccessRequest | null>(null);
  const [action, setAction] = useState("approve");
  const [organizations, setOrganizations] = useState<Option[]>([]);
  const [organizationId, setOrganizationId] = useState("");
  const [groups, setGroups] = useState<Option[]>([]);
  const [roles, setRoles] = useState<Record<string, string>>({});
  const [reason, setReason] = useState("");
  const [reviewing, setReviewing] = useState(false);
  const [busy, setBusy] = useState(false);
  const api = useCallback(
    async (path: string, body?: unknown) => {
      const response = await fetch(
        `${resolveBrowserApiBaseUrl(process.env.NEXT_PUBLIC_API_BASE_URL)}/auth/access-requests${path}`,
        {
          method: body ? "POST" : "GET",
          headers: {
            Authorization: `Bearer ${session?.user.accessToken}`,
            "Content-Type": "application/json",
          },
          ...(body ? { body: JSON.stringify(body) } : {}),
          cache: "no-store",
        },
      );
      const result = await response.json();
      if (!response.ok)
        throw new Error(
          result.message ||
            result.error ||
            "Request failed. Refresh and try again.",
        );
      return result.data;
    },
    [session?.user.accessToken],
  );
  const refresh = useCallback(async () => {
    if (session?.user.role !== "ADMIN") return;
    setLoading(true);
    setError("");
    try {
      const result = await api(`?page=${page}`);
      setItems(result.items);
      setHasMore(result.hasMore);
    } catch (e) {
      setError((e as Error).message);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [api, page, session?.user.role]);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  useEffect(() => {
    if (session?.user.role !== "ADMIN") return;
    let current = true;
    api("/options")
      .then((data) => {
        if (current) setOrganizations(data);
      })
      .catch(() => {
        if (current) setError("Unable to load organizations.");
      });
    return () => {
      current = false;
    };
  }, [api, session?.user.role]);
  useEffect(() => {
    setGroups([]);
    setRoles({});
    if (!organizationId) return;
    let current = true;
    api(`/options?organizationId=${organizationId}`)
      .then((data) => {
        if (current) setGroups(data);
      })
      .catch(() => {
        if (current)
          setError("Unable to load groups. Choose the organization again.");
      });
    return () => {
      current = false;
    };
  }, [api, organizationId]);
  const open = (request: AccessRequest, next: string) => {
    setSelected(request);
    setAction(next);
    setOrganizationId("");
    setGroups([]);
    setRoles({});
    setReason("");
    setReviewing(false);
    setError("");
  };
  const decide = async () => {
    if (!selected || busy) return;
    setBusy(true);
    setError("");
    try {
      await api(`/${selected.id}/decision`, {
        action,
        version: selected.version,
        reason,
        ...(action === "approve"
          ? {
              organizationId,
              groups: Object.entries(roles)
                .filter(([, role]) => role)
                .map(([groupId, role]) => ({ groupId, role })),
            }
          : {}),
      });
      setSelected(null);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  if (session?.user.role !== "ADMIN")
    return <p>Platform administrator access required.</p>;
  return (
    <section className="space-y-5 p-6">
      <h1 className="text-3xl font-bold">Access requests</h1>
      <p>
        Approve Google sign-in requests and choose organization and group
        access. Platform administrator access is never granted here.
      </p>
      {!selected && error && (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      )}
      <Button variant="outline" onClick={refresh} disabled={loading}>
        Refresh
      </Button>
      {loading ? (
        <p role="status">Loading requests…</p>
      ) : !items.length ? (
        <p>No access requests.</p>
      ) : (
        items.map((item) => (
          <article key={item.id} className="space-y-3 rounded-lg border p-4">
            <h2 className="font-semibold">{item.name}</h2>
            <p className="break-all">{item.email}</p>
            <p>
              {item.state} · Requested{" "}
              {new Date(item.createdAt).toLocaleDateString()}
            </p>
            <div className="flex flex-wrap gap-2">
              {["PENDING", "REVOKED"].includes(item.state) && (
                <Button onClick={() => open(item, "approve")}>
                  {item.state === "REVOKED"
                    ? "Review reapproval"
                    : "Review approval"}
                </Button>
              )}
              {item.state === "PENDING" && (
                <Button variant="outline" onClick={() => open(item, "reject")}>
                  Reject
                </Button>
              )}
              {item.state === "REJECTED" && (
                <Button
                  variant="outline"
                  onClick={() => open(item, "reconsider")}
                >
                  Reconsider
                </Button>
              )}
              {item.state === "APPROVED" && (
                <Button variant="outline" onClick={() => open(item, "revoke")}>
                  Revoke access
                </Button>
              )}
            </div>
          </article>
        ))
      )}
      <div className="flex gap-3">
        <Button
          variant="outline"
          disabled={page === 1 || loading}
          onClick={() => setPage(page - 1)}
        >
          Previous
        </Button>
        <span>Page {page}</span>
        <Button
          variant="outline"
          disabled={!hasMore || loading}
          onClick={() => setPage(page + 1)}
        >
          Next
        </Button>
      </div>
      <Dialog
        open={Boolean(selected)}
        onOpenChange={(value) => {
          if (!value && !busy) setSelected(null);
        }}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {reviewing ? "Confirm access decision" : "Review access request"}
            </DialogTitle>
            <DialogDescription>{selected?.email}</DialogDescription>
          </DialogHeader>
          {error && (
            <p role="alert" className="text-destructive">
              {error}
            </p>
          )}
          {reviewing ? (
            <div className="space-y-3">
              <p>Action: {action}</p>
              {action === "approve" && (
                <>
                  <p>
                    Organization:{" "}
                    {
                      organizations.find((o) => o._id === organizationId)
                        ?.displayName
                    }
                  </p>
                  <ul>
                    {groups
                      .filter((g) => roles[g._id])
                      .map((g) => (
                        <li key={g._id}>
                          {g.displayName}: group {roles[g._id]}
                        </li>
                      ))}
                  </ul>
                  {!Object.values(roles).some(Boolean) && (
                    <p>No group permissions will be granted.</p>
                  )}
                  <p>
                    Platform role: Regular. No organization-administrator role.
                  </p>
                </>
              )}
              {action === "revoke" && (
                <p>
                  All organization memberships and group roles will be revoked.
                  Existing application sessions will stop working.
                </p>
              )}
              <p>Reason: {reason}</p>
              <div className="flex gap-2">
                <Button disabled={busy} onClick={decide}>
                  {busy ? "Saving…" : "Confirm decision"}
                </Button>
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() => setReviewing(false)}
                >
                  Back
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {action === "approve" && (
                <>
                  <Label htmlFor="admission-organization">Organization</Label>
                  <NativeSelect
                    id="admission-organization"
                    value={organizationId}
                    onChange={(e) => setOrganizationId(e.target.value)}
                  >
                    <option value="">Select organization</option>
                    {organizations.map((o) => (
                      <option key={o._id} value={o._id}>
                        {o.displayName}
                      </option>
                    ))}
                  </NativeSelect>
                  <p>
                    Choose group permissions. Group owners can also send
                    messages.
                  </p>
                  {groups.map((g) => (
                    <div key={g._id}>
                      <Label htmlFor={`group-${g._id}`}>{g.displayName}</Label>
                      <NativeSelect
                        id={`group-${g._id}`}
                        value={roles[g._id] || ""}
                        onChange={(e) =>
                          setRoles({ ...roles, [g._id]: e.target.value })
                        }
                      >
                        <option value="">No access</option>
                        <option value="sender">Group sender</option>
                        <option value="owner">Group owner</option>
                      </NativeSelect>
                    </div>
                  ))}
                </>
              )}
              <Label htmlFor="admission-reason">Administrative reason</Label>
              <Input
                id="admission-reason"
                value={reason}
                maxLength={500}
                onChange={(e) => setReason(e.target.value)}
              />
              <Button
                disabled={
                  !reason.trim() || (action === "approve" && !organizationId)
                }
                onClick={() => setReviewing(true)}
              >
                Review decision
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
