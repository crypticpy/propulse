import { describe, expect, it } from "vitest";
import { buildNowCastRequests } from "./useNowCastBandPredictions";

describe("buildNowCastRequests", () => {
  it("builds privacy-safe station envelopes and forces stale-history fallback", () => {
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
    expect(requests[0].origin_grid4).toBe("EM10");
    expect(requests[0].features.target_grid4).toBe("IO91");
    expect(requests[0].data_freshness_seconds?.path_history).toBeGreaterThan(7200);
    expect(requests[0].station).not.toHaveProperty("radioId");
    expect(requests[0].features.values.power_bin_dbm).toBe(45);
    expect(requests[0].research_subject_binding).toEqual({
      schema_version: "propagation-research-subject-v1",
      expires_at: "2026-07-12T14:00:00Z",
      hmac_sha256: "a".repeat(64),
    });
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
