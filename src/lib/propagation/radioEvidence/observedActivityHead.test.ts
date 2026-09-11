/**
 * Head projection (#1047, plan tests 15-21).
 *
 * The point of these tests is that the derivation is proven against the real
 * contract rather than against a hand-rolled idea of it: a projected head is
 * embedded in a result fixture and run through `parseResult`, so the M11/M24
 * coverage-to-evidence binding, the M02 as-issued interval rules and the
 * ownership table are exercised, not assumed.
 */

import { describe, expect, it } from "vitest";
import resultCases from "@/lib/propagation/contracts/fixtures/result.cases.json";
import {
  PAYLOAD_FIELD_OWNERSHIP,
  parseResult,
  payloadFieldNames,
  RESULT_SCHEMA_VERSION,
} from "@/lib/propagation/contracts/result";
import { QUANTITY_UNITS } from "@/lib/propagation/contracts/enums";
import { derivePathActivity } from "@/lib/propagation/radioEvidence/activityRecord";
import {
  OBSERVED_ACTIVITY_COVERAGE_ID,
  OBSERVED_ACTIVITY_READER_ID,
  projectObservedActivityHead,
} from "@/lib/propagation/radioEvidence/observedActivityHead";
import type {
  ObservedActivityEvidenceSource,
  ObservedActivityIdentity,
  PathActivityPairRow,
  PathActivityRecord,
  RadioEvidenceInputs,
} from "@/lib/propagation/radioEvidence/types";

type Mutable = Record<string, unknown>;

const cases = resultCases as unknown as Record<string, Mutable>;

const ISSUED_AT = "2026-09-11T18:00:00Z";

const WINDOW_HOURS = [
  "2026-09-11T12:00:00.000Z",
  "2026-09-11T13:00:00.000Z",
  "2026-09-11T14:00:00.000Z",
  "2026-09-11T15:00:00.000Z",
  "2026-09-11T16:00:00.000Z",
  "2026-09-11T17:00:00.000Z",
];

const IDENTITY: ObservedActivityIdentity = {
  contextId: "ctx-observed-activity-2026-09-11T18",
  effectiveModelId: OBSERVED_ACTIVITY_READER_ID,
  effectiveModelVersion: "1.0.0",
  sourceVersion: `sha256:${"e".repeat(64)}`,
  modelHash: `sha256:${"a".repeat(64)}`,
  preprocessingHash: `sha256:${"b".repeat(64)}`,
  featureHash: `sha256:${"c".repeat(64)}`,
  // The read cannot precede the end of the newest hour it saw: an hour's row
  // is written after that hour closes. The contract enforces the ordering
  // (observed, then published, then captured), so a fixture that pretended
  // otherwise would be rejected rather than quietly accepted.
  readAt: ISSUED_AT,
};

function pairRow(hour_utc: string, spot_count: number): PathActivityPairRow {
  return {
    hour_utc,
    mode_class: "digital",
    tx_field: "FN",
    rx_field: "IO",
    spot_count,
    unique_tx: 1,
    unique_rx: 2,
    backfilled_count: 0,
  };
}

function record(
  overrides: Partial<RadioEvidenceInputs> = {},
): PathActivityRecord {
  const pairRows = overrides.pairRows ?? [pairRow(WINDOW_HOURS[4], 6)];
  return derivePathActivity({
    band: "20m",
    txField: "FN",
    rxField: "IO",
    issuedAt: ISSUED_AT,
    readableHours: WINDOW_HOURS.map((hour_utc) => ({ hour_utc })),
    coverageRows: pairRows.map((row) => ({
      hour_utc: row.hour_utc,
      mode_class: row.mode_class,
      tx_field: row.tx_field,
      unique_rx: row.unique_rx,
    })),
    ...overrides,
    pairRows,
  });
}

/**
 * A one-head result carrying the projection. The reader is the result's own
 * effective model, so the head reports no fallback; `validAt` equals
 * `issuedAt` because an observation interval is anchored on `validAt` and may
 * not end after issuance, which pins all three instants together (M02).
 */
function resultWith(
  head: unknown,
  sources: readonly ObservedActivityEvidenceSource[],
): Mutable {
  const draft = structuredClone(cases.missingInput) as Mutable;
  draft.issuedAt = ISSUED_AT;
  draft.validAt = ISSUED_AT;
  draft.contextId = IDENTITY.contextId;
  draft.provenance = {
    ...(draft.provenance as Mutable),
    requestedModelId: null,
    requestedModelVersion: null,
    effectiveModelId: IDENTITY.effectiveModelId,
    effectiveModelVersion: IDENTITY.effectiveModelVersion,
    fallbackReason: null,
  };
  draft.evidence = { sources: structuredClone(sources) };
  draft.heads = [head];
  return draft;
}

describe("contract structural", () => {
  it("parses a verified-open projection inside a real result (test 15)", () => {
    const { head, evidenceSource } = projectObservedActivityHead(
      record(),
      IDENTITY,
    );

    const outcome = parseResult(resultWith(head, [evidenceSource]));

    expect(outcome.ok ? [] : outcome.issues).toEqual([]);
    expect(head.state.availability).toBe("available");
    expect(
      head.state.availability === "available" && head.state.value.count,
    ).toBe(6);
    expect(head.effectiveModelKind).toBe("observation_assisted");
    expect(head.calibrationId).toBeNull();
    expect(head.uncertainty).toEqual({ kind: "none" });
    expect(evidenceSource.sourceId).toBe(OBSERVED_ACTIVITY_COVERAGE_ID);
    expect(evidenceSource.eligible).toBe(true);
    expect(evidenceSource.sourceVersion).toBe(IDENTITY.sourceVersion);
  });

  it("parses a covered-silence projection as a zero, not a gap", () => {
    const silent = record({
      pairRows: [],
      coverageRows: [
        {
          hour_utc: WINDOW_HOURS[5],
          mode_class: "cw",
          tx_field: "JN",
          unique_rx: 3,
        },
      ],
    });
    const { head, evidenceSource } = projectObservedActivityHead(
      silent,
      IDENTITY,
    );

    expect(parseResult(resultWith(head, [evidenceSource])).ok).toBe(true);
    expect(head.state.availability).toBe("available");
    expect(
      head.state.availability === "available" && head.state.value.count,
    ).toBe(0);
  });

  it("anchors the interval on issuance and echoes its length (test 16)", () => {
    const activity = record();
    const { head } = projectObservedActivityHead(activity, IDENTITY);

    expect(head.state.availability).toBe("available");
    if (head.state.availability !== "available") return;
    const { intervalStartAt, intervalEndAt } = head.state.value;
    expect(Date.parse(intervalEndAt)).toBe(Date.parse(ISSUED_AT));
    expect(Date.parse(intervalStartAt)).toBe(
      Date.parse(ISSUED_AT) - activity.intervalSeconds * 1000,
    );
    expect(head.intervalSeconds).toBe(activity.intervalSeconds);
    expect(
      (Date.parse(intervalEndAt) - Date.parse(intervalStartAt)) / 1000,
    ).toBe(head.intervalSeconds);
    expect(Date.parse(head.validAt)).toBe(Date.parse(intervalEndAt));
  });

  it("rejects a coverage id that resolves to no eligible source (test 17)", () => {
    const { head, evidenceSource } = projectObservedActivityHead(
      record(),
      IDENTITY,
    );
    const excluded: ObservedActivityEvidenceSource = {
      ...evidenceSource,
      eligible: false,
      exclusionReason: "source_outside_age_limit",
    };

    const outcome = parseResult(resultWith(head, [excluded]));

    expect(outcome.ok).toBe(false);
    const reasons = outcome.ok ? [] : outcome.issues.map((i) => i.reason);
    expect(reasons.join()).toMatch(/not an eligible evidence source/);
  });

  it("projects an unknown record as missing_input with no value (test 18)", () => {
    const unknown = record({ pairRows: [], coverageRows: [] });
    const { head, evidenceSource } = projectObservedActivityHead(
      unknown,
      IDENTITY,
    );

    expect(unknown.state).toBe("unknown");
    expect(head.state.availability).toBe("missing_input");
    expect("value" in head.state).toBe(false);
    expect(
      head.state.availability === "missing_input" && head.state.reason,
    ).toBe("no_receiver_coverage");
    expect(head.uncertainty).toEqual({ kind: "none" });
    expect(parseResult(resultWith(head, [evidenceSource])).ok).toBe(true);

    // M11: an unavailable head carrying an interval is still rejected if it
    // pretends to an uncertainty it cannot have.
    const faked = structuredClone(head) as unknown as Mutable;
    faked.uncertainty = {
      kind: "model_spread",
      intervalKind: "central",
      coverageProbability: 0.8,
      low: 0,
      high: 5,
    };
    expect(parseResult(resultWith(faked, [evidenceSource])).ok).toBe(false);
  });

  it("declares an ineligible source when no hour is readable", () => {
    const gapped = record({ readableHours: [], coverageRows: [] });
    const { head, evidenceSource } = projectObservedActivityHead(
      gapped,
      IDENTITY,
    );

    expect(
      head.state.availability === "missing_input" && head.state.reason,
    ).toBe("aggregate_hour_not_readable");
    // The census still names what was considered, and says why it was not
    // usable, rather than dropping the source silently (M02, M24).
    expect(evidenceSource.eligible).toBe(false);
    expect(evidenceSource.exclusionReason).toBe(
      "no_readable_aggregate_hour_in_window",
    );
    expect(evidenceSource.observedIntervalEndAt).toBeNull();
    expect(parseResult(resultWith(head, [evidenceSource])).ok).toBe(true);
  });

  it("emits exactly the payload fields the ownership table owns (test 19)", () => {
    const { head } = projectObservedActivityHead(record(), IDENTITY);

    expect(head.state.availability).toBe("available");
    if (head.state.availability !== "available") return;
    const emitted = Object.keys(head.state.value).sort();
    expect(emitted).toEqual([...payloadFieldNames("observed_activity")].sort());
    expect(emitted).toEqual(
      PAYLOAD_FIELD_OWNERSHIP.observed_activity
        .map((entry) => entry.field)
        .sort(),
    );
  });

  it("leaves the result schema version alone (test 20)", () => {
    // This leaf adds a producer, not a wire field. If a later round tries to
    // slip a payload field in, test 19 fails here and this line states why a
    // bump was never needed.
    expect(RESULT_SCHEMA_VERSION).toBe("propagation-result-0.2.0");
  });
});

describe("units", () => {
  it("takes its units from the contract, not a literal (test 21)", () => {
    const { head } = projectObservedActivityHead(record(), IDENTITY);

    expect(head.units).toBe(QUANTITY_UNITS.observed_activity);
    expect(head.units).toBe("count");
  });
});
