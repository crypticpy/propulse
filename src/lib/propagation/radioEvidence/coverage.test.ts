/**
 * Coverage and gap handling (#1047, plan tests 1-5).
 *
 * Coverage answers one question: was the receiving field heard from at all on
 * a readable band-hour? It is deliberately not a question about our pair, and
 * it is never allowed to become a statement that the path was closed.
 */

import { describe, expect, it } from "vitest";
import {
  DEFAULT_OBSERVED_WINDOW_SECONDS,
  resolveCoverage,
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

  it("reports a window that holds no complete hour yet (test 5)", () => {
    const verdict = resolveCoverage({
      issuedAt: "2026-09-11T18:30:00Z",
      windowSeconds: 1800,
      readableHours: readable(WINDOW_HOURS),
      coverageRows: [coverageRow(WINDOW_HOURS[5], "IO", 9)],
    });

    expect(verdict.kind).toBe("unknown");
    if (verdict.kind !== "unknown") return;
    expect(verdict.reason).toBe("window_not_aggregated");
    expect(verdict.span.candidateHourStarts).toEqual([]);
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
});
