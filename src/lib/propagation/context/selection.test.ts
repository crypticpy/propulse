// @vitest-environment node
//
// Selection is pure arithmetic over timestamps and must behave identically on
// a server and in a browser, so this half of the suite runs without a DOM.
// `snapshot.test.ts` exercises the same selection through the snapshot under
// the repository default environment.

import { describe, expect, it } from "vitest";

import cases from "./fixtures/time-travel.cases.json";
import { getLedgerEntry, SOURCE_LEDGER } from "./ledger";
import {
  inactiveBarrierAsOf,
  selectAsOf,
  ContextStampError,
} from "./selection";
import {
  ContextTimeError,
  instantMs,
  type RecordOrigin,
  type SourceActivity,
  type SourceRecord,
} from "./types";

interface RecordOptions {
  observedIntervalEndAt: string;
  capturedAt?: string;
  publishedAt?: string;
  publicationKind?: "declared" | "bounded_by_capture";
  value?: number;
  origin?: RecordOrigin;
  activity?: SourceActivity;
  sourceId?: string;
  variable?: string;
  intervalSeconds?: number | null;
  revision?: string;
}

function record(options: RecordOptions): SourceRecord {
  const capturedAt = options.capturedAt ?? options.observedIntervalEndAt;
  const publicationKind = options.publicationKind ?? "bounded_by_capture";
  return {
    sourceId: options.sourceId ?? "kp",
    variable: options.variable ?? "kp",
    units: "dimensionless (Kp, thirds)",
    value: options.value ?? 3,
    stamps: {
      observedIntervalStartAt: null,
      observedIntervalEndAt: options.observedIntervalEndAt,
      publication: {
        kind: publicationKind,
        publishedAt: options.publishedAt ?? capturedAt,
      },
      capturedAt,
      forecastIssuedAt: null,
      validFrom: null,
      validTo: null,
      intervalSeconds: options.intervalSeconds ?? 10800,
      revision: options.revision ?? "r1",
      archiveClass:
        publicationKind === "declared"
          ? "verified_as_issued"
          : "capture_bounded",
    },
    origin: options.origin ?? "network",
    activity: options.activity ?? "not_reported",
    qualityFlags: [],
  };
}

const KP = getLedgerEntry("kp");
const ISSUED = "2026-09-11T12:00:00.000Z";

describe("selectAsOf: available by issuedAt (M02)", () => {
  it("selects a record whose three stamps all land exactly on issuedAt", () => {
    const only = record({ observedIntervalEndAt: ISSUED, capturedAt: ISSUED });
    const selected = selectAsOf([only], {
      issuedAt: ISSUED,
      entry: KP,
      mode: "live",
    });
    expect(selected.state).toBe("selected");
    if (selected.state !== "selected") return;
    expect(selected.record).toBe(only);
    expect(selected.ageSeconds).toBe(0);
  });

  it("excludes a record observed one millisecond after issuedAt", () => {
    const future = record({
      observedIntervalEndAt: "2026-09-11T12:00:00.001Z",
    });
    const selected = selectAsOf([future], {
      issuedAt: ISSUED,
      entry: KP,
      mode: "live",
    });
    expect(selected).toMatchObject({
      state: "excluded",
      reason: "not_yet_observed",
    });
  });

  it("excludes a record published one millisecond after issuedAt", () => {
    const late = record({
      observedIntervalEndAt: "2026-09-11T11:00:00.000Z",
      publishedAt: "2026-09-11T12:00:00.001Z",
      capturedAt: "2026-09-11T12:00:00.001Z",
      publicationKind: "declared",
    });
    const selected = selectAsOf([late], {
      issuedAt: ISSUED,
      entry: KP,
      mode: "live",
    });
    expect(selected).toMatchObject({
      state: "excluded",
      reason: "not_yet_published",
    });
  });

  it("excludes a record captured one millisecond after issuedAt", () => {
    const late = record({
      observedIntervalEndAt: "2026-09-11T11:00:00.000Z",
      publishedAt: "2026-09-11T11:30:00.000Z",
      capturedAt: "2026-09-11T12:00:00.001Z",
      publicationKind: "declared",
    });
    const selected = selectAsOf([late], {
      issuedAt: ISSUED,
      entry: KP,
      mode: "live",
    });
    expect(selected).toMatchObject({
      state: "excluded",
      reason: "not_yet_captured",
    });
  });

  it("throws on a record captured before it was published", () => {
    const impossible = record({
      observedIntervalEndAt: "2026-09-11T10:00:00.000Z",
      publishedAt: "2026-09-11T11:00:00.000Z",
      capturedAt: "2026-09-11T10:30:00.000Z",
      publicationKind: "declared",
    });
    expect(() =>
      selectAsOf([impossible], { issuedAt: ISSUED, entry: KP, mode: "live" }),
    ).toThrow(ContextStampError);
  });

  it("throws on a record published before its observation interval closed", () => {
    const impossible = record({
      observedIntervalEndAt: "2026-09-11T11:00:00.000Z",
      publishedAt: "2026-09-11T10:00:00.000Z",
      capturedAt: "2026-09-11T11:30:00.000Z",
      publicationKind: "declared",
    });
    expect(() =>
      selectAsOf([impossible], { issuedAt: ISSUED, entry: KP, mode: "live" }),
    ).toThrow(ContextStampError);
  });
});

describe("selectAsOf: time travel", () => {
  const history = [
    record({
      observedIntervalEndAt: "2026-09-11T11:40:00.000Z",
      value: 2,
      revision: "a",
    }),
    record({
      observedIntervalEndAt: "2026-09-11T12:00:00.000Z",
      value: 5,
      revision: "b",
    }),
  ];

  it("selects what was current then, not what is current now", () => {
    const early = selectAsOf(history, {
      issuedAt: "2026-09-11T11:59:59.999Z",
      entry: KP,
      mode: "live",
    });
    const late = selectAsOf(history, {
      issuedAt: ISSUED,
      entry: KP,
      mode: "live",
    });
    expect(early.state === "selected" && early.record.stamps.revision).toBe(
      "a",
    );
    expect(late.state === "selected" && late.record.stamps.revision).toBe("b");
  });

  it("keeps an old observation old when it is fetched again", () => {
    const old = record({
      observedIntervalEndAt: "2026-09-11T11:45:00.000Z",
      capturedAt: "2026-09-11T11:46:00.000Z",
      revision: "first-capture",
    });
    const refetched = record({
      observedIntervalEndAt: "2026-09-11T11:45:00.000Z",
      capturedAt: ISSUED,
      revision: "second-capture",
    });
    const selected = selectAsOf([old, refetched], {
      issuedAt: ISSUED,
      entry: KP,
      mode: "live",
    });
    expect(selected.state).toBe("selected");
    if (selected.state !== "selected") return;
    // The later capture breaks the tie, but the observation is still as old as
    // it ever was: a fresh fetch moves no observation time and shortens no age.
    expect(selected.record.stamps.revision).toBe("second-capture");
    expect(selected.record.stamps.observedIntervalEndAt).toBe(
      "2026-09-11T11:45:00.000Z",
    );
    expect(selected.ageSeconds).toBe(900);
  });

  it("prefers the newer observation over the newer capture", () => {
    const newerObservation = record({
      observedIntervalEndAt: "2026-09-11T11:30:00.000Z",
      capturedAt: "2026-09-11T11:35:00.000Z",
      revision: "newer-observation",
    });
    const newerCapture = record({
      observedIntervalEndAt: "2026-09-11T11:00:00.000Z",
      capturedAt: "2026-09-11T11:59:00.000Z",
      revision: "newer-capture",
    });
    const selected = selectAsOf([newerObservation, newerCapture], {
      issuedAt: ISSUED,
      entry: KP,
      mode: "live",
    });
    expect(
      selected.state === "selected" && selected.record.stamps.revision,
    ).toBe("newer-observation");
  });

  it.each(cases.cases)("boundary case $name", (testCase) => {
    const entry = getLedgerEntry(testCase.sourceId);
    const history = testCase.records.map((row) =>
      record({
        sourceId: entry.sourceId,
        variable: entry.variables[0],
        observedIntervalEndAt: row.observedIntervalEndAt,
        capturedAt: row.capturedAt,
        revision: row.revision,
      }),
    );
    const selected = selectAsOf(history, {
      issuedAt: testCase.issuedAt,
      entry,
      mode: "live",
    });
    if (testCase.expected.state === "selected") {
      expect(selected.state).toBe("selected");
      if (selected.state !== "selected") return;
      expect(selected.record.stamps.revision).toBe(testCase.expected.revision);
      expect(selected.ageSeconds).toBe(testCase.expected.ageSeconds);
    } else {
      expect(selected).toMatchObject({
        state: testCase.expected.state,
        reason: testCase.expected.reason,
      });
    }
  });
});

describe("selectAsOf: bounds, outages and modes (M11)", () => {
  it("excludes a record beyond its age bound but keeps it visible and dated", () => {
    const stale = record({ observedIntervalEndAt: "2026-09-11T11:00:00.000Z" });
    const selected = selectAsOf([stale], {
      issuedAt: ISSUED,
      entry: KP,
      mode: "live",
    });
    expect(selected.state).toBe("excluded");
    if (selected.state !== "excluded") return;
    expect(selected.reason).toBe("beyond_age_bound");
    expect(selected.latest).toBe(stale);
  });

  it("applies no age bound to a source that has none established", () => {
    const forecast = record({
      sourceId: "kp_forecast",
      observedIntervalEndAt: "2026-09-01T00:00:00.000Z",
    });
    const selected = selectAsOf([forecast], {
      issuedAt: ISSUED,
      entry: getLedgerEntry("kp_forecast"),
      mode: "live",
    });
    expect(selected.state).toBe("selected");
  });

  it("never selects a non-finite value", () => {
    const broken = record({ observedIntervalEndAt: ISSUED, value: Number.NaN });
    const selected = selectAsOf([broken], {
      issuedAt: ISSUED,
      entry: KP,
      mode: "live",
    });
    expect(selected).toMatchObject({
      state: "excluded",
      reason: "non_finite_value",
    });
  });

  it("reports an absent source distinctly from an excluded one", () => {
    const selected = selectAsOf([], {
      issuedAt: ISSUED,
      entry: KP,
      mode: "live",
    });
    expect(selected).toMatchObject({
      state: "absent",
      reason: "no_record_in_history",
    });
  });

  it("excludes every network record in offline mode and keeps a bundled one", () => {
    const live = record({ observedIntervalEndAt: ISSUED });
    const offline = selectAsOf([live], {
      issuedAt: ISSUED,
      entry: KP,
      mode: "offline",
    });
    expect(offline).toMatchObject({
      state: "excluded",
      reason: "offline_mode",
    });

    const bundled = record({
      sourceId: "r12_climatology",
      variable: "r12",
      observedIntervalEndAt: "2026-08-01T00:00:00.000Z",
      origin: "bundled",
      publicationKind: "declared",
    });
    const selected = selectAsOf([bundled], {
      issuedAt: ISSUED,
      entry: getLedgerEntry("r12_climatology"),
      mode: "offline",
    });
    expect(selected.state).toBe("selected");
  });

  it("keeps a cached observation eligible inside its bound and discloses its age", () => {
    const cached = record({
      observedIntervalEndAt: "2026-09-11T11:31:00.000Z",
      capturedAt: "2026-09-11T11:32:00.000Z",
      origin: "cached",
    });
    const selected = selectAsOf([cached], {
      issuedAt: ISSUED,
      entry: KP,
      mode: "cached_live",
    });
    expect(selected.state).toBe("selected");
    if (selected.state !== "selected") return;
    expect(selected.ageSeconds).toBe(1740);
  });

  it("excludes a cached observation outside its bound in cached_live mode", () => {
    const cached = record({
      observedIntervalEndAt: "2026-09-11T11:29:00.000Z",
      origin: "cached",
    });
    const selected = selectAsOf([cached], {
      issuedAt: ISSUED,
      entry: KP,
      mode: "cached_live",
    });
    expect(selected).toMatchObject({
      state: "excluded",
      reason: "beyond_age_bound",
    });
  });

  it("excludes a record its own producer marked inactive", () => {
    const entry = getLedgerEntry("magnetic_field");
    const dead = record({
      sourceId: "magnetic_field",
      variable: "bz_gsm",
      observedIntervalEndAt: ISSUED,
      activity: "inactive",
    });
    const selected = selectAsOf([dead], {
      issuedAt: ISSUED,
      entry,
      mode: "live",
    });
    expect(selected).toMatchObject({
      state: "excluded",
      reason: "source_inactive",
    });
  });

  it("does not serve an older active record past an inactive barrier", () => {
    const entry = getLedgerEntry("magnetic_field");
    const active = record({
      sourceId: "magnetic_field",
      variable: "bz_gsm",
      observedIntervalEndAt: "2026-09-11T11:50:00.000Z",
      activity: "active",
    });
    const dead = record({
      sourceId: "magnetic_field",
      variable: "bz_gsm",
      observedIntervalEndAt: "2026-09-11T11:55:00.000Z",
      activity: "inactive",
    });
    const barrier = inactiveBarrierAsOf([active, dead], { issuedAt: ISSUED });
    expect(barrier).toBe("2026-09-11T11:55:00.000Z");
    // The older active record is inside its 30 minute bound and would be
    // selected without the barrier; the barrier is the only thing stopping it.
    expect(
      selectAsOf([active], { issuedAt: ISSUED, entry, mode: "live" }).state,
    ).toBe("selected");
    expect(
      selectAsOf([active], { issuedAt: ISSUED, entry, mode: "live", barrier }),
    ).toMatchObject({
      state: "excluded",
      reason: "inactive_barrier",
    });
    // With the whole history the source is excluded either way, never served.
    expect(
      selectAsOf([active, dead], {
        issuedAt: ISSUED,
        entry,
        mode: "live",
        barrier,
      }).state,
    ).toBe("excluded");
  });

  it("ignores an inactive marker this service had not yet captured", () => {
    const dead = record({
      sourceId: "magnetic_field",
      variable: "bz_gsm",
      observedIntervalEndAt: "2026-09-11T12:30:00.000Z",
      capturedAt: "2026-09-11T12:31:00.000Z",
      activity: "inactive",
    });
    expect(inactiveBarrierAsOf([dead], { issuedAt: ISSUED })).toBeNull();
  });

  it("leaves other sources untouched when one source goes dark", () => {
    const kp = record({ observedIntervalEndAt: ISSUED });
    const dead = record({
      sourceId: "magnetic_field",
      variable: "bz_gsm",
      observedIntervalEndAt: ISSUED,
      activity: "inactive",
    });
    expect(
      selectAsOf([kp], { issuedAt: ISSUED, entry: KP, mode: "live" }).state,
    ).toBe("selected");
    expect(
      selectAsOf([dead], {
        issuedAt: ISSUED,
        entry: getLedgerEntry("magnetic_field"),
        mode: "live",
      }).state,
    ).toBe("excluded");
  });
});

describe("selectAsOf: the verified as-issued archive is a disabled capability", () => {
  it("excludes a capture-bounded record when a verified archive is required", () => {
    const bounded = record({ observedIntervalEndAt: ISSUED });
    const selected = selectAsOf([bounded], {
      issuedAt: ISSUED,
      entry: KP,
      mode: "live",
      requireVerifiedArchive: true,
    });
    expect(selected).toMatchObject({
      state: "excluded",
      reason: "unknown_publication_history",
    });
  });

  it("keeps a header-stamped forecast eligible under the same requirement", () => {
    const declared = record({
      sourceId: "f107_forecast",
      variable: "f107",
      observedIntervalEndAt: "2026-09-11T00:30:00.000Z",
      publishedAt: "2026-09-11T00:30:00.000Z",
      capturedAt: "2026-09-11T00:35:00.000Z",
      publicationKind: "declared",
    });
    const selected = selectAsOf([declared], {
      issuedAt: ISSUED,
      entry: getLedgerEntry("f107_forecast"),
      mode: "live",
      requireVerifiedArchive: true,
    });
    expect(selected.state).toBe("selected");
  });
});

describe("selectAsOf: the ledger is the gate", () => {
  it("refuses a record whose variable its ledger entry never declared", () => {
    const wrong = record({ observedIntervalEndAt: ISSUED, variable: "bz_gsm" });
    expect(() =>
      selectAsOf([wrong], { issuedAt: ISSUED, entry: KP, mode: "live" }),
    ).toThrow(/variable/);
  });

  it("declares an age bound or an explicit null for every source", () => {
    for (const entry of Object.values(SOURCE_LEDGER)) {
      expect(entry.maxAgeSeconds === null || entry.maxAgeSeconds > 0).toBe(
        true,
      );
    }
  });
});

describe("an instant without a UTC offset is not an instant", () => {
  it("rejects an offset-less string rather than reading it as local time", () => {
    expect(() =>
      instantMs("2026-09-11T12:00:00", "observedIntervalEndAt"),
    ).toThrow(ContextTimeError);
    expect(() => instantMs("2026-09-11", "observedIntervalEndAt")).toThrow(
      ContextTimeError,
    );
    expect(() => instantMs("11 Sep 2026 12:00:00 GMT", "capturedAt")).toThrow(
      ContextTimeError,
    );
  });

  it("accepts the Z form and a numeric offset, and reads them as the same instant", () => {
    expect(instantMs("2026-09-11T12:00:00Z")).toBe(
      instantMs("2026-09-11T17:00:00+05:00"),
    );
    expect(instantMs("2026-09-11T12:00:00.500Z")).toBe(
      instantMs("2026-09-11T12:00:00Z") + 500,
    );
    expect(instantMs("2026-09-11T07:00:00-05:00")).toBe(
      instantMs("2026-09-11T12:00:00Z"),
    );
  });

  it("rejects a record stamped without an offset wherever it enters selection", () => {
    expect(() =>
      selectAsOf([record({ observedIntervalEndAt: "2026-09-11T11:50:00" })], {
        issuedAt: "2026-09-11T12:00:00Z",
        entry: getLedgerEntry("kp"),
        mode: "cached_live",
      }),
    ).toThrow(ContextTimeError);
  });
});
