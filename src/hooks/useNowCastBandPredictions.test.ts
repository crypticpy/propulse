import { describe, expect, it } from "vitest";
import {
  buildNowCastRequests,
  nowCastIssueBucket,
  summarizeNowCastResults,
} from "./useNowCastBandPredictions";
import {
  resolveFutureCastHorizons,
  resolveNowCastCapabilityAccess,
} from "@/lib/propagation/capabilityAccess";
import capabilitiesFixture from "../../ml/fixtures/propagation_capabilities_v1.json";
import type {
  PropagationCapabilitiesResponse,
  PropagationPrediction,
} from "@/lib/propagation/modelClient";

describe("nowCastIssueBucket", () => {
  it("advances on canonical five-minute boundaries", () => {
    expect(
      new Date(nowCastIssueBucket(Date.parse("2026-07-12T12:04:59Z"))).toISOString(),
    ).toBe("2026-07-12T12:00:00.000Z");
    expect(
      new Date(nowCastIssueBucket(Date.parse("2026-07-12T12:05:00Z"))).toISOString(),
    ).toBe("2026-07-12T12:05:00.000Z");
  });
});

describe("buildNowCastRequests", () => {
  it("builds privacy-safe station envelopes for every HF model band", () => {
    const requests = buildNowCastRequests(
      {
        origin: { grid: "EM10ab", lat: 30, lon: -97 },
        target: { grid: "IO91aa", lat: 51.5, lon: -0.1 },
        weather: { kp: 2, f107: 145 },
        weatherUpdatedAt: Date.parse("2026-07-12T11:55:00Z"),
        researchSubjectBinding: {
          schema_version: "propagation-research-subject-v1",
          expires_at: "2026-07-12T14:00:00Z",
          hmac_sha256: "a".repeat(64),
        },
        deriveEnvelope: (band, options) => ({
          featureContract: "station-chain-v1",
          chainFingerprint: `fixture:${band}`,
          band,
          frequencyMHz: 14.1,
          mode: "WSPR",
          requestedPowerWatts: 25,
          conductedPowerWatts: 20,
          powerAtAntennaWatts: 15,
          eirpWatts: 60,
          erpWatts: 36.6,
          totalPassiveLossDb: 1.2,
          feedlineLossDb: 1,
          inlineLossDb: 0.2,
          amplifierGainDb: 0,
          antennaGainTowardPathDbi: 6,
          targetBearingDeg: options?.targetBearingDeg ?? null,
          takeoffAngleDeg: null,
          receiverNoiseFloorDbm: -130,
          receiverEvidence: "independent_test",
          receiverEvidenceIsRelative: true,
          localSystemNoiseFloorDbm: null,
          modeBandwidthHz: 6,
          modeSnrThresholdDb: -28,
          supported: true,
          warningCodes: [],
          assumptions: ["fixture"],
        }),
      },
      new Date("2026-07-12T12:00:00Z"),
    );

    expect(requests).toHaveLength(10);
    expect(requests.map((request) => request.band)).toEqual([
      "160m", "80m", "60m", "40m", "30m",
      "20m", "17m", "15m", "12m", "10m",
    ]);
    expect(requests[0].origin_grid4).toBe("EM10");
    expect(requests[0].features.target_grid4).toBe("IO91");
    expect(requests[0].data_freshness_seconds).toEqual({ space_weather: 300 });
    expect(requests[0].station).not.toHaveProperty("radioId");
    expect(requests[0].features.values.power_bin_dbm).toBe(45);
    expect(requests[0].research_subject_binding).toEqual({
      schema_version: "propagation-research-subject-v1",
      expires_at: "2026-07-12T14:00:00Z",
      hmac_sha256: "a".repeat(64),
    });
  });

  it("threads the operator's mode into the request and station envelope", () => {
    const envelopeModes: string[] = [];
    const requests = buildNowCastRequests(
      {
        origin: { grid: "EM10ab", lat: 30, lon: -97 },
        target: { grid: "IO91aa", lat: 51.5, lon: -0.1 },
        mode: "ssb",
        deriveEnvelope: (_band, options) => {
          envelopeModes.push(options?.mode ?? "missing");
          return null;
        },
      },
      new Date("2026-07-12T12:00:00Z"),
    );

    expect(requests.every((request) => request.mode === "SSB")).toBe(true);
    expect(envelopeModes).toEqual(Array(10).fill("SSB"));
  });

  it("defaults the mode to WSPR when none is supplied", () => {
    const requests = buildNowCastRequests(
      {
        origin: { grid: "EM10ab", lat: 30, lon: -97 },
        target: { grid: "IO91aa", lat: 51.5, lon: -0.1 },
        deriveEnvelope: () => null,
      },
      new Date("2026-07-12T12:00:00Z"),
    );

    expect(requests.every((request) => request.mode === "WSPR")).toBe(true);
  });

  it("omits the station chain when only the core mode is activated", () => {
    const requests = buildNowCastRequests(
      {
        origin: { grid: "EM10ab", lat: 30, lon: -97 },
        target: { grid: "IO91aa", lat: 51.5, lon: -0.1 },
        deriveEnvelope: () => {
          throw new Error("station envelope must not be built");
        },
      },
      new Date("2026-07-12T12:00:00Z"),
      false,
    );

    expect(requests).toHaveLength(10);
    expect(requests.every((request) => request.station === undefined)).toBe(true);
    expect(requests.every((request) => request.declared_power_watts === 5)).toBe(true);
  });
});

describe("resolveNowCastCapabilityAccess", () => {
  const capabilities = capabilitiesFixture as PropagationCapabilitiesResponse;

  it("uses internal availability without claiming public release", () => {
    expect(resolveNowCastCapabilityAccess(capabilities, "internal")).toEqual({
      coreNowCast: true,
      stationCast: true,
    });
    expect(resolveNowCastCapabilityAccess(capabilities, "released")).toEqual({
      coreNowCast: false,
      stationCast: false,
    });
  });

  it("fails closed when execution or the model is unavailable", () => {
    expect(resolveNowCastCapabilityAccess(capabilities, "off")).toEqual({
      coreNowCast: false,
      stationCast: false,
    });
    expect(resolveNowCastCapabilityAccess({
      ...capabilities,
      model_loaded: false,
    }, "internal")).toEqual({
      coreNowCast: false,
      stationCast: false,
    });
  });
});

describe("resolveFutureCastHorizons", () => {
  const capabilities = capabilitiesFixture as PropagationCapabilitiesResponse;
  const withFutureCast = (
    futurecast: Partial<PropagationCapabilitiesResponse["modes"]["futurecast"]>,
  ): PropagationCapabilitiesResponse => ({
    ...capabilities,
    modes: {
      ...capabilities.modes,
      futurecast: { ...capabilities.modes.futurecast, ...futurecast },
    },
  });

  it("returns no horizons when futurecast is not activated", () => {
    expect(resolveFutureCastHorizons(capabilities, "internal")).toEqual([]);
    expect(resolveFutureCastHorizons(capabilities, "released")).toEqual([]);
  });

  it("grants every defined horizon in internal mode", () => {
    expect(resolveFutureCastHorizons(
      withFutureCast({ internal_available: true }),
      "internal",
    )).toEqual([3, 6, 12, 24]);
  });

  it("limits released mode to the released horizons", () => {
    expect(resolveFutureCastHorizons(
      withFutureCast({
        internal_available: true,
        released_eligible: true,
        released_horizons_hours: [3, 6],
      }),
      "released",
    )).toEqual([3, 6]);
  });

  it("fails closed when the service or model is unavailable", () => {
    const activated = withFutureCast({ internal_available: true });
    expect(resolveFutureCastHorizons(activated, "off")).toEqual([]);
    expect(resolveFutureCastHorizons(undefined, "internal")).toEqual([]);
    expect(resolveFutureCastHorizons(
      { ...activated, model_loaded: false },
      "internal",
    )).toEqual([]);
    expect(resolveFutureCastHorizons(
      { ...activated, runtime_activation_valid: false },
      "internal",
    )).toEqual([]);
  });
});

describe("summarizeNowCastResults", () => {
  it("reports mixed fallback, stale input, and partial request failures", () => {
    const base: PropagationPrediction = {
      model_version: "v4-test",
      feature_contract: "station-chain-v1",
      issue_time: "2026-07-16T12:00:00Z",
      valid_time: "2026-07-16T12:00:00Z",
      band: "20m",
      mode: "WSPR",
      target_grid4: "IO91",
      core_probability: 0.4,
      personalized_probability: 0.5,
      confidence: 0.7,
      ood_flags: [],
      data_freshness: {},
      top_factors: [],
      assumptions: [],
      profile: "nowcast",
    };
    const predictions = new Map<string, PropagationPrediction>([
      ["20m", base],
      ["40m", {
        ...base,
        band: "40m",
        profile: "physics",
        assumptions: ["path_history_stale_or_unavailable_physics_fallback"],
      }],
    ]);
    const errors = new Map([["80m", new Error("unavailable")]]);

    expect(summarizeNowCastResults(
      ["20m", "40m", "80m"],
      predictions,
      errors,
    )).toEqual({
      requestedCount: 3,
      failedCount: 1,
      partial: true,
      fallbackBands: ["40m"],
      staleInputBands: ["40m"],
      nowcastBands: ["20m"],
    });
  });
});
