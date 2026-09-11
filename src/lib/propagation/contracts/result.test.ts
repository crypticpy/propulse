import { describe, expect, it } from "vitest";
import resultCases from "@/lib/propagation/contracts/fixtures/result.cases.json";
import { findHead, parseResult } from "@/lib/propagation/contracts/result";
import capabilityCases from "@/lib/propagation/contracts/fixtures/capability.cases.json";
import { parseCapability } from "@/lib/propagation/contracts/capability";
import {
  CALIBRATION_REQUIRED_QUANTITIES,
  QUANTITY_UNITS,
} from "@/lib/propagation/contracts/enums";
import type { ContractIssue } from "@/lib/propagation/contracts/validation";

type Mutable = Record<string, unknown>;

const cases = resultCases as unknown as Record<string, Mutable>;

/** The artefact digests the result fixtures pin (M24). */
const MODEL_HASH = `sha256:${"a".repeat(64)}`;
const PREPROCESSING_HASH = `sha256:${"b".repeat(64)}`;
const FEATURE_HASH = `sha256:${"c".repeat(64)}`;

/** Frozen protocol rows the substituted scalar heads sit on (M11). */
const EVENT_ROW = {
  domain: "versioned_event_population",
  horizon: "current",
  mechanismFamily: "event_head",
};
const GROUNDWAVE_ROW = {
  domain: "characterized_fixed_path",
  horizon: "climatology",
  mechanismFamily: "groundwave",
};
const BURST_ROW = {
  domain: "known_exposure_interval",
  horizon: "current",
  mechanismFamily: "meteor",
};
const PASS_ROW = {
  domain: "qualified_ephemeris_horizon",
  horizon: "forecast_seconds",
  mechanismFamily: "satellite",
};
const LUNAR_ROW = {
  domain: "qualified_lunar_station",
  horizon: "forecast_seconds",
  mechanismFamily: "eme",
};

function candidate(name: string): Mutable {
  return structuredClone(cases[name]) as Mutable;
}

function heads(value: Mutable): Mutable[] {
  return value.heads as Mutable[];
}

function headFor(value: Mutable, quantity: string): Mutable {
  const found = heads(value).find((head) => head.quantity === quantity);
  if (!found) throw new Error(`fixture has no ${quantity} head`);
  return found;
}

function issues(value: unknown): ContractIssue[] {
  const outcome = parseResult(value);
  expect(outcome.ok).toBe(false);
  return outcome.ok ? [] : outcome.issues;
}

function reasonsAt(value: unknown, path: string): string[] {
  return issues(value)
    .filter((issue) => issue.path === path)
    .map((issue) => issue.reason);
}

/**
 * The fullHfCircuit result with its SNR head replaced by a head for another
 * scalar quantity, so one interval rule can be exercised per payload type.
 */
function scalarHeadCase(
  quantity: string,
  units: string,
  payload: Mutable,
  row: { domain: string; horizon: string; mechanismFamily: string },
): { result: Mutable; head: Mutable } {
  const result = structuredClone(cases.fullHfCircuit) as Mutable;
  const head = (result.heads as Mutable[])[1];
  head.quantity = quantity;
  head.units = units;
  // Every value-bearing head names a frozen protocol row, so the substituted
  // quantity carries the row the protocol actually defines for it (M11).
  head.domain = row.domain;
  head.horizon = row.horizon;
  head.mechanismFamily = row.mechanismFamily;
  head.calibrationId = null;
  (head.state as Mutable).value = payload;
  return { result, head };
}

/**
 * The fullHfCircuit draft with no power reaching the receiver: the SNR head
 * carries the sentinel and the circuit-support head publishes the matching
 * state for the same mechanism, so the two heads agree (M07).
 */
function noPower(draft: Mutable): Mutable {
  const snr = headFor(draft, "snr2500");
  (snr.state as Mutable).value = {
    ...((snr.state as Mutable).value as Mutable),
    support: "geometrically_unsupported",
    snr2500Db: "-Infinity",
  };
  snr.uncertainty = { kind: "none" };
  const support = headFor(draft, "circuit_support");
  ((support.state as Mutable).value as Mutable).modes = [
    {
      modeId: "2F2",
      mechanism: "ground_sky_coherent",
      support: "geometrically_unsupported",
    },
  ];
  return draft;
}

/**
 * fullHfCircuit with a no-power SNR head and a decode head reporting the given
 * probability and no margin.
 */
function noPowerDecodeCase(probability: number | null): Mutable {
  const draft = noPower(candidate("fullHfCircuit"));
  const decode = headFor(draft, "conditional_decode");
  if (probability === null) {
    // A value-bearing decode head must report a margin or a probability, and
    // the sentinel SNR forbids the margin, so "no number at all" is spelled as
    // a typed unavailability rather than as two nulls.
    decode.calibrationId = null;
    decode.state = {
      availability: "unsupported",
      reason: "no_power_reaches_the_decoder",
    };
    return draft;
  }
  decode.calibrationId = "decode-cal-v1";
  (decode.state as Mutable).value = {
    ...((decode.state as Mutable).value as Mutable),
    marginDb: null,
    probability,
  };
  return draft;
}

describe("parseResult fixtures", () => {
  it.each(Object.keys(cases))("round-trips the %s fixture", (name) => {
    const outcome = parseResult(candidate(name));
    expect(outcome.ok ? [] : outcome.issues).toEqual([]);
    if (!outcome.ok) return;
    // Parsing an already-parsed result is idempotent: the normalized no-power
    // sentinel is still a legal input and nothing else was rewritten.
    const again = parseResult(structuredClone(outcome.value));
    expect(again.ok ? [] : again.issues).toEqual([]);
    expect(again.ok && again.value).toEqual(outcome.value);
    expect(Object.isFrozen(outcome.value)).toBe(true);
  });

  it("keeps the three probability events as distinct typed heads", () => {
    const outcome = parseResult(candidate("fullHfCircuit"));
    if (!outcome.ok) throw new Error("fixture must parse");
    const network = findHead(outcome.value, "network_detection");
    const decode = findHead(outcome.value, "conditional_decode");
    const qso = findHead(outcome.value, "completed_qso");
    expect(network?.state.availability).toBe("missing_input");
    expect(qso?.state.availability).toBe("unavailable");
    expect(decode?.state.availability).toBe("available");
    // The decode head is conditioned on a named decoder and duration, and it
    // reports a margin rather than an uncalibrated percentage (M10). The head
    // narrows to its own payload type, so no cast is needed here.
    if (decode?.state.availability !== "available") {
      throw new Error("the fixture's decode head is available");
    }
    expect(decode.state.value.probability).toBeNull();
    expect(decode.state.value.decoderVersion).toBe("2.7.0");
    expect(decode.state.value.observationSeconds).toBe(15);
  });

  it("decodes the JSON no-power sentinel to -Infinity", () => {
    const outcome = parseResult(candidate("noPowerMode"));
    if (!outcome.ok) throw new Error("fixture must parse");
    const snr = findHead(outcome.value, "snr2500");
    if (snr?.state.availability !== "available") {
      throw new Error("the fixture's SNR head is available");
    }
    expect(snr.state.value.snr2500Db).toBe(Number.NEGATIVE_INFINITY);
    expect(snr.state.value.support).toBe("geometrically_unsupported");
  });
});

describe("parseResult fails closed", () => {
  it("rejects non-objects and an empty head list without throwing", () => {
    expect(parseResult(null).ok).toBe(false);
    const empty = candidate("fullHfCircuit");
    empty.heads = [];
    expect(parseResult(empty).ok).toBe(false);
  });

  it("rejects a finite SNR on a mode that carries no power (M07)", () => {
    const bad = candidate("noPowerMode");
    (headFor(bad, "snr2500").state as Mutable).value = {
      ...((headFor(bad, "snr2500").state as Mutable).value as Mutable),
      snr2500Db: -40,
    };
    expect(reasonsAt(bad, "heads[1].state.value.snr2500Db").join()).toMatch(
      /requires the -Infinity sentinel/,
    );
  });

  it("rejects the no-power sentinel on a supported mode (M07)", () => {
    const bad = candidate("fullHfCircuit");
    const state = headFor(bad, "snr2500").state as Mutable;
    state.value = { ...(state.value as Mutable), snr2500Db: "-Infinity" };
    expect(reasonsAt(bad, "heads[1].state.value.snr2500Db").join()).toMatch(
      /requires a finite SNR2500/,
    );
  });

  it("rejects NaN and +Infinity as an SNR", () => {
    for (const value of [Number.NaN, Number.POSITIVE_INFINITY, "Infinity"]) {
      const bad = candidate("fullHfCircuit");
      const state = headFor(bad, "snr2500").state as Mutable;
      state.value = { ...(state.value as Mutable), snr2500Db: value };
      expect(parseResult(bad).ok).toBe(false);
    }
  });

  it("rejects an unavailable head that smuggles a value", () => {
    const bad = candidate("fullHfCircuit");
    (headFor(bad, "network_detection").state as Mutable).value = 0;
    expect(parseResult(bad).ok).toBe(false);
  });

  it("rejects an unavailable head that carries an uncertainty interval", () => {
    const bad = candidate("fullHfCircuit");
    headFor(bad, "completed_qso").uncertainty = {
      kind: "model_spread",
      intervalKind: "central",
      coverageProbability: 0.8,
      low: 0,
      high: 1,
    };
    expect(reasonsAt(bad, "heads[4].uncertainty.kind").join()).toMatch(
      /cannot carry an uncertainty interval/,
    );
  });

  it("rejects a probability outside [0, 1]", () => {
    const bad = candidate("fullHfCircuit");
    const state = headFor(bad, "network_detection").state as Mutable;
    state.availability = "available";
    delete state.reason;
    state.value = {
      probability: 1.4,
      modelEventId: "nowcast-detection",
      exposureCellId: "gg-1deg-4212",
      populationVersion: "v2",
      bucketStartAt: "2026-09-11T19:00:00Z",
      bucketEndAt: "2026-09-11T20:00:00Z",
    };
    expect(reasonsAt(bad, "heads[3].state.value.probability").join()).toMatch(
      /less than or equal to 1/,
    );
  });

  it("rejects units that do not match the protocol quantity", () => {
    const bad = candidate("fullHfCircuit");
    headFor(bad, "snr2500").units = "S-units";
    expect(reasonsAt(bad, "heads[1].units").join()).toMatch(/measured in dB/);
  });

  it("rejects a completed-QSO probability that is not the conditional chain (M22)", () => {
    const bad = candidate("fullHfCircuit");
    const state = headFor(bad, "completed_qso").state as Mutable;
    state.availability = "available";
    delete state.reason;
    headFor(bad, "completed_qso").calibrationId = "qso-chain-cal-v1";
    state.value = {
      probability: 0.5,
      pActivity: 0.5,
      pLinkGivenActivity: 0.5,
      pCompletionGivenLink: 0.5,
      attemptProtocolId: "session-crossover-v1",
    };
    expect(reasonsAt(bad, "heads[4].state.value.probability").join()).toMatch(
      /product of its conditional factors/,
    );
  });

  it("rejects a numeric decode probability without a calibration identity (M10)", () => {
    const bad = candidate("fullHfCircuit");
    const head = headFor(bad, "conditional_decode");
    const state = head.state as Mutable;
    state.value = { ...(state.value as Mutable), probability: 0.62 };
    expect(reasonsAt(bad, "heads[2].calibrationId").join()).toMatch(
      /requires a calibration identity/,
    );
  });

  it("rejects a calibrated interval without a calibration identity (M17)", () => {
    const bad = candidate("fullHfCircuit");
    const head = headFor(bad, "snr2500");
    head.uncertainty = {
      kind: "calibrated_predictive_interval",
      intervalKind: "central",
      coverageProbability: 0.8,
      low: 3.2,
      high: 17.4,
    };
    expect(reasonsAt(bad, "heads[1].calibrationId").join()).toMatch(
      /calibrated predictive interval/,
    );
  });

  it("rejects an inverted uncertainty interval", () => {
    const bad = candidate("fullHfCircuit");
    headFor(bad, "snr2500").uncertainty = {
      kind: "native_reference_decile",
      intervalKind: "central",
      coverageProbability: 0.8,
      low: 17.4,
      high: 3.2,
    };
    expect(reasonsAt(bad, "heads[1].uncertainty.low").join()).toMatch(
      /exceeds its high bound/,
    );
  });

  it("rejects a coverage probability of 0 or 1", () => {
    for (const coverage of [0, 1]) {
      const bad = candidate("fullHfCircuit");
      headFor(bad, "snr2500").uncertainty = {
        kind: "native_reference_decile",
        intervalKind: "central",
        coverageProbability: coverage,
        low: 3.2,
        high: 17.4,
      };
      expect(parseResult(bad).ok).toBe(false);
    }
  });

  it("requires a fallback reason when the effective model is not the requested one (M19)", () => {
    const bad = candidate("partialFallback");
    (bad.provenance as Mutable).fallbackReason = null;
    expect(reasonsAt(bad, "provenance.fallbackReason").join()).toMatch(
      /must name its fallback reason/,
    );
  });

  it("rejects a fallback reason when the requested model was served", () => {
    const bad = candidate("fullHfCircuit");
    (bad.provenance as Mutable).fallbackReason = "requested_model_unavailable";
    expect(reasonsAt(bad, "provenance.fallbackReason").join()).toMatch(
      /no fallback to report/,
    );
  });

  it("requires a head served by another model to declare its own fallback", () => {
    const bad = candidate("fullHfCircuit");
    headFor(bad, "network_detection").effectiveModelId = "n5-nowcast";
    expect(reasonsAt(bad, "heads[3].fallbackReason").join()).toMatch(
      /own fallback reason/,
    );
  });

  it("rejects an eligible source published after the issue time (M02)", () => {
    const bad = candidate("fullHfCircuit");
    const sources = (bad.evidence as Mutable).sources as Mutable[];
    sources[0].publishedAt = "2026-09-11T18:30:00Z";
    expect(reasonsAt(bad, "evidence.sources[0].publishedAt").join()).toMatch(
      /no later than issuedAt/,
    );
  });

  it("rejects an eligible source with unknown availability history (M02)", () => {
    const bad = candidate("fullHfCircuit");
    const sources = (bad.evidence as Mutable).sources as Mutable[];
    sources[0].capturedAt = null;
    expect(reasonsAt(bad, "evidence.sources[0].capturedAt").join()).toMatch(
      /ineligible for as-issued use/,
    );
  });

  it("rejects an excluded source with no exclusion reason", () => {
    const bad = candidate("fullHfCircuit");
    const sources = (bad.evidence as Mutable).sources as Mutable[];
    sources[1].exclusionReason = null;
    expect(
      reasonsAt(bad, "evidence.sources[1].exclusionReason").join(),
    ).toMatch(/must name why it was excluded/);
  });

  it("rejects two heads for the same quantity", () => {
    const bad = candidate("partialFallback");
    heads(bad).push(structuredClone(headFor(bad, "snr2500")));
    expect(reasonsAt(bad, "heads[2].quantity").join()).toMatch(
      /Duplicate head/,
    );
  });

  it("rejects a head answering a different time slice than the result (M02)", () => {
    const mixed = candidate("fullHfCircuit");
    // The 24-hour view evaluates 24 labelled instants; a second slice is its
    // own result, not another head on this one.
    headFor(mixed, "snr2500").validAt = "2026-09-11T20:00:00Z";
    expect(reasonsAt(mixed, "heads[1].validAt").join()).toMatch(
      /answers the result's valid time/,
    );
  });

  it("accepts a head whose valid time is the same instant in another offset", () => {
    const spelled = candidate("fullHfCircuit");
    // Same instant as the result's 19:00Z, written with a +01:00 offset.
    headFor(spelled, "snr2500").validAt = "2026-09-11T20:00:00+01:00";
    const outcome = parseResult(spelled);
    expect(outcome.ok ? [] : outcome.issues).toEqual([]);
  });

  it("accepts a decode margin that equals SNR2500 minus the threshold (M10)", () => {
    const good = candidate("fullHfCircuit");
    const outcome = parseResult(good);
    expect(outcome.ok ? [] : outcome.issues).toEqual([]);
  });

  it("rejects a decode margin inconsistent with the SNR head (M10)", () => {
    const bad = candidate("fullHfCircuit");
    ((headFor(bad, "snr2500").state as Mutable).value as Mutable).snr2500Db =
      10;
    const decode = (headFor(bad, "conditional_decode").state as Mutable)
      .value as Mutable;
    decode.thresholdSnr2500Db = 4;
    decode.marginDb = 100;
    expect(reasonsAt(bad, "heads[2].state.value.marginDb").join()).toMatch(
      /minus the declared threshold/,
    );
  });

  it("rejects a repeated mode identity in a circuit-support payload (M07)", () => {
    const bad = candidate("fullHfCircuit");
    const modes = (
      (headFor(bad, "circuit_support").state as Mutable).value as Mutable
    ).modes as Mutable[];
    const twin = structuredClone(modes[0]);
    twin.support = "screened";
    modes.push(twin);
    expect(
      reasonsAt(
        bad,
        `heads[0].state.value.modes[${modes.length - 1}].modeId`,
      ).join(),
    ).toMatch(/Duplicate mode identity/);
  });

  it("accepts one mode on two different mechanisms", () => {
    const good = candidate("fullHfCircuit");
    const modes = (
      (headFor(good, "circuit_support").state as Mutable).value as Mutable
    ).modes as Mutable[];
    const twin = structuredClone(modes[0]);
    twin.mechanism = twin.mechanism === "regular_ef" ? "es" : "regular_ef";
    modes.push(twin);
    const outcome = parseResult(good);
    expect(outcome.ok ? [] : outcome.issues).toEqual([]);
  });

  it("rejects an inconsistent margin against an experimental SNR head (M10)", () => {
    const bad = candidate("fullHfCircuit");
    const snr = headFor(bad, "snr2500");
    (snr.state as Mutable).availability = "experimental";
    ((snr.state as Mutable).value as Mutable).snr2500Db = 10;
    const decode = (headFor(bad, "conditional_decode").state as Mutable)
      .value as Mutable;
    decode.thresholdSnr2500Db = 4;
    decode.marginDb = 100;
    expect(reasonsAt(bad, "heads[2].state.value.marginDb").join()).toMatch(
      /minus the declared threshold/,
    );
  });

  it("accepts a consistent margin on an experimental decode head (M10)", () => {
    const good = candidate("fullHfCircuit");
    const decodeHead = headFor(good, "conditional_decode");
    (decodeHead.state as Mutable).availability = "experimental";
    const outcome = parseResult(good);
    expect(outcome.ok ? [] : outcome.issues).toEqual([]);
  });

  it("accepts the fixture's eligible source age of 3600 seconds (M02)", () => {
    const outcome = parseResult(candidate("fullHfCircuit"));
    expect(outcome.ok ? [] : outcome.issues).toEqual([]);
  });

  it("rejects an eligible source age that contradicts its timestamps (M02)", () => {
    const bad = candidate("fullHfCircuit");
    ((bad.evidence as Mutable).sources as Mutable[])[0].ageSeconds = 0;
    expect(reasonsAt(bad, "evidence.sources[0].ageSeconds").join()).toMatch(
      /issuedAt minus observedIntervalEndAt/,
    );
  });

  it("rejects an eligible source with no age (M02)", () => {
    const bad = candidate("fullHfCircuit");
    ((bad.evidence as Mutable).sources as Mutable[])[0].ageSeconds = null;
    expect(reasonsAt(bad, "evidence.sources[0].ageSeconds").join()).toMatch(
      /must state its age as issued/,
    );
  });

  it("still accepts a null age on an ineligible source", () => {
    const good = candidate("fullHfCircuit");
    const sources = (good.evidence as Mutable).sources as Mutable[];
    expect(sources[1].eligible).toBe(false);
    expect(sources[1].ageSeconds).toBeNull();
    const outcome = parseResult(good);
    expect(outcome.ok ? [] : outcome.issues).toEqual([]);
  });

  it("accepts a decode head when the result carries no SNR head", () => {
    const good = candidate("fullHfCircuit");
    good.heads = heads(good).filter((head) => head.quantity !== "snr2500");
    const decode = (headFor(good, "conditional_decode").state as Mutable)
      .value as Mutable;
    decode.marginDb = 100;
    const outcome = parseResult(good);
    expect(outcome.ok ? [] : outcome.issues).toEqual([]);
  });

  it("rejects a value-bearing head of a calibration-required quantity with no calibration", () => {
    for (const quantity of CALIBRATION_REQUIRED_QUANTITIES) {
      const bad = candidate("fullHfCircuit");
      const head = heads(bad)[1];
      head.quantity = quantity;
      head.units = QUANTITY_UNITS[quantity];
      head.calibrationId = null;
      (head.state as Mutable).value = {
        probability: 0.06,
        pActivity: 0.3,
        pLinkGivenActivity: 0.4,
        pCompletionGivenLink: 0.5,
        attemptProtocolId: "call-and-answer-v1",
      };
      expect(reasonsAt(bad, "heads[1].calibrationId").join()).toMatch(
        /requires a calibration identity/,
      );
    }
  });

  it("rejects an uncalibrated decode head that carries an interval (M10)", () => {
    const bad = candidate("fullHfCircuit");
    const head = headFor(bad, "conditional_decode");
    expect(((head.state as Mutable).value as Mutable).probability).toBeNull();
    head.uncertainty = {
      kind: "model_spread",
      intervalKind: "central",
      coverageProbability: 0.8,
      low: 0.2,
      high: 0.8,
    };
    expect(reasonsAt(bad, "heads[2].uncertainty.kind").join()).toMatch(
      /reports a margin, not an interval/,
    );
  });

  it("accepts an uncalibrated decode head with no interval (M10)", () => {
    const outcome = parseResult(candidate("fullHfCircuit"));
    expect(outcome.ok ? [] : outcome.issues).toEqual([]);
  });

  it("rejects an instant whose offset cannot be parsed", () => {
    const bad = candidate("fullHfCircuit");
    bad.validAt = "2026-09-11T19:00:00+24:00";
    expect(reasonsAt(bad, "validAt").join()).toMatch(/real offset/);
  });

  it("accepts an instant written with a half-hour offset", () => {
    const good = candidate("fullHfCircuit");
    good.issuedAt = "2026-09-11T23:30:00+05:30";
    good.validAt = "2026-09-12T00:30:00+05:30";
    for (const head of heads(good)) head.validAt = good.validAt;
    const outcome = parseResult(good);
    expect(outcome.ok ? [] : outcome.issues).toEqual([]);
  });

  it("rejects a probability interval that leaves [0, 1]", () => {
    const bad = candidate("fullHfCircuit");
    const head = headFor(bad, "conditional_decode");
    head.calibrationId = "ft8-decode-calibration-0.1.0";
    ((head.state as Mutable).value as Mutable).probability = 0.5;
    head.uncertainty = {
      kind: "model_spread",
      intervalKind: "central",
      coverageProbability: 0.8,
      low: -0.2,
      high: 1.2,
    };
    expect(reasonsAt(bad, "heads[2].uncertainty.low").join()).toMatch(
      /inside \[0, 1\]/,
    );
  });

  it("rejects a probability interval that does not bracket the point", () => {
    const bad = candidate("fullHfCircuit");
    const head = headFor(bad, "conditional_decode");
    head.calibrationId = "ft8-decode-calibration-0.1.0";
    ((head.state as Mutable).value as Mutable).probability = 0.9;
    head.uncertainty = {
      kind: "model_spread",
      intervalKind: "central",
      coverageProbability: 0.8,
      low: 0.3,
      high: 0.7,
    };
    expect(reasonsAt(bad, "heads[2].uncertainty.high").join()).toMatch(
      /bracket the reported value/,
    );
  });

  const SPREAD = {
    kind: "model_spread",
    intervalKind: "central",
    coverageProbability: 0.8,
  };

  it("rejects a numeric interval on the non-scalar quantities (M17)", () => {
    for (const quantity of ["circuit_support", "pass_geometry"] as const) {
      const bad = candidate("fullHfCircuit");
      const head = (bad.heads as Mutable[])[0];
      head.quantity = quantity;
      head.units = QUANTITY_UNITS[quantity];
      if (quantity === "pass_geometry") {
        (head.state as Mutable).value = {
          aosAt: "2026-09-11T19:00:00Z",
          losAt: "2026-09-11T19:10:00Z",
          timingUncertaintySeconds: 2,
          ephemerisAgeSeconds: 900,
          horizonDeg: 5,
        };
      }
      head.uncertainty = { ...SPREAD, low: 0.2, high: 0.8 };
      expect(reasonsAt(bad, "heads[0].uncertainty.kind").join()).toMatch(
        /no scalar to bracket/,
      );
    }
  });

  it("accepts the non-scalar quantities with uncertainty kind none (M17)", () => {
    const good = candidate("fullHfCircuit");
    const head = (good.heads as Mutable[])[0];
    expect(head.quantity).toBe("circuit_support");
    expect((head.uncertainty as Mutable).kind).toBe("none");
    expect(parseResult(good).ok).toBe(true);

    head.quantity = "pass_geometry";
    head.units = QUANTITY_UNITS.pass_geometry;
    head.domain = "qualified_ephemeris_horizon";
    head.horizon = "forecast_seconds";
    head.mechanismFamily = "satellite";
    (head.state as Mutable).value = {
      aosAt: "2026-09-11T19:00:00Z",
      losAt: "2026-09-11T19:10:00Z",
      timingUncertaintySeconds: 2,
      ephemerisAgeSeconds: 900,
      horizonDeg: 5,
    };
    const outcome = parseResult(good);
    expect(outcome.ok ? [] : outcome.issues).toEqual([]);
  });

  it("rejects an SNR interval that does not bracket the SNR (M17)", () => {
    const bad = candidate("fullHfCircuit");
    const head = headFor(bad, "snr2500");
    ((head.state as Mutable).value as Mutable).snr2500Db = 10;
    head.uncertainty = { ...SPREAD, low: 20, high: 30 };
    expect(reasonsAt(bad, "heads[1].uncertainty.low").join()).toMatch(
      /bracket the reported value/,
    );
  });

  it("accepts an SNR interval around the SNR (M17)", () => {
    const good = candidate("fullHfCircuit");
    const head = headFor(good, "snr2500");
    head.uncertainty = { ...SPREAD, low: 6, high: 14 };
    const outcome = parseResult(good);
    expect(outcome.ok ? [] : outcome.issues).toEqual([]);
  });

  it("rejects a finite decode margin against a no-power SNR (M07, M10)", () => {
    const bad = noPower(candidate("fullHfCircuit"));
    expect(reasonsAt(bad, "heads[2].state.value.marginDb").join()).toMatch(
      /no-power SNR2500 leaves the decode margin undefined/,
    );
  });

  it("accepts a null decode margin against a no-power SNR (M07, M10)", () => {
    const good = noPower(candidate("fullHfCircuit"));
    const decode = headFor(good, "conditional_decode");
    decode.calibrationId = "decode-cal-v1";
    (decode.state as Mutable).value = {
      ...((decode.state as Mutable).value as Mutable),
      marginDb: null,
      probability: 0,
    };
    const outcome = parseResult(good);
    expect(outcome.ok ? [] : outcome.issues).toEqual([]);
  });

  it("rejects a decode probability above zero against a no-power SNR (M07, M10)", () => {
    const bad = noPowerDecodeCase(0.4);
    expect(reasonsAt(bad, "heads[2].state.value.probability").join()).toMatch(
      /no decode probability above zero/,
    );
  });

  it("accepts a decode probability of zero against a no-power SNR (M07, M10)", () => {
    const outcome = parseResult(noPowerDecodeCase(0));
    expect(outcome.ok ? [] : outcome.issues).toEqual([]);
  });

  it("accepts an unavailable decode head against a no-power SNR (M07, M10)", () => {
    const outcome = parseResult(noPowerDecodeCase(null));
    expect(outcome.ok ? [] : outcome.issues).toEqual([]);
  });

  it("still accepts the no-power head, which carries no interval (M07)", () => {
    const outcome = parseResult(candidate("noPowerMode"));
    expect(outcome.ok ? [] : outcome.issues).toEqual([]);
  });

  it("rejects an interval drawn around the no-power sentinel (M07)", () => {
    const bad = candidate("noPowerMode");
    headFor(bad, "snr2500").uncertainty = { ...SPREAD, low: -200, high: -100 };
    expect(
      issues(bad)
        .map((issue) => issue.reason)
        .join(),
    ).toMatch(/no-power head carries no uncertainty/);
  });

  it("rejects a count interval that does not bracket the count (M17)", () => {
    const bad = scalarHeadCase(
      "observed_activity",
      "count",
      {
        count: 4,
        intervalStartAt: "2026-09-11T18:00:00Z",
        intervalEndAt: "2026-09-11T19:00:00Z",
        sourceCoverageIds: ["pskreporter-2026-09-11"],
      },
      EVENT_ROW,
    );
    (bad.head.uncertainty as Mutable) = { ...SPREAD, low: 10, high: 20 };
    expect(reasonsAt(bad.result, "heads[1].uncertainty.low").join()).toMatch(
      /bracket the reported value/,
    );
  });

  it("rejects a field-strength interval that does not bracket it (M17)", () => {
    const bad = scalarHeadCase(
      "field_strength",
      "dBuV_per_m",
      {
        fieldStrengthDbuvPerM: 32.5,
        polarization: "vertical",
        heightMeters: 10,
        heightDatum: "above_ground_level",
        measurementBandwidthHz: 2500,
      },
      GROUNDWAVE_ROW,
    );
    (bad.head.uncertainty as Mutable) = { ...SPREAD, low: 40, high: 50 };
    expect(reasonsAt(bad.result, "heads[1].uncertainty.low").join()).toMatch(
      /bracket the reported value/,
    );
  });

  it("rejects a Doppler interval that does not bracket it (M17)", () => {
    const bad = scalarHeadCase(
      "doppler",
      "Hz",
      {
        dopplerHz: -1200,
        transmittedFrequencyHz: 145950000,
        signConvention: "positive_receding",
      },
      LUNAR_ROW,
    );
    (bad.head.uncertainty as Mutable) = { ...SPREAD, low: 100, high: 200 };
    expect(reasonsAt(bad.result, "heads[1].uncertainty.low").join()).toMatch(
      /bracket the reported value/,
    );
  });

  it("accepts a Doppler interval that does bracket it (M17)", () => {
    const good = scalarHeadCase(
      "doppler",
      "Hz",
      {
        dopplerHz: -1200,
        transmittedFrequencyHz: 145950000,
        signConvention: "positive_receding",
      },
      LUNAR_ROW,
    );
    (good.head.uncertainty as Mutable) = {
      ...SPREAD,
      low: -1400,
      high: -1000,
    };
    const outcome = parseResult(good.result);
    expect(outcome.ok ? [] : outcome.issues).toEqual([]);
  });

  it("accepts a probability interval inside [0, 1] around the point", () => {
    const good = candidate("fullHfCircuit");
    const head = headFor(good, "conditional_decode");
    head.calibrationId = "ft8-decode-calibration-0.1.0";
    ((head.state as Mutable).value as Mutable).probability = 0.5;
    head.uncertainty = {
      kind: "model_spread",
      intervalKind: "central",
      coverageProbability: 0.8,
      low: 0.3,
      high: 0.7,
    };
    const outcome = parseResult(good);
    expect(outcome.ok ? [] : outcome.issues).toEqual([]);
  });

  it("rejects a valid time with sub-millisecond precision", () => {
    const bad = candidate("fullHfCircuit");
    bad.validAt = "2026-09-11T19:00:00.0001Z";
    expect(reasonsAt(bad, "validAt").join()).toMatch(
      /at most millisecond precision/,
    );
  });

  it("rejects a mixed requested model id and version", () => {
    const bad = candidate("fullHfCircuit");
    (bad.provenance as Mutable).requestedModelVersion = null;
    expect(reasonsAt(bad, "provenance.requestedModelVersion").join()).toMatch(
      /both an id and a version/,
    );
  });

  it("rejects a requested model version with no requested model id", () => {
    const bad = candidate("missingInput");
    (bad.provenance as Mutable).requestedModelVersion = "1.0.0";
    expect(reasonsAt(bad, "provenance.requestedModelVersion").join()).toMatch(
      /both an id and a version/,
    );
  });

  it("rejects a head belonging to another context", () => {
    const bad = candidate("fullHfCircuit");
    headFor(bad, "snr2500").contextId = "ctx-other-view";
    expect(reasonsAt(bad, "heads[1].contextId").join()).toMatch(
      /belongs to the result's context/,
    );
  });

  it("rejects an observation interval with no declared source coverage", () => {
    const bad = candidate("missingInput");
    heads(bad).push({
      quantity: "observed_activity",
      units: "count",
      domain: "versioned_event_population",
      horizon: "current",
      mechanismFamily: "event_head",
      contextId: bad.contextId,
      validAt: bad.validAt,
      effectiveModelId: "propulse-physics-v1",
      effectiveModelVersion: "1.0.0",
      modelHash: MODEL_HASH,
      preprocessingHash: PREPROCESSING_HASH,
      featureHash: FEATURE_HASH,
      calibrationId: null,
      assumptions: [],
      fallbackReason: null,
      uncertainty: { kind: "none" },
      state: {
        availability: "available",
        value: {
          count: 0,
          intervalStartAt: "2026-09-11T17:00:00Z",
          intervalEndAt: "2026-09-11T18:00:00Z",
          sourceCoverageIds: [],
        },
      },
    });
    expect(
      reasonsAt(bad, "heads[1].state.value.sourceCoverageIds").join(),
    ).toMatch(/at least 1/);
  });

  it("rejects a satellite pass whose loss of signal precedes acquisition", () => {
    const bad = candidate("missingInput");
    heads(bad)[0] = {
      ...heads(bad)[0],
      quantity: "pass_geometry",
      units: "seconds",
      domain: "qualified_ephemeris_horizon",
      state: {
        availability: "available",
        value: {
          aosAt: "2026-09-11T19:10:00Z",
          losAt: "2026-09-11T19:02:00Z",
          timingUncertaintySeconds: 2,
          ephemerisAgeSeconds: 43200,
          horizonDeg: 0,
        },
      },
    };
    expect(reasonsAt(bad, "heads[0].state.value.losAt").join()).toMatch(
      /must follow acquisition/,
    );
  });

  it("requires a fallback reason when only the head's model version differs (M19)", () => {
    const bad = candidate("fullHfCircuit");
    headFor(bad, "snr2500").effectiveModelVersion = "1.1.0";
    expect(reasonsAt(bad, "heads[1].fallbackReason").join()).toMatch(
      /own fallback reason/,
    );
  });

  it("rejects a non-integer observation count", () => {
    const bad = candidate("missingInput");
    heads(bad)[0] = {
      ...heads(bad)[0],
      quantity: "observed_activity",
      units: "count",
      state: {
        availability: "available",
        value: {
          count: 2.5,
          intervalStartAt: "2026-09-11T17:00:00Z",
          intervalEndAt: "2026-09-11T18:00:00Z",
          sourceCoverageIds: ["pskreporter"],
        },
      },
    };
    expect(reasonsAt(bad, "heads[0].state.value.count").join()).toMatch(
      /integer/i,
    );
  });

  it("rejects a served head that does not pin its artefacts (M24)", () => {
    for (const field of [
      "modelHash",
      "preprocessingHash",
      "featureHash",
    ] as const) {
      const bad = candidate("fullHfCircuit");
      headFor(bad, "snr2500")[field] = null;
      expect(reasonsAt(bad, `heads[1].${field}`).join()).toMatch(
        new RegExp(`must pin its ${field} for replay`),
      );
    }
  });

  it("lets an unavailable head omit its artefact hashes (M24)", () => {
    const outcome = parseResult(candidate("fullHfCircuit"));
    if (!outcome.ok) throw new Error("fixture must parse");
    const qso = findHead(outcome.value, "completed_qso");
    expect(qso?.state.availability).toBe("unavailable");
    expect(qso?.modelHash).toBeNull();
    expect(qso?.featureHash).toBeNull();
  });

  it("rejects an artefact hash that is not sha256 (M24)", () => {
    const bad = candidate("fullHfCircuit");
    headFor(bad, "snr2500").featureHash = "sha1:deadbeef";
    expect(reasonsAt(bad, "heads[1].featureHash").join()).toMatch(
      /sha256: followed by 64 lowercase hex digits/,
    );
    const spaced = candidate("fullHfCircuit");
    spaced.provenance = {
      ...(spaced.provenance as Mutable),
      capabilityDigest: `${MODEL_HASH} `,
    };
    expect(reasonsAt(spaced, "provenance.capabilityDigest").join()).toMatch(
      /no leading or trailing whitespace/,
    );
  });

  it("requires the serving capability digest in provenance (M24)", () => {
    const bad = candidate("fullHfCircuit");
    const provenance = { ...(bad.provenance as Mutable) };
    delete provenance.capabilityDigest;
    bad.provenance = provenance;
    expect(
      issues(bad).some((issue) => issue.path === "provenance.capabilityDigest"),
    ).toBe(true);
  });

  it("does not bind the M10 margin across different artefacts (M24)", () => {
    // Same model id and version, different weights: the two heads are not one
    // replayable model, so the decode margin is not the SNR's margin.
    const drifted = candidate("fullHfCircuit");
    const decode = headFor(drifted, "conditional_decode");
    (decode.state as Mutable).value = {
      ...((decode.state as Mutable).value as Mutable),
      marginDb: 99,
    };
    decode.modelHash = `sha256:${"e".repeat(64)}`;
    const outcome = parseResult(drifted);
    expect(outcome.ok ? [] : outcome.issues).toEqual([]);

    const sameArtefacts = candidate("fullHfCircuit");
    const sameDecode = headFor(sameArtefacts, "conditional_decode");
    (sameDecode.state as Mutable).value = {
      ...((sameDecode.state as Mutable).value as Mutable),
      marginDb: 99,
    };
    expect(
      reasonsAt(sameArtefacts, "heads[2].state.value.marginDb").join(),
    ).toMatch(/SNR2500 minus the declared threshold/);
  });
  it("rejects a served head on a tuple the protocol never froze (M11)", () => {
    const bad = candidate("fullHfCircuit");
    // regular_ef is a frozen mechanism, but the protocol froze no
    // circuit_support row for it on this domain and horizon.
    headFor(bad, "circuit_support").mechanismFamily = "regular_ef";
    expect(reasonsAt(bad, "heads[0].mechanismFamily").join()).toMatch(
      /The protocol defines no circuit_support on characterized_fixed_path at climatology via regular_ef \(M11\)/,
    );
  });

  it("a capability with no feature artefact could serve no accepted head (M24)", () => {
    // The result contract rejects a served head with no feature digest, so a
    // capability that pins none can never produce an acceptable result.
    const served = candidate("fullHfCircuit");
    headFor(served, "snr2500").featureHash = null;
    expect(reasonsAt(served, "heads[1].featureHash").join()).toMatch(
      /must pin its featureHash for replay \(M24\)/,
    );

    const declaration = structuredClone(
      capabilityCases.hfPhysics,
    ) as unknown as Mutable;
    const head = (declaration.heads as Mutable[])[0];
    head.featureSchemaId = null;
    head.featureHash = null;
    const outcome = parseCapability(declaration);
    expect(outcome.ok).toBe(false);
    expect(
      outcome.ok ? [] : outcome.issues.map((issue) => issue.path),
    ).toContain("heads[0].featureHash");
  });

  it("rejects a loss component itemised and already included (M08)", () => {
    const bad = candidate("fullHfCircuit");
    const payload = (headFor(bad, "snr2500").state as Mutable).value as Mutable;
    payload.alreadyIncludedMechanisms = ["excess_absorption"];
    expect(
      reasonsAt(bad, "heads[1].state.value.losses[1].componentId").join(),
    ).toMatch(/itemised and also declared already included/);
  });

  it("rejects two loss components at different reference planes (M09)", () => {
    const bad = candidate("fullHfCircuit");
    const payload = (headFor(bad, "snr2500").state as Mutable).value as Mutable;
    (payload.losses as Mutable[])[1].referencePlane =
      "transmitter_output_to_antenna_input";
    expect(
      reasonsAt(bad, "heads[1].state.value.losses[1].referencePlane").join(),
    ).toMatch(/not at the head's plane/);
  });

  it("rejects a repeated loss component id (M08)", () => {
    const bad = candidate("fullHfCircuit");
    const payload = (headFor(bad, "snr2500").state as Mutable).value as Mutable;
    (payload.losses as Mutable[])[1].componentId = "basic_transmission_loss";
    expect(
      reasonsAt(bad, "heads[1].state.value.losses[1].componentId").join(),
    ).toMatch(/is itemised twice/);
  });

  it("rejects a repeated already-included mechanism (M08)", () => {
    const bad = candidate("fullHfCircuit");
    const payload = (headFor(bad, "snr2500").state as Mutable).value as Mutable;
    payload.alreadyIncludedMechanisms = [
      "itu_reference_cd172be_regular_modes",
      "itu_reference_cd172be_regular_modes",
    ];
    expect(
      reasonsAt(
        bad,
        "heads[1].state.value.alreadyIncludedMechanisms[1]",
      ).join(),
    ).toMatch(/declared already included twice/);
  });

  it("rejects a noise floor stated at another plane (M09)", () => {
    const bad = candidate("fullHfCircuit");
    const payload = (headFor(bad, "snr2500").state as Mutable).value as Mutable;
    payload.noiseFloorReferencePlane = "transmitter_output_to_antenna_input";
    expect(
      reasonsAt(bad, "heads[1].state.value.noiseFloorReferencePlane").join(),
    ).toMatch(/an SNR is a ratio at one plane/);
  });

  it("requires a decode margin when a same-model SNR head is present (M10)", () => {
    const bad = candidate("fullHfCircuit");
    const decode = headFor(bad, "conditional_decode");
    decode.calibrationId = "ft8-decode-calibration-0.1.0";
    (decode.state as Mutable).value = {
      ...((decode.state as Mutable).value as Mutable),
      marginDb: null,
      probability: 0.42,
    };
    expect(reasonsAt(bad, "heads[2].state.value.marginDb").join()).toMatch(
      /beside a finite same-model SNR2500 must report the margin \(M10\)/,
    );
  });

  it("does not bind the M10 margin across different preprocessing artefacts (M24)", () => {
    const drifted = candidate("fullHfCircuit");
    const decode = headFor(drifted, "conditional_decode");
    (decode.state as Mutable).value = {
      ...((decode.state as Mutable).value as Mutable),
      marginDb: 99,
    };
    decode.preprocessingHash = `sha256:${"f".repeat(64)}`;
    const outcome = parseResult(drifted);
    expect(outcome.ok ? [] : outcome.issues).toEqual([]);
  });

  it("rejects an SNR support state the circuit-support head contradicts (M07)", () => {
    const bad = candidate("fullHfCircuit");
    const payload = (headFor(bad, "snr2500").state as Mutable).value as Mutable;
    payload.support = "above_basic_muf_with_loss";
    expect(reasonsAt(bad, "heads[1].state.value.support").join()).toMatch(
      /circuit-support head reports supported, screened for mechanism ground_sky_coherent/,
    );
  });

  it("does not cross-check support across different models (M07, M24)", () => {
    // A result may serve one head from a fallback model. Two models are
    // entitled to disagree about whether the circuit carries power; only one
    // model contradicting itself is a contract violation.
    const mixed = candidate("fullHfCircuit");
    const snr = headFor(mixed, "snr2500");
    ((snr.state as Mutable).value as Mutable).support =
      "above_basic_muf_with_loss";
    snr.effectiveModelId = "propulse-ml-nowcast";
    snr.modelHash = `sha256:${"9".repeat(64)}`;
    snr.fallbackReason = "requested_model_unavailable";
    const outcome = parseResult(mixed);
    expect(outcome.ok ? [] : outcome.issues).toEqual([]);

    // The same contradiction from the result's own model is still rejected.
    const sameModel = candidate("fullHfCircuit");
    (
      (headFor(sameModel, "snr2500").state as Mutable).value as Mutable
    ).support = "above_basic_muf_with_loss";
    expect(reasonsAt(sameModel, "heads[1].state.value.support").join()).toMatch(
      /circuit-support head reports supported, screened for mechanism ground_sky_coherent/,
    );
  });

  it("rejects an observed interval that ends after issuance (M02)", () => {
    // The fixture is issued at 18:00Z; an observation running to 19:00Z would
    // be reporting reports that did not exist when the result was issued.
    const bad = scalarHeadCase(
      "observed_activity",
      "count",
      {
        count: 4,
        intervalStartAt: "2026-09-11T17:30:00Z",
        intervalEndAt: "2026-09-11T19:00:00Z",
        sourceCoverageIds: ["pskreporter-2026-09-11"],
      },
      EVENT_ROW,
    );
    (bad.head.uncertainty as Mutable) = { kind: "none" };
    expect(
      reasonsAt(bad.result, "heads[1].state.value.intervalEndAt").join(),
    ).toMatch(/ends no later than issuedAt/);

    const good = structuredClone(bad.result);
    (
      ((good.heads as Mutable[])[1].state as Mutable).value as Mutable
    ).intervalEndAt = "2026-09-11T18:00:00Z";
    const outcome = parseResult(good);
    expect(outcome.ok ? [] : outcome.issues).toEqual([]);
  });

  it("accepts a detection bucket that follows issuance (M02)", () => {
    // The bucket is the forecast horizon itself, not something observed.
    const good = candidate("fullHfCircuit");
    const detection = headFor(good, "network_detection");
    const served = headFor(good, "snr2500");
    detection.modelHash = served.modelHash;
    detection.preprocessingHash = served.preprocessingHash;
    detection.featureHash = served.featureHash;
    detection.state = {
      availability: "available",
      value: {
        probability: 0.3,
        modelEventId: "model-event-2026-09-11T19",
        exposureCellId: "cell-em12",
        populationVersion: "pskreporter-population-2026-09",
        bucketStartAt: "2026-09-11T19:00:00Z",
        bucketEndAt: "2026-09-11T20:00:00Z",
      },
    };
    const outcome = parseResult(good);
    expect(outcome.ok ? [] : outcome.issues).toEqual([]);
  });

  it("accepts a burst exposure window that follows issuance (M02)", () => {
    const good = scalarHeadCase(
      "usable_burst",
      "probability",
      {
        probability: 0.2,
        criterionId: "msk144-decode-criterion-0.1.0",
        intervalStartAt: "2026-09-11T19:00:00Z",
        intervalEndAt: "2026-09-11T19:15:00Z",
      },
      BURST_ROW,
    );
    (good.head.uncertainty as Mutable) = { kind: "none" };
    const outcome = parseResult(good.result);
    expect(outcome.ok ? [] : outcome.issues).toEqual([]);
  });

  it("accepts a predicted pass that follows issuance (M02, A21)", () => {
    const good = scalarHeadCase(
      "pass_geometry",
      "seconds",
      {
        aosAt: "2026-09-11T19:00:00Z",
        losAt: "2026-09-11T19:10:00Z",
        timingUncertaintySeconds: 2,
        ephemerisAgeSeconds: 900,
        horizonDeg: 5,
      },
      PASS_ROW,
    );
    (good.head.uncertainty as Mutable) = { kind: "none" };
    const outcome = parseResult(good.result);
    expect(outcome.ok ? [] : outcome.issues).toEqual([]);
  });

  it("accepts an excluded source captured after issuance (M02, M24)", () => {
    // An excluded entry is a census of what was considered: recording that a
    // later revision exists and was not substituted is the point of M24.
    const good = candidate("fullHfCircuit");
    const sources = (good.evidence as Mutable).sources as Mutable[];
    const excluded = sources.find((source) => source.eligible === false);
    if (!excluded) throw new Error("fixture must carry an excluded source");
    excluded.capturedAt = "2026-09-11T19:30:00Z";
    excluded.publishedAt = "2026-09-11T19:30:00Z";
    const outcome = parseResult(good);
    expect(outcome.ok ? [] : outcome.issues).toEqual([]);

    // The same stamp on an eligible source is still refused.
    const bad = candidate("fullHfCircuit");
    const eligible = ((bad.evidence as Mutable).sources as Mutable[]).find(
      (source) => source.eligible === true,
    );
    if (!eligible) throw new Error("fixture must carry an eligible source");
    eligible.capturedAt = "2026-09-11T19:30:00Z";
    expect(
      issues(bad)
        .filter((issue) => issue.path.endsWith("capturedAt"))
        .map((issue) => issue.reason)
        .join(),
    ).toMatch(/no later than issuedAt/);
  });

  it("rejects an eligible source whose version is not a pinned digest (M24)", () => {
    const bad = candidate("fullHfCircuit");
    const sources = (bad.evidence as Mutable).sources as Mutable[];
    const eligible = sources.find((source) => source.eligible === true);
    if (!eligible) throw new Error("fixture must carry an eligible source");
    eligible.sourceVersion = "2026-09-11T17:30Z";
    expect(
      issues(bad)
        .filter((issue) => issue.path.endsWith("sourceVersion"))
        .map((issue) => issue.reason)
        .join(),
    ).toMatch(/pins its version as a sha256 digest \(M24\)/);
  });

  it("rejects a requested-model fallback reason when no model was requested (M19)", () => {
    const bad = candidate("fullHfCircuit");
    (bad.provenance as Mutable).requestedModelId = null;
    (bad.provenance as Mutable).requestedModelVersion = null;
    (bad.provenance as Mutable).fallbackReason = "requested_model_unavailable";
    expect(reasonsAt(bad, "provenance.fallbackReason").join()).toMatch(
      /reports on a requested model, but no model was requested \(M19\)/,
    );
  });

  it("rejects two evidence entries for the same source (M11)", () => {
    const bad = candidate("fullHfCircuit");
    const sources = (bad.evidence as Mutable).sources as Mutable[];
    sources.push(structuredClone(sources[0]));
    expect(
      reasonsAt(bad, `evidence.sources[${sources.length - 1}].sourceId`).join(),
    ).toMatch(/Duplicate evidence entry for source/);
  });

  it("rejects a field-strength height with no datum (A02)", () => {
    const bad = scalarHeadCase(
      "field_strength",
      "dBuV_per_m",
      {
        fieldStrengthDbuvPerM: 32.5,
        polarization: "vertical",
        heightMeters: 10,
        heightDatum: "unknown",
        measurementBandwidthHz: 2500,
      },
      GROUNDWAVE_ROW,
    );
    (bad.head.uncertainty as Mutable) = { kind: "none" };
    expect(
      reasonsAt(bad.result, "heads[1].state.value.heightDatum").join(),
    ).toMatch(/must name the datum its height is measured against \(A02\)/);
  });

  it("rejects a request key that is not the M01 digest form (M01)", () => {
    const bad = candidate("fullHfCircuit");
    bad.requestKey = "ctx-hf-path-2026-09-11T18";
    expect(reasonsAt(bad, "requestKey").join()).toMatch(
      /64 lowercase hex digits of its SHA-256 digest \(M01\)/,
    );
  });

  it("rejects a fallback reason on a head served by the result's effective model (M19)", () => {
    const bad = candidate("fullHfCircuit");
    headFor(bad, "snr2500").fallbackReason = "requested_model_unavailable";
    expect(reasonsAt(bad, "heads[1].fallbackReason").join()).toMatch(
      /served by the result's effective model reports no fallback reason \(M19\)/,
    );
  });

  it("rejects a repeated assumption on a head (M11)", () => {
    const bad = candidate("fullHfCircuit");
    headFor(bad, "snr2500").assumptions = [
      "quiet_geomagnetic_conditions",
      "quiet_geomagnetic_conditions",
    ];
    expect(reasonsAt(bad, "heads[1].assumptions[1]").join()).toMatch(
      /declared twice; an assumption holds or it does not \(M11\)/,
    );
  });
});
