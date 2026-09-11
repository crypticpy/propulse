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
  admitRecord,
  ContextDeclarationError,
  ContextStampError,
} from "./admission";
import { inactiveBarrierAsOf, selectAsOf } from "./selection";
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
  forecastIssuedAt?: string;
  validFrom?: string;
  validTo?: string;
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
      forecastIssuedAt: options.forecastIssuedAt ?? null,
      validFrom: options.validFrom ?? null,
      validTo: options.validTo ?? null,
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
      forecastIssuedAt: "2026-09-01T00:00:00.000Z",
      validFrom: "2026-09-01T00:00:00.000Z",
      validTo: "2026-09-01T03:00:00.000Z",
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
      forecastIssuedAt: "2026-09-11T00:30:00.000Z",
      validFrom: "2026-09-11T01:00:00.000Z",
      validTo: "2026-09-11T04:00:00.000Z",
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

describe("two equally current records are ordered by rule, not by input order", () => {
  it("selects the same record however the history is listed", () => {
    const history = [
      record({
        observedIntervalEndAt: "2026-09-11T11:45:00.000Z",
        value: 3,
        revision: "a",
      }),
      record({
        observedIntervalEndAt: "2026-09-11T11:45:00.000Z",
        value: 5,
        revision: "b",
      }),
    ];
    const options = {
      issuedAt: "2026-09-11T12:00:00.000Z",
      entry: getLedgerEntry("kp"),
      mode: "cached_live" as const,
    };
    const forward = selectAsOf(history, options);
    const reversed = selectAsOf([...history].reverse(), options);
    expect(forward.state).toBe("selected");
    expect(reversed).toEqual(forward);
  });

  it("reports the same exclusion however the history is listed", () => {
    const history = [
      record({
        observedIntervalEndAt: "2026-09-11T09:00:00.000Z",
        value: 3,
        revision: "a",
      }),
      record({
        observedIntervalEndAt: "2026-09-11T09:00:00.000Z",
        value: 5,
        revision: "b",
      }),
    ];
    const options = {
      issuedAt: "2026-09-11T12:00:00.000Z",
      entry: getLedgerEntry("kp"),
      mode: "cached_live" as const,
    };
    const forward = selectAsOf(history, options);
    expect(forward.state).toBe("excluded");
    expect(selectAsOf([...history].reverse(), options)).toEqual(forward);
  });
});

describe("admitRecord: the ledger is the only authority on a record", () => {
  const kpEntry = getLedgerEntry("kp");

  it("rejects an archive class above the ledger ceiling", () => {
    // kp is a JSON feed with no printed issue time. A record claiming a
    // verified as-issued archive claims a history the source cannot have.
    const overclaimed: SourceRecord = {
      ...record({ observedIntervalEndAt: "2026-09-11T11:45:00.000Z" }),
      stamps: {
        ...record({ observedIntervalEndAt: "2026-09-11T11:45:00.000Z" }).stamps,
        publication: {
          kind: "declared",
          publishedAt: "2026-09-11T11:45:00.000Z",
        },
        archiveClass: "verified_as_issued",
      },
    };
    expect(() => admitRecord(kpEntry, overclaimed)).toThrow(
      ContextDeclarationError,
    );
    expect(() =>
      selectAsOf([overclaimed], {
        issuedAt: "2026-09-11T12:00:00.000Z",
        entry: kpEntry,
        mode: "cached_live",
        requireVerifiedArchive: true,
      }),
    ).toThrow(ContextDeclarationError);
  });

  it("rejects a publication class its archive class contradicts", () => {
    const base = record({ observedIntervalEndAt: "2026-09-11T11:45:00.000Z" });
    const mismatched: SourceRecord = {
      ...base,
      stamps: {
        ...base.stamps,
        publication: {
          kind: "declared",
          publishedAt: "2026-09-11T11:45:00.000Z",
        },
      },
    };
    expect(() => admitRecord(kpEntry, mismatched)).toThrow(
      ContextDeclarationError,
    );
  });

  it("rejects a record whose kind is not the one the caller consumes", () => {
    const observation = record({
      observedIntervalEndAt: "2026-09-11T11:45:00.000Z",
    });
    expect(() =>
      admitRecord(kpEntry, observation, { role: "forecast" }),
    ).toThrow(ContextDeclarationError);
    expect(() =>
      admitRecord(kpEntry, observation, { role: "observation" }),
    ).not.toThrow();
  });

  it("rejects a forecast valid beyond the horizon its source declares", () => {
    const entry = getLedgerEntry("kp_forecast");
    expect(entry.validHorizonSeconds).toBe(3 * 86400);
    const beyond: SourceRecord = {
      ...record({ observedIntervalEndAt: "2026-09-11T12:00:00.000Z" }),
      sourceId: "kp_forecast",
      stamps: {
        ...record({ observedIntervalEndAt: "2026-09-11T12:00:00.000Z" }).stamps,
        forecastIssuedAt: "2026-09-11T12:00:00.000Z",
        validFrom: "2026-09-15T12:00:00.000Z",
        validTo: "2026-09-15T15:00:00.000Z",
      },
    };
    expect(() => admitRecord(getLedgerEntry("kp_forecast"), beyond)).toThrow(
      ContextDeclarationError,
    );
  });

  it("rejects a half stated validity interval", () => {
    const base = record({ observedIntervalEndAt: "2026-09-11T11:45:00.000Z" });
    const half: SourceRecord = {
      ...base,
      stamps: { ...base.stamps, validFrom: "2026-09-11T12:00:00.000Z" },
    };
    expect(() => admitRecord(kpEntry, half)).toThrow(ContextStampError);
  });

  it("admits the records the adapters actually produce", () => {
    expect(() =>
      admitRecord(
        kpEntry,
        record({ observedIntervalEndAt: "2026-09-11T11:45:00.000Z" }),
      ),
    ).not.toThrow();
  });
});

describe("an instant is a calendar date, not whatever Date.parse salvages", () => {
  it("rejects a day that does not exist in its month", () => {
    expect(() => instantMs("2026-02-31T00:00:00Z")).toThrow(ContextTimeError);
    expect(() => instantMs("2026-04-31T00:00:00Z")).toThrow(ContextTimeError);
    expect(() => instantMs("2027-02-29T00:00:00Z")).toThrow(ContextTimeError);
  });

  it("rejects an out of range month, hour, minute or second", () => {
    for (const bad of [
      "2026-13-01T00:00:00Z",
      "2026-00-10T00:00:00Z",
      "2026-09-00T00:00:00Z",
      "2026-09-11T24:00:00Z",
      "2026-09-11T12:60:00Z",
      "2026-09-11T12:00:61Z",
      "2026-09-11T12:00:00+24:00",
    ]) {
      expect(() => instantMs(bad), `${bad} was accepted`).toThrow(
        ContextTimeError,
      );
    }
  });

  it("keeps a real leap day", () => {
    expect(instantMs("2028-02-29T00:00:00Z")).toBe(
      Date.parse("2028-02-29T00:00:00Z"),
    );
  });
});

/**
 * The declaration census.
 *
 * Every field of a ledger entry and every field of a record, with the rule in
 * the admission gate that validates it or the reason it is not a constraint.
 * The structural test below holds this table against both types in both
 * directions, so a field cannot be added to either one without someone
 * deciding, here, how it is validated.
 */
const ADMISSION_COVERAGE: Readonly<Record<string, string>> = Object.freeze({
  "entry.sourceId": "identity: a record filed under another source is rejected",
  "entry.label": "not a constraint: display text, carried by no record",
  "entry.provider": "not a constraint: attribution, carried by no record",
  "entry.kind": "role: the consuming branch names the kind it reads",
  "entry.variables": "declaration: a variable not listed here is rejected",
  "entry.units":
    "not a constraint: one string describes the source's principal variable, while magnetic_field and solar_wind carry several units at once. Per-variable units in the ledger is the follow-up.",
  "entry.observationIntervalSeconds":
    "not a constraint: the record states the producer's own cadence for that record, and a collector row states none at all",
  "entry.publicationLatencySeconds":
    "not a constraint at admission: publication is verified causally against the capture instant, which is a true bound whether or not a latency is documented",
  "entry.maxAgeSeconds":
    "eligibility, not admission: applied as beyond_age_bound against issuedAt",
  "entry.validHorizonSeconds":
    "horizon: a forecast valid beyond it is rejected",
  "entry.archiveClass": "ceiling: a record may not claim a better archive",
  "entry.licence": "not a constraint: terms, carried by no record",
  "entry.outageBehaviour": "not a constraint: prose, carried by no record",

  "record.sourceId": "identity: must equal the entry",
  "record.variable": "declaration: must be one the entry lists",
  "record.units": "not a constraint: see entry.units",
  "record.value":
    "not a constraint: a non finite value is the eligibility outcome non_finite_value, and a status only outage marker carries none by design",
  "record.origin": "not a constraint: mode eligibility reads it",
  "record.activity":
    "not a constraint: an outage is an eligibility outcome, not a malformed record",
  "record.qualityFlags": "not a constraint: opaque producer labels",
  "record.stamps.observedIntervalStartAt":
    "calendar and causal: a real instant, no later than the interval end",
  "record.stamps.observedIntervalEndAt": "calendar and causal: a real instant",
  "record.stamps.publication.kind":
    "consistency: declared with verified_as_issued, bounded_by_capture with capture_bounded",
  "record.stamps.publication.publishedAt":
    "calendar and causal: at or after the observation, at or before the capture",
  "record.stamps.capturedAt":
    "calendar and causal: at or after the publication",
  "record.stamps.forecastIssuedAt":
    "kind: required on a forecast record, and the origin the horizon is measured from",
  "record.stamps.validFrom":
    "validity: stated with validTo, well ordered, inside the declared horizon",
  "record.stamps.validTo": "validity: see validFrom",
  "record.stamps.intervalSeconds":
    "not a constraint: the producer's own cadence for this record, null where it states none",
  "record.stamps.revision":
    "not a constraint: an opaque label; two revisions are simply two records",
  "record.stamps.archiveClass": "ceiling: see entry.archiveClass",
});

describe("the admission gate covers every field both types declare", () => {
  /** Field paths of a value, descending into plain objects only. */
  function paths(prefix: string, value: object): string[] {
    return Object.entries(value).flatMap(([key, child]) =>
      child !== null &&
      typeof child === "object" &&
      !Array.isArray(child) &&
      !(child instanceof Date)
        ? paths(`${prefix}.${key}`, child)
        : [`${prefix}.${key}`],
    );
  }

  const declared = [
    ...paths("entry", SOURCE_LEDGER.kp),
    ...paths(
      "record",
      record({ observedIntervalEndAt: "2026-09-11T11:45:00.000Z" }),
    ),
  ].sort();

  it("names a rule or a reason for every declared field", () => {
    expect(declared.filter((field) => !(field in ADMISSION_COVERAGE))).toEqual(
      [],
    );
  });

  it("names no field that neither type carries", () => {
    expect(
      Object.keys(ADMISSION_COVERAGE).filter(
        (field) => !declared.includes(field),
      ),
    ).toEqual([]);
  });
});
