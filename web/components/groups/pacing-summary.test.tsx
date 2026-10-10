import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PacingSummary, SegmentGuidance } from "./pacing-summary";
const pacing = {
  generatedAt: "2026-10-10T18:00:00Z",
  rate: 10,
  waitingForGateway: false,
  startAt: "2026-10-10T18:00:00Z",
  finishAt: "2026-10-10T18:01:36Z",
  capacityAvailable: true,
  queuedAheadSegments: 18,
};
describe("B060 preview explains paced sending", () => {
  it("shows rounded completion including existing backlog and distinguishes delivery", () => {
    render(<PacingSummary pacing={pacing} />);
    expect(screen.getByText(/about 2 minutes/)).toBeInTheDocument();
    expect(screen.getByText(/18 segments already queued/)).toBeInTheDocument();
    expect(screen.getByText(/not confirmed delivery/)).toBeInTheDocument();
  });
  it("does not promise an ETA while offline", () => {
    render(
      <PacingSummary
        pacing={{ ...pacing, waitingForGateway: true, finishAt: null }}
      />,
    );
    expect(screen.getByText(/waiting for gateway/)).toBeInTheDocument();
    expect(screen.queryByText(/about 2 minutes/)).not.toBeInTheDocument();
  });
  it("does not call unresolved handoffs successful", () => {
    render(
      <PacingSummary
        pacing={{
          ...pacing,
          total: 6,
          counts: { HANDED_OFF: 5, UNRESOLVED: 1 },
        }}
      />,
    );
    expect(screen.getByText(/Finished with issues/)).toBeInTheDocument();
  });
  it("explains actual audience segment cost and Unicode", () => {
    render(
      <SegmentGuidance
        preview={
          {
            segmentsPerRecipient: 3,
            eligibleCount: 6,
            totalSegments: 18,
            normalizationChanged: true,
            normalizationSavedSegments: 6,
            textAdvice: {
              encoding: "Unicode",
              unsupported: ["😊"],
              trimUnits: 4,
              saveOneSegmentTotal: 6,
            },
          } as any
        }
      />,
    );
    expect(
      screen.getByText(/3 SMS pieces per person × 6 people = 18/),
    ).toBeInTheDocument();
    expect(screen.getByText(/shorten by 4 SMS text units/)).toBeInTheDocument();
    expect(screen.getByText(/This message uses Unicode/)).toBeInTheDocument();
    expect(
      screen.getByText(/Formatting punctuation was simplified/),
    ).toBeInTheDocument();
  });
  it("does not warn about shortening a one segment message", () => {
    render(
      <SegmentGuidance
        preview={
          {
            segmentsPerRecipient: 1,
            eligibleCount: 6,
            totalSegments: 6,
            textAdvice: {
              encoding: "GSM-7",
              unsupported: [],
              trimUnits: 0,
              saveOneSegmentTotal: 0,
            },
          } as any
        }
      />,
    );
    expect(screen.queryByText(/shorten by/)).not.toBeInTheDocument();
  });
});
