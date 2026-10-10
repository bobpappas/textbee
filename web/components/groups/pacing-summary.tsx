"use client";
import { useQuery } from "@tanstack/react-query";
import httpBrowserClient from "@/lib/httpBrowserClient";
import type {
  GroupMessagePreview,
  GroupMessageSend,
  PacingEstimate,
} from "@/lib/api/types";

export function PacingSummary({ pacing }: { pacing?: PacingEstimate | null }) {
  if (!pacing) return null;
  const counts = pacing.counts || {};
  const queued = counts.QUEUED || 0;
  const problems =
    (counts.FAILED || 0) + (counts.EXCLUDED || 0) + (counts.UNRESOLVED || 0);
  const minutes = pacing.finishAt
    ? Math.max(
        1,
        Math.ceil(
          (Date.parse(pacing.finishAt) - Date.parse(pacing.generatedAt)) /
            60000,
        ),
      )
    : null;
  return (
    <div
      className="mt-3 space-y-1 text-sm [overflow-wrap:anywhere]"
      role="status"
    >
      {pacing.total !== undefined && (
        <p className="font-medium">
          {queued
            ? counts.HANDED_OFF
              ? "Sending gradually"
              : "Queued"
            : problems
              ? "Finished with issues"
              : "All messages handed off"}{" "}
          · {counts.HANDED_OFF || 0} of {pacing.total} handed off
          {problems ? ` · ${problems} need attention` : ""}
        </p>
      )}
      {pacing.waitingForGateway && (!pacing.total || queued > 0) ? (
        <p>
          Queued — waiting for gateway. Completion time is unavailable while the
          phone is offline or needs attention.
        </p>
      ) : (
        <>
          <p>
            {pacing.rate === -1
              ? "No per-minute pacing limit."
              : `Sends gradually at up to ${pacing.rate} SMS segments per minute.`}
          </p>
          {minutes !== null && (
            <p>
              Estimated sending completion: about {minutes} minute
              {minutes === 1 ? "" : "s"} ·{" "}
              {new Date(pacing.finishAt!).toLocaleTimeString([], {
                hour: "numeric",
                minute: "2-digit",
              })}
              .
            </p>
          )}
          {!pacing.capacityAvailable && queued > 0 && (
            <p>
              Paused — the current sending allowance cannot accommodate the
              queued work.
            </p>
          )}
        </>
      )}
      {Boolean(pacing.queuedAheadSegments) && (
        <p>
          Includes {pacing.queuedAheadSegments} segments already queued on this
          gateway.
        </p>
      )}
      <p className="text-muted-foreground">
        Estimated handoff for sending, not confirmed delivery. Phone
        connectivity and other queued work can change the estimate.
      </p>
    </div>
  );
}
export function SegmentGuidance({
  preview: p,
}: {
  preview: GroupMessagePreview;
}) {
  const a = p.textAdvice;
  return (
    <div className="my-3 space-y-2 text-sm [overflow-wrap:anywhere]">
      <p>
        {p.segmentsPerRecipient} SMS piece
        {p.segmentsPerRecipient === 1 ? "" : "s"} per person × {p.eligibleCount}{" "}
        people = {p.totalSegments} segments toward your sending limits.
      </p>
      <p className="text-muted-foreground">
        Phones usually display these pieces as one message. Your group prefix
        and full links count too.
      </p>
      {p.normalizationChanged && (
        <p>
          Formatting punctuation was simplified.
          {p.normalizationSavedSegments
            ? ` This saves ${p.normalizationSavedSegments} segments for this group.`
            : ""}
        </p>
      )}
      {a?.encoding === "Unicode" && (
        <p>
          This message uses Unicode, which fits less text in each SMS segment.
          Characters include:{" "}
          {a.unsupported
            .map((c) =>
              /^\s+$/u.test(c) || /[\u200b-\u200f]/u.test(c)
                ? `U+${c.codePointAt(0)!.toString(16).toUpperCase()}`
                : c,
            )
            .join(" ")}
          . Keep names and wording accurate; emoji are optional.
          {Boolean(a.unicodeSavings) &&
            ` Removing all unsupported characters outside links would save ${a.unicodeSavings} segments for this group. Only do this if it preserves your meaning.`}
        </p>
      )}
      {a && a.trimUnits > 0 && (
        <div>
          <p>
            To use one fewer segment per person, shorten by {a.trimUnits} SMS
            text units. That saves {a.saveOneSegmentTotal} segments for this
            group.
          </p>
          <p className="text-muted-foreground">
            Try removing repeated introductory wording or an unnecessary
            sign-off. Keep the group prefix. Omit unnecessary links rather than
            cutting characters out of a URL.
          </p>
        </div>
      )}
      <details>
        <summary className="cursor-pointer">How SMS segments work</summary>
        <p className="mt-2">
          Standard SMS supports 160 GSM-7 units in one segment, or 153 per
          segment for longer messages. Unicode supports 70 UTF-16 units, or 67
          per segment for longer messages. Some symbols use two units; a simple
          emoji often uses two and combined emoji can use more. One emoji can
          change the encoding of the entire message.
        </p>
      </details>
    </div>
  );
}
export function GroupSendProgress({
  organizationId,
  groupId,
  sendId,
}: {
  organizationId: string;
  groupId: string;
  sendId?: string;
}) {
  const query = useQuery({
    queryKey: [
      "organization",
      organizationId,
      "group-send-progress",
      groupId,
      sendId || "recent",
    ],
    queryFn: async () => {
      const response = await httpBrowserClient.get(
        `/organizations/${organizationId}/groups/${groupId}/messages${sendId ? `/${sendId}` : ""}`,
      );
      return (
        sendId ? [response.data.data] : response.data.data
      ) as GroupMessageSend[];
    },
    refetchInterval: 5000,
  });
  const sends = query.data?.filter((send) => send.pacing);
  if (query.isError)
    return (
      <p role="status" className="text-sm">
        Sending progress could not be refreshed. Your accepted messages remain
        queued.
      </p>
    );
  if (!sends?.length) return null;
  return (
    <section
      aria-label="Group sending progress"
      className="min-w-0 space-y-2 rounded-lg border p-3"
    >
      <h3 className="font-medium">Recent sending progress</h3>
      {sends.map((send) => (
        <details
          key={send.id}
          open={Boolean(sendId) || Boolean(send.pacing?.counts?.QUEUED)}
        >
          <summary className="cursor-pointer text-sm [overflow-wrap:anywhere]">
            {new Date(send.createdAt).toLocaleString()} ·{" "}
            {send.message.slice(0, 80)}
            {send.message.length > 80 ? "…" : ""}
          </summary>
          <PacingSummary pacing={send.pacing} />
        </details>
      ))}
    </section>
  );
}
