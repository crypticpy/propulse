import { describe, expect, it } from "vitest";
import resultCases from "@/lib/propagation/contracts/fixtures/result.cases.json";
import { findHead, parseResult } from "@/lib/propagation/contracts/result";
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
    // reports a margin rather than an uncalibrated percentage (M10).
    const value =
      decode?.state.availability === "available"
        ? (decode.state.value as Mutable)
        : undefined;
    expect(value?.probability).toBeNull();
    expect(value?.decoderVersion).toBe("2.7.0");
  });

  it("decodes the JSON no-power sentinel to -Infinity", () => {
    const outcome = parseResult(candidate("noPowerMode"));
    if (!outcome.ok) throw new Error("fixture must parse");
    const snr = findHead(outcome.value, "snr2500");
    const value =
      snr?.state.availability === "available"
        ? (snr.state.value as { snr2500Db: number })
        : undefined;
    expect(value?.snr2500Db).toBe(Number.NEGATIVE_INFINITY);
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
