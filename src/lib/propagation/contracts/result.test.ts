import { describe, expect, it } from "vitest";
import resultCases from "@/lib/propagation/contracts/fixtures/result.cases.json";
import { findHead, parseResult } from "@/lib/propagation/contracts/result";
import {
  CALIBRATION_REQUIRED_QUANTITIES,
  QUANTITY_UNITS,
} from "@/lib/propagation/contracts/enums";
import type { ContractIssue } from "@/lib/propagation/contracts/validation";

type Mutable = Record<string, unknown>;

const cases = resultCases as unknown as Record<string, Mutable>;

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
): { result: Mutable; head: Mutable } {
  const result = structuredClone(cases.fullHfCircuit) as Mutable;
  const head = (result.heads as Mutable[])[1];
  head.quantity = quantity;
  head.units = units;
  head.calibrationId = null;
  (head.state as Mutable).value = payload;
  return { result, head };
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
    const bad = scalarHeadCase("observed_activity", "count", {
      count: 4,
      intervalStartAt: "2026-09-11T18:00:00Z",
      intervalEndAt: "2026-09-11T19:00:00Z",
      sourceCoverageIds: ["pskreporter-2026-09-11"],
    });
    (bad.head.uncertainty as Mutable) = { ...SPREAD, low: 10, high: 20 };
    expect(reasonsAt(bad.result, "heads[1].uncertainty.low").join()).toMatch(
      /bracket the reported value/,
    );
  });

  it("rejects a field-strength interval that does not bracket it (M17)", () => {
    const bad = scalarHeadCase("field_strength", "dBuV_per_m", {
      fieldStrengthDbuvPerM: 32.5,
      polarization: "vertical",
      heightMeters: 10,
      measurementBandwidthHz: 2500,
    });
    (bad.head.uncertainty as Mutable) = { ...SPREAD, low: 40, high: 50 };
    expect(reasonsAt(bad.result, "heads[1].uncertainty.low").join()).toMatch(
      /bracket the reported value/,
    );
  });

  it("rejects a Doppler interval that does not bracket it (M17)", () => {
    const bad = scalarHeadCase("doppler", "Hz", {
      dopplerHz: -1200,
      transmittedFrequencyHz: 145950000,
      signConvention: "positive_receding",
    });
    (bad.head.uncertainty as Mutable) = { ...SPREAD, low: 100, high: 200 };
    expect(reasonsAt(bad.result, "heads[1].uncertainty.low").join()).toMatch(
      /bracket the reported value/,
    );
  });

  it("accepts a Doppler interval that does bracket it (M17)", () => {
    const good = scalarHeadCase("doppler", "Hz", {
      dopplerHz: -1200,
      transmittedFrequencyHz: 145950000,
      signConvention: "positive_receding",
    });
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
      domain: "known_exposure_interval",
      contextId: bad.contextId,
      validAt: bad.validAt,
      effectiveModelId: "propulse-physics-v1",
      effectiveModelVersion: "1.0.0",
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
});
