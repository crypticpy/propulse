/**
 * PROP-02 (#948) regression tests: the signal/noise/support/status outputs of
 * the physics engine must not contradict each other. Each case reproduces a
 * defect recorded in the #945 physical-core audit (inputs quoted verbatim) and
 * is red on the pre-fix engine.
 */

import { describe, it, expect } from "vitest";
import {
  calculateConfidenceInterval,
  calculateExpectedSNR,
  getSignalClass,
  predictSignalStrength,
  MODE_PARAMETERS,
} from "./signal";
import { DEFAULT_NOISE_ENVIRONMENT } from "./noiseModel";
import { getEnhancedBandConditions, classifyPathStatus } from "./bands";
import type { OperatingMode } from "../../types/signal";

// Audit case: 40N 0E -> 41N 0E (111 km, one near-vertical hop), equinox noon.
const NOON = new Date(Date.UTC(2026, 2, 20, 12, 0, 0));
const AUDIT_PATH = { homeLat: 40, homeLon: 0, targetLat: 41, targetLon: 0 };

function auditConditions(mode: "FT8" | "SSB", txPowerWatts = 100) {
  return getEnhancedBandConditions(
    AUDIT_PATH.homeLat,
    AUDIT_PATH.homeLon,
    AUDIT_PATH.targetLat,
    AUDIT_PATH.targetLon,
    2, // Kp
    150, // SFI
    NOON,
    txPowerWatts,
    mode,
    0,
    "rural",
  );
}

describe("PROP-02 noise-environment policy (M09/M10)", () => {
  it("an omitted noise environment is the declared default, not a second noise model", () => {
    // Audit: omitted gave +35.0 dB, any explicit environment about -12 dB (47 dB swing).
    const omitted = calculateExpectedSNR(100, 140, "FT8", 0, 14);
    const explicitDefault = calculateExpectedSNR(
      100,
      140,
      "FT8",
      0,
      14,
      "residential",
    );
    expect(DEFAULT_NOISE_ENVIRONMENT).toBe("residential");
    expect(omitted).toBe(explicitDefault);
  });

  it("an assumed environment stays distinguishable from a specified one", () => {
    const assumed = predictSignalStrength(14, 3000, 1, 5, 100, "FT8", 0);
    const specified = predictSignalStrength(
      14,
      3000,
      1,
      5,
      100,
      "FT8",
      0,
      "residential",
    );
    expect(assumed.noise.source).toBe("assumed");
    expect(specified.noise.source).toBe("specified");
    expect(assumed.noise.environment).toBe(specified.noise.environment);
    expect(assumed.noise.referenceBandwidthHz).toBe(2500);
    expect(assumed.expectedSNR).toBe(specified.expectedSNR);
  });

  it("10x transmit power moves the budget by exactly 10 dB", () => {
    const p100 = calculateExpectedSNR(100, 140, "CW", 0, 14, "rural");
    const p1000 = calculateExpectedSNR(1000, 140, "CW", 0, 14, "rural");
    expect(p1000 - p100).toBeCloseTo(10, 6);
  });
});

describe("PROP-02 unsupported ordinary modes contribute no power (M07)", () => {
  it("the audit 20 m hop that exceeds MUF is not excellent and carries no power", () => {
    for (const mode of ["FT8", "SSB"] as const) {
      const band20 = auditConditions(mode).find((c) => c.band === "20m");
      expect(band20).toBeDefined();
      expect(band20!.notes).toContain("MUF exceeded");
      expect(band20!.status).toBe("closed");
      expect(band20!.signalPrediction?.support).toBe("above_basic_muf");
      expect(band20!.signalPrediction?.expectedSNR).toBe(
        Number.NEGATIVE_INFINITY,
      );
      expect(band20!.signalPrediction?.signalClass).toBe("none");
      expect(band20!.sUnit?.value).toBe(0);
      expect(band20!.snrEstimate).toBeLessThanOrEqual(-30);
    }
  });

  it("10x power does not change circuit support", () => {
    const at100 = auditConditions("FT8");
    const at1000 = auditConditions("FT8", 1000);
    for (const c100 of at100) {
      const c1000 = at1000.find((c) => c.band === c100.band)!;
      expect(c1000.signalPrediction?.support).toBe(
        c100.signalPrediction?.support,
      );
      if (c100.signalPrediction?.support === "supported") {
        expect(
          c1000.signalPrediction!.expectedSNR -
            c100.signalPrediction!.expectedSNR,
        ).toBeCloseTo(10, 6);
      } else {
        expect(c1000.status).toBe("closed");
      }
    }
  });

  it("a band is closed exactly when it is unsupported or below the mode threshold", () => {
    const scenarios = [
      { lat2: 41, lon2: 0, date: NOON },
      { lat2: 40, lon2: 20, date: NOON },
      {
        lat2: 51.5,
        lon2: -0.1,
        date: new Date(Date.UTC(2026, 2, 20, 0, 0, 0)),
      },
      { lat2: -33.9, lon2: 151.2, date: NOON },
    ];
    for (const mode of ["FT8", "SSB"] as const) {
      for (const s of scenarios) {
        const conditions = getEnhancedBandConditions(
          40,
          0,
          s.lat2,
          s.lon2,
          2,
          70,
          s.date,
          100,
          mode,
          0,
        );
        for (const c of conditions) {
          const pred = c.signalPrediction!;
          const closedByCircuit =
            pred.support !== "supported" || pred.signalClass === "none";
          expect(c.status === "closed", `${mode} ${c.band} ${c.notes}`).toBe(
            closedByCircuit,
          );
        }
      }
    }
  });
});

describe("PROP-02 status uses the selected mode sensitivity", () => {
  it("maps the one signal-class ladder onto path status", () => {
    const modes: OperatingMode[] = ["SSB", "CW", "FT8", "RTTY"];
    for (const mode of modes) {
      const t = MODE_PARAMETERS[mode].minSNR;
      expect(classifyPathStatus(t + 20, mode)).toBe("excellent");
      expect(classifyPathStatus(t + 10, mode)).toBe("good");
      expect(classifyPathStatus(t + 3, mode)).toBe("fair");
      expect(classifyPathStatus(t - 3, mode)).toBe("poor");
      expect(classifyPathStatus(t - 3.1, mode)).toBe("closed");
      expect(getSignalClass(t + 20, mode)).toBe("strong");
    }
  });

  it("an SNR that is excellent for FT8 is closed for SSB", () => {
    // -10 dB in 2500 Hz: FT8 margin +11 (good), SSB margin -13 (closed).
    expect(classifyPathStatus(-10, "FT8")).toBe("good");
    expect(classifyPathStatus(-10, "SSB")).toBe("closed");
  });
});

describe("PROP-02 uncertainty bounds are ordered and contain the point", () => {
  const params = {
    distanceKm: 3000,
    hops: 1,
    snrMargin: 30,
    kp: 2,
    sfi: 150,
    frequency: 14,
    mufRatio: 0.4,
  };

  it("audit case: a 40 dB point estimate no longer returns [38.3, 30]", () => {
    const r = calculateConfidenceInterval(params, 85, 40);
    expect(r.snrLow).toBeLessThanOrEqual(40);
    expect(r.snrHigh).toBeGreaterThanOrEqual(40);
    expect(r.snrLow).toBeLessThan(r.snrHigh);
  });

  it("holds across the SNR range, including far below the old -30 dB clip", () => {
    for (const base of [-80, -45, -30.05, -10, 0, 29.95, 40, 77.2]) {
      const r = calculateConfidenceInterval(params, 85, base);
      expect(r.snrLow, `low at ${base}`).toBeLessThanOrEqual(base);
      expect(r.snrHigh, `high at ${base}`).toBeGreaterThanOrEqual(base);
    }
  });

  it("the enhanced band result keeps center inside its displayed range", () => {
    for (const c of auditConditions("SSB")) {
      const p = c.signalPrediction!;
      expect(p.snrLow!, c.band).toBeLessThanOrEqual(c.snrEstimate);
      expect(p.snrHigh!, c.band).toBeGreaterThanOrEqual(c.snrEstimate);
    }
  });
});
