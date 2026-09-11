/**
 * Path activity records (#1047, plan tests 6-14).
 *
 * The load-bearing assertions here are the ones that keep "we heard nothing"
 * separate from "nobody was listening", and keep a zero out of the second
 * case entirely. Every case supplies `issuedAt`; no test installs a fake
 * timer, because the derivation never reads a clock.
 */

import { describe, expect, it } from "vitest";
import { derivePathActivity } from "@/lib/propagation/radioEvidence/activityRecord";
import { DEFAULT_OBSERVED_WINDOW_SECONDS } from "@/lib/propagation/radioEvidence/coverage";
import type {
  ModeClass,
  PathActivityPairRow,
  PathActivityRecord,
  PathCoverageRow,
  RadioEvidenceInputs,
  ReadableBandHourRow,
} from "@/lib/propagation/radioEvidence/types";

const ISSUED_AT = "2026-09-11T18:00:00Z";

const WINDOW_HOURS = [
  "2026-09-11T12:00:00.000Z",
  "2026-09-11T13:00:00.000Z",
  "2026-09-11T14:00:00.000Z",
  "2026-09-11T15:00:00.000Z",
  "2026-09-11T16:00:00.000Z",
  "2026-09-11T17:00:00.000Z",
];

function readable(
  hours: readonly string[] = WINDOW_HOURS,
): ReadableBandHourRow[] {
  return hours.map((hour_utc) => ({ hour_utc }));
}

function pairRow(
  overrides: Partial<PathActivityPairRow> & { hour_utc: string },
): PathActivityPairRow {
  return {
    mode_class: "digital",
    tx_field: "FN",
    rx_field: "IO",
    spot_count: 4,
    unique_tx: 1,
    unique_rx: 2,
    backfilled_count: 0,
    ...overrides,
  };
}

/** A coverage row derived from a pair row, as the real query would return. */
function coverageOf(row: PathActivityPairRow): PathCoverageRow {
  return {
    hour_utc: row.hour_utc,
    mode_class: row.mode_class,
    tx_field: row.tx_field,
    unique_rx: row.unique_rx,
  };
}

function derive(
  overrides: Partial<RadioEvidenceInputs> = {},
): PathActivityRecord {
  const pairRows = overrides.pairRows ?? [];
  return derivePathActivity({
    band: "20m",
    txField: "FN",
    rxField: "IO",
    issuedAt: ISSUED_AT,
    readableHours: readable(),
    coverageRows: pairRows.map(coverageOf),
    ...overrides,
    pairRows,
  });
}

describe("unknown-vs-closed", () => {
  it("carries no count at all when nothing is known (test 6)", () => {
    const record = derive({ coverageRows: [] });

    expect(record.state).toBe("unknown");
    // Structural, not a value assertion: a later refactor that reintroduced a
    // zero here would be inventing the one number these aggregates cannot
    // support, and this fails rather than quietly rendering "0 reports".
    expect("count" in record).toBe(false);
    expect(Object.keys(record)).not.toContain("count");
  });

  it("reports zero with a coverage age when somebody was listening (test 7)", () => {
    const record = derive({
      pairRows: [],
      coverageRows: [
        {
          hour_utc: WINDOW_HOURS[3],
          mode_class: "digital",
          tx_field: "JN",
          unique_rx: 6,
        },
      ],
    });

    expect(record.state).toBe("no_reports");
    if (record.state !== "no_reports") return;
    expect(record.count).toBe(0);
    expect(record.latestCoveredHourEnd).toBe("2026-09-11T16:00:00.000Z");
    expect(record.ageKind).toBe("coverage");
    expect(record.ageSeconds).toBe(7200);
  });

  it("offers no closed-like verdict anywhere in the union (test 8)", () => {
    const states: PathActivityRecord["state"][] = [
      "verified_open",
      "no_reports",
      "unknown",
    ];
    // An exhaustive switch: adding a "closed" member to the union without a
    // branch here is a compile error, and adding the branch is a code review
    // this repo would refuse.
    const label = (state: PathActivityRecord["state"]): string => {
      switch (state) {
        case "verified_open":
          return "heard open";
        case "no_reports":
          return "no reports";
        case "unknown":
          return "unknown";
      }
    };
    expect(states.map(label)).toEqual(["heard open", "no reports", "unknown"]);
    expect(states.join(" ")).not.toMatch(/closed|dead|shut/);
  });
});

describe("age", () => {
  it("measures from the end of the newest qualified hour (test 9)", () => {
    const record = derive({
      pairRows: [
        pairRow({ hour_utc: WINDOW_HOURS[1] }),
        pairRow({ hour_utc: WINDOW_HOURS[4] }),
      ],
    });

    expect(record.state).toBe("verified_open");
    if (record.state !== "verified_open") return;
    // 16:00 row ends at 17:00; issued at 18:00, so one hour old.
    expect(record.latestQualifiedHourEnd).toBe("2026-09-11T17:00:00.000Z");
    expect(record.ageSeconds).toBe(3600);
    expect(record.ageKind).toBe("report");
  });

  it("does not assume the rows arrive in order (test 10)", () => {
    const ordered = derive({
      pairRows: [
        pairRow({ hour_utc: WINDOW_HOURS[0] }),
        pairRow({ hour_utc: WINDOW_HOURS[2] }),
        pairRow({ hour_utc: WINDOW_HOURS[4] }),
      ],
    });
    const shuffled = derive({
      pairRows: [
        pairRow({ hour_utc: WINDOW_HOURS[4] }),
        pairRow({ hour_utc: WINDOW_HOURS[0] }),
        pairRow({ hour_utc: WINDOW_HOURS[2] }),
      ],
    });

    expect(shuffled).toEqual(ordered);
  });

  it("labels a coverage age differently from a report age (test 11)", () => {
    const heard = derive({
      pairRows: [pairRow({ hour_utc: WINDOW_HOURS[5] })],
    });
    const silent = derive({
      pairRows: [],
      coverageRows: [
        {
          hour_utc: WINDOW_HOURS[5],
          mode_class: "cw",
          tx_field: "JN",
          unique_rx: 2,
        },
      ],
    });

    expect(heard.state === "verified_open" && heard.ageKind).toBe("report");
    expect(silent.state === "no_reports" && silent.ageKind).toBe("coverage");
    // Same hour, same issuance: only the label distinguishes them, which is
    // exactly why the label has to exist.
    expect(heard.state === "verified_open" && heard.ageSeconds).toBe(0);
    expect(silent.state === "no_reports" && silent.ageSeconds).toBe(0);
  });

  it("reports the aggregation lag so silence is never read as live", () => {
    const record = derive({
      pairRows: [pairRow({ hour_utc: WINDOW_HOURS[5] })],
      readableHours: readable(WINDOW_HOURS.slice(0, 5)),
    });

    // 16:00 is the newest readable hour, so the aggregates are an hour behind
    // issuance even though the window runs to 18:00.
    expect(record.aggregationLagSeconds).toBe(3600);
    expect(record.requestedHourCount).toBe(6);
    expect(record.readableHourCount).toBe(5);
    expect(record.unreadableSpans).toEqual([
      { startAt: WINDOW_HOURS[5], endAt: "2026-09-11T18:00:00.000Z" },
    ]);
  });
});

describe("an incomplete window is not coverage", () => {
  const gapped = [
    WINDOW_HOURS[0],
    WINDOW_HOURS[1],
    WINDOW_HOURS[2],
    WINDOW_HOURS[4],
    WINDOW_HOURS[5],
  ];

  it("refuses no_reports while any window hour is unreadable", () => {
    // Silence over five of six hours is not silence over the window. The
    // sixth hour could hold every report on this path, and nothing here can
    // rule that out, so the verdict is unknown and names the gap.
    const record = derive({
      pairRows: [],
      coverageRows: [
        {
          hour_utc: WINDOW_HOURS[4],
          mode_class: "digital",
          tx_field: "JN",
          unique_rx: 5,
        },
      ],
      readableHours: readable(gapped),
    });

    expect(record.state).not.toBe("no_reports");
    expect(record.state).toBe("unknown");
    if (record.state !== "unknown") return;
    expect(record.reason).toBe("aggregate_hour_not_readable");
    expect("count" in record).toBe(false);
    expect(record.unreadableSpans).toEqual([
      { startAt: WINDOW_HOURS[3], endAt: WINDOW_HOURS[4] },
    ]);
  });

  it("still states verified_open on a partial window, as a lower bound", () => {
    // A report inside a readable hour is real evidence whatever happened in
    // the gap. The count survives; the claim that it is the whole count does
    // not.
    const record = derive({
      pairRows: [pairRow({ hour_utc: WINDOW_HOURS[4], spot_count: 9 })],
      readableHours: readable(gapped),
    });

    expect(record.state).toBe("verified_open");
    if (record.state !== "verified_open") return;
    expect(record.count).toBe(9);
    expect(record.countIsLowerBound).toBe(true);
    expect(record.unreadableSpans).toHaveLength(1);
  });

  it("states an exact count when every window hour is readable", () => {
    const record = derive({
      pairRows: [pairRow({ hour_utc: WINDOW_HOURS[4], spot_count: 9 })],
    });

    expect(record.state === "verified_open" && record.countIsLowerBound).toBe(
      false,
    );
    expect(record.unreadableSpans).toEqual([]);
  });

  it("still reports silence over a wholly readable window", () => {
    const record = derive({
      pairRows: [],
      coverageRows: [
        {
          hour_utc: WINDOW_HOURS[4],
          mode_class: "digital",
          tx_field: "JN",
          unique_rx: 5,
        },
      ],
    });

    expect(record.state).toBe("no_reports");
  });
});

describe("coverage answers the requested modes", () => {
  it("does not let a digital receiver cover a CW request", () => {
    const record = derive({
      pairRows: [],
      modeClasses: ["cw"],
      coverageRows: [
        {
          hour_utc: WINDOW_HOURS[4],
          mode_class: "digital",
          tx_field: "JN",
          unique_rx: 5,
        },
      ],
    });

    expect(record.state).toBe("unknown");
    if (record.state !== "unknown") return;
    expect(record.reason).toBe("no_receiver_coverage");
  });
});

describe("backfilled flag", () => {
  it("qualifies a wholly backfilled row and flags it (test 12)", () => {
    const record = derive({
      pairRows: [
        pairRow({
          hour_utc: WINDOW_HOURS[4],
          spot_count: 7,
          backfilled_count: 7,
        }),
      ],
    });

    expect(record.state).toBe("verified_open");
    if (record.state !== "verified_open") return;
    // Flagged, not dropped: the count is the whole count.
    expect(record.count).toBe(7);
    expect(record.backfilledCount).toBe(7);
    expect(record.backfilledShare).toBe(1);
    expect(record.fieldAttribution).toBe("callsign_backfill");
  });

  it("calls a partly backfilled set direct and still states the share", () => {
    const record = derive({
      pairRows: [
        pairRow({
          hour_utc: WINDOW_HOURS[4],
          spot_count: 8,
          backfilled_count: 2,
        }),
      ],
    });

    expect(record.state === "verified_open" && record.fieldAttribution).toBe(
      "direct",
    );
    expect(record.state === "verified_open" && record.backfilledShare).toBe(
      0.25,
    );
  });
});

describe("mode breakdown", () => {
  it("splits the count per class and reconciles the total (test 13)", () => {
    const record = derive({
      pairRows: [
        pairRow({ hour_utc: WINDOW_HOURS[1], mode_class: "cw", spot_count: 3 }),
        pairRow({
          hour_utc: WINDOW_HOURS[2],
          mode_class: "digital",
          spot_count: 5,
        }),
        pairRow({
          hour_utc: WINDOW_HOURS[3],
          mode_class: "phone",
          spot_count: 1,
        }),
      ],
    });

    expect(record.state).toBe("verified_open");
    if (record.state !== "verified_open") return;
    expect(record.modeCounts).toEqual({ cw: 3, digital: 5, phone: 1 });
    const total = Object.values(record.modeCounts).reduce((a, b) => a + b, 0);
    expect(total).toBe(record.count);
    expect(record.count).toBe(9);
  });

  it("takes the largest hourly unique counts rather than summing hours", () => {
    const record = derive({
      pairRows: [
        pairRow({ hour_utc: WINDOW_HOURS[1], unique_tx: 2, unique_rx: 5 }),
        pairRow({ hour_utc: WINDOW_HOURS[3], unique_tx: 4, unique_rx: 3 }),
      ],
    });

    // Summing would claim six transmitters when the same two stations could
    // account for every hour.
    expect(record.state === "verified_open" && record.uniqueTx).toBe(4);
    expect(record.state === "verified_open" && record.uniqueRx).toBe(5);
  });
});

describe("mode filter", () => {
  it("excludes other classes from the count and from qualification (test 14)", () => {
    const modeClasses: ModeClass[] = ["cw"];
    const phoneOnly = pairRow({
      hour_utc: WINDOW_HOURS[2],
      mode_class: "phone",
      spot_count: 6,
    });

    const record = derive({ modeClasses, pairRows: [phoneOnly] });

    // The phone row neither qualifies as a report nor establishes coverage:
    // a receiver decoding SSB says nothing about whether anyone was copying
    // CW. Calling it a covered silence would answer the CW question with
    // phone evidence.
    expect(record.state).toBe("unknown");
    if (record.state !== "unknown") return;
    expect(record.reason).toBe("no_receiver_coverage");
    expect("count" in record).toBe(false);
    expect(record.modeClasses).toEqual(["cw"]);
  });

  it("counts all three classes by default", () => {
    const record = derive({
      pairRows: [
        pairRow({
          hour_utc: WINDOW_HOURS[2],
          mode_class: "phone",
          spot_count: 6,
        }),
      ],
    });

    expect(record.state === "verified_open" && record.count).toBe(6);
  });
});

describe("qualification", () => {
  it("ignores a row outside the readable hours", () => {
    const record = derive({
      pairRows: [pairRow({ hour_utc: WINDOW_HOURS[5] })],
      readableHours: readable(WINDOW_HOURS.slice(0, 3)),
      coverageRows: [],
    });

    expect(record.state).toBe("unknown");
    if (record.state !== "unknown") return;
    expect(record.reason).toBe("no_receiver_coverage");
  });

  it("ignores a row with no receiver behind it", () => {
    const record = derive({
      pairRows: [
        pairRow({ hour_utc: WINDOW_HOURS[2], spot_count: 3, unique_rx: 0 }),
      ],
    });

    expect(record.state).toBe("unknown");
    if (record.state !== "unknown") return;
    expect(record.reason).toBe("no_receiver_coverage");
  });

  it("states the window it answered", () => {
    const record = derive({
      pairRows: [pairRow({ hour_utc: WINDOW_HOURS[0] })],
    });

    expect(record.intervalSeconds).toBe(DEFAULT_OBSERVED_WINDOW_SECONDS);
    expect(record.windowStartAt).toBe("2026-09-11T12:00:00.000Z");
    expect(record.issuedAt).toBe(ISSUED_AT);
    expect(record.band).toBe("20m");
    expect(record.txField).toBe("FN");
    expect(record.rxField).toBe("IO");
  });
});
