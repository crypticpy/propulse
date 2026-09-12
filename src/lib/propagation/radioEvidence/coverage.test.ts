/**
 * Coverage and gap handling (#1047, plan tests 1-5).
 *
 * Coverage answers one question: was the receiving field heard from at all on
 * a readable band-hour? It is deliberately not a question about our pair, and
 * it is never allowed to become a statement that the path was closed.
 */

import { describe, expect, it } from "vitest";
import {
  alignedWindow,
  InvalidObservedWindowError,
  candidateHourStarts,
  DEFAULT_OBSERVED_WINDOW_SECONDS,
  resolveCoverage,
  unreadableSpans,
} from "@/lib/propagation/radioEvidence/coverage";
import type {
  PathCoverageRow,
  ReadableBandHourRow,
} from "@/lib/propagation/radioEvidence/types";

const ISSUED_AT = "2026-09-11T18:00:00Z";

/** The six whole hours a default window holds when issued on the hour. */
const WINDOW_HOURS = [
  "2026-09-11T12:00:00.000Z",
  "2026-09-11T13:00:00.000Z",
  "2026-09-11T14:00:00.000Z",
  "2026-09-11T15:00:00.000Z",
  "2026-09-11T16:00:00.000Z",
  "2026-09-11T17:00:00.000Z",
];

function readable(hours: readonly string[]): ReadableBandHourRow[] {
  return hours.map((hour_utc) => ({ hour_utc }));
}

function coverageRow(
  hour_utc: string,
  txField: string,
  uniqueRx: number,
): PathCoverageRow {
  return {
    hour_utc,
    mode_class: "digital",
    tx_field: txField,
    unique_rx: uniqueRx,
  };
}

describe("coverage", () => {
  it("covers the rx field from another tx field's row (test 1)", () => {
    // Our own pair has no row at all in this window; somebody else was heard
    // at the same receiving field, which is what coverage is about.
    const verdict = resolveCoverage({
      issuedAt: ISSUED_AT,
      windowSeconds: DEFAULT_OBSERVED_WINDOW_SECONDS,
      readableHours: readable(WINDOW_HOURS),
      coverageRows: [coverageRow(WINDOW_HOURS[2], "IO", 3)],
    });

    expect(verdict.kind).toBe("covered");
    if (verdict.kind !== "covered") return;
    expect(verdict.coveredHourStarts).toEqual([WINDOW_HOURS[2]]);
    expect(verdict.latestCoveredHourEnd).toBe("2026-09-11T15:00:00.000Z");
  });

  it("does not cover a field whose rows all report zero receivers (test 2)", () => {
    const verdict = resolveCoverage({
      issuedAt: ISSUED_AT,
      windowSeconds: DEFAULT_OBSERVED_WINDOW_SECONDS,
      readableHours: readable(WINDOW_HOURS),
      coverageRows: [
        coverageRow(WINDOW_HOURS[1], "IO", 0),
        coverageRow(WINDOW_HOURS[4], "JN", 0),
      ],
    });

    expect(verdict.kind).toBe("unknown");
    if (verdict.kind !== "unknown") return;
    expect(verdict.reason).toBe("no_receiver_coverage");
  });
});

describe("gap handling", () => {
  it("names the aggregate gap, not the receiver, when no hour is readable (test 3)", () => {
    // Coverage rows exist for every hour, so a reason of "nobody listening"
    // would be a lie: the gap ledger removed the hours the verdict rests on.
    const verdict = resolveCoverage({
      issuedAt: ISSUED_AT,
      windowSeconds: DEFAULT_OBSERVED_WINDOW_SECONDS,
      readableHours: [],
      coverageRows: WINDOW_HOURS.map((hour) => coverageRow(hour, "IO", 5)),
    });

    expect(verdict.kind).toBe("unknown");
    if (verdict.kind !== "unknown") return;
    expect(verdict.reason).toBe("aggregate_hour_not_readable");
    expect(verdict.span.readableHourStarts).toEqual([]);
    expect(verdict.span.unreadableHourStarts).toEqual(WINDOW_HOURS);
    expect(verdict.span.latestReadableHourEnd).toBeNull();
  });

  it("uses only readable hours for coverage and reports the gap span (test 4)", () => {
    const readableHours = [WINDOW_HOURS[0], WINDOW_HOURS[1]];
    const verdict = resolveCoverage({
      issuedAt: ISSUED_AT,
      windowSeconds: DEFAULT_OBSERVED_WINDOW_SECONDS,
      readableHours: readable(readableHours),
      // The only hour with a listening receiver is one the ledger removed.
      coverageRows: [coverageRow(WINDOW_HOURS[5], "IO", 4)],
    });

    expect(verdict.kind).toBe("unknown");
    if (verdict.kind !== "unknown") return;
    expect(verdict.reason).toBe("no_receiver_coverage");
    expect(verdict.span.readableHourStarts).toEqual(readableHours);
    expect(verdict.span.unreadableHourStarts).toEqual(WINDOW_HOURS.slice(2));
    expect(verdict.span.latestReadableHourEnd).toBe("2026-09-11T14:00:00.000Z");
  });

  it("refuses a window that cannot be built from whole hours (test 5)", () => {
    // Formerly this returned window_not_aggregated. A window of 90 minutes is
    // not a short answer, it is an unanswerable question: aligned to hours it
    // would claim 16:30 while only 17:00 was ever examined. Rejecting it at
    // the boundary beats reporting a span nobody read.
    expect(() =>
      resolveCoverage({
        issuedAt: "2026-09-11T18:30:00Z",
        windowSeconds: 5400,
        readableHours: readable(WINDOW_HOURS),
        coverageRows: [coverageRow(WINDOW_HOURS[5], "IO", 9)],
      }),
    ).toThrow(InvalidObservedWindowError);
  });

  it("accepts the offset spelling PostgREST returns for an hour", () => {
    const verdict = resolveCoverage({
      issuedAt: ISSUED_AT,
      windowSeconds: DEFAULT_OBSERVED_WINDOW_SECONDS,
      readableHours: [{ hour_utc: "2026-09-11T16:00:00+00:00" }],
      coverageRows: [coverageRow("2026-09-11T16:00:00+00:00", "IO", 2)],
    });

    expect(verdict.kind).toBe("covered");
  });
  it("counts a receiver as listening only in the requested modes", () => {
    // A digital-only receiver proves nothing about a CW request: the operator
    // asked whether anyone was listening for CW, and nobody was. Treating the
    // digital row as coverage would turn that into "heard nothing on CW",
    // which is the closure claim by another route.
    const verdict = resolveCoverage({
      issuedAt: ISSUED_AT,
      windowSeconds: DEFAULT_OBSERVED_WINDOW_SECONDS,
      readableHours: readable(WINDOW_HOURS),
      coverageRows: [coverageRow(WINDOW_HOURS[3], "JN", 4)],
      modeClasses: ["cw"],
    });

    expect(verdict.kind).toBe("unknown");
    if (verdict.kind !== "unknown") return;
    expect(verdict.reason).toBe("no_receiver_coverage");
  });

  it("covers the request when a row is in the requested mode set", () => {
    const verdict = resolveCoverage({
      issuedAt: ISSUED_AT,
      windowSeconds: DEFAULT_OBSERVED_WINDOW_SECONDS,
      readableHours: readable(WINDOW_HOURS),
      coverageRows: [coverageRow(WINDOW_HOURS[3], "JN", 4)],
      modeClasses: ["cw", "digital"],
    });

    expect(verdict.kind).toBe("covered");
  });

  it("names the unreadable hours as spans, not just a count", () => {
    // A consumer that must decide whether a count is exact needs to know
    // which hours are missing, not how many.
    const verdict = resolveCoverage({
      issuedAt: ISSUED_AT,
      windowSeconds: DEFAULT_OBSERVED_WINDOW_SECONDS,
      readableHours: readable([
        WINDOW_HOURS[0],
        WINDOW_HOURS[1],
        WINDOW_HOURS[4],
        WINDOW_HOURS[5],
      ]),
      coverageRows: [coverageRow(WINDOW_HOURS[5], "JN", 4)],
    });

    expect(verdict.kind).toBe("covered");
    expect(verdict.span.unreadableHourStarts).toEqual([
      WINDOW_HOURS[2],
      WINDOW_HOURS[3],
    ]);
    expect(unreadableSpans(verdict.span)).toEqual([
      { startAt: WINDOW_HOURS[2], endAt: "2026-09-11T16:00:00.000Z" },
    ]);
  });

  it("merges only contiguous gaps into one span", () => {
    const verdict = resolveCoverage({
      issuedAt: ISSUED_AT,
      windowSeconds: DEFAULT_OBSERVED_WINDOW_SECONDS,
      readableHours: readable([
        WINDOW_HOURS[1],
        WINDOW_HOURS[3],
        WINDOW_HOURS[4],
      ]),
      coverageRows: [coverageRow(WINDOW_HOURS[4], "JN", 4)],
    });

    expect(unreadableSpans(verdict.span)).toEqual([
      { startAt: WINDOW_HOURS[0], endAt: WINDOW_HOURS[1] },
      { startAt: WINDOW_HOURS[2], endAt: WINDOW_HOURS[3] },
      { startAt: WINDOW_HOURS[5], endAt: "2026-09-11T18:00:00.000Z" },
    ]);
  });
});

describe("window alignment", () => {
  it("aligns a mid-hour issuance to whole aggregation hours", () => {
    // 18:30 minus six hours is 12:30, and neither 12:00-13:00 nor
    // 18:00-19:00 can be spoken for: the first is half outside the request
    // and the second has not been written. Answering over 12:00 to 18:00 is
    // the only span the aggregates can actually cover.
    expect(alignedWindow("2026-09-11T18:30:00Z", 6 * 3600)).toEqual({
      startAt: "2026-09-11T12:00:00.000Z",
      endAt: "2026-09-11T18:00:00.000Z",
    });
  });

  it("leaves an hour-aligned issuance alone", () => {
    expect(alignedWindow(ISSUED_AT, 6 * 3600)).toEqual({
      startAt: "2026-09-11T12:00:00.000Z",
      endAt: "2026-09-11T18:00:00.000Z",
    });
  });

  it("asks about every hour of the aligned window, not the interior", () => {
    // The old loop read the complete hours strictly inside 12:30 to 18:30 and
    // found five, then let the record claim it had covered six.
    expect(candidateHourStarts("2026-09-11T18:30:00Z", 6 * 3600)).toEqual(
      WINDOW_HOURS,
    );
    expect(candidateHourStarts(ISSUED_AT, 6 * 3600)).toEqual(WINDOW_HOURS);
  });

  it("rejects a window that is not a whole number of hours", () => {
    for (const seconds of [5400, 1800, 0, -3600, 3599]) {
      expect(() => candidateHourStarts(ISSUED_AT, seconds)).toThrow(
        InvalidObservedWindowError,
      );
    }
  });

  it("accepts one hour and the six-hour default", () => {
    expect(() => alignedWindow(ISSUED_AT, 3600)).not.toThrow();
    expect(() => alignedWindow(ISSUED_AT, 21_600)).not.toThrow();
    expect(candidateHourStarts(ISSUED_AT, 3600)).toEqual([WINDOW_HOURS[5]]);
    expect(DEFAULT_OBSERVED_WINDOW_SECONDS % 3600).toBe(0);
  });

  it("names the window in the error it throws", () => {
    expect(() => alignedWindow(ISSUED_AT, 5400)).toThrow(/5400/);
  });
});

describe("coverage must hold for every hour, not for one", () => {
  it("refuses to call one listening hour a covered window", () => {
    // A receiver present at 15:00 says nothing about 12:00 or 17:00. Reading
    // the window as covered turns five unwatched hours into observed silence,
    // which is the closure claim wearing a zero.
    const verdict = resolveCoverage({
      issuedAt: ISSUED_AT,
      windowSeconds: DEFAULT_OBSERVED_WINDOW_SECONDS,
      readableHours: readable(WINDOW_HOURS),
      coverageRows: [coverageRow(WINDOW_HOURS[3], "JN", 4)],
    });

    expect(verdict.kind).toBe("covered");
    if (verdict.kind !== "covered") return;
    expect(verdict.coveredHourStarts).toEqual([WINDOW_HOURS[3]]);
    expect(verdict.windowFullyCovered).toBe(false);
  });

  it("calls a window covered when every hour had a listener", () => {
    const verdict = resolveCoverage({
      issuedAt: ISSUED_AT,
      windowSeconds: DEFAULT_OBSERVED_WINDOW_SECONDS,
      readableHours: readable(WINDOW_HOURS),
      coverageRows: WINDOW_HOURS.map((hour) => coverageRow(hour, "JN", 2)),
    });

    expect(verdict.kind === "covered" && verdict.windowFullyCovered).toBe(true);
  });
});
