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
  calculateReferenceNoise,
  getSignalClass,
  predictSignalStrength,
  MODE_PARAMETERS,
} from "./signal";
import { DEFAULT_NOISE_ENVIRONMENT } from "./noiseModel";
import { getEnhancedBandConditions, classifyPathStatus } from "./bands";
import {
  getAlternateBands,
  getBestTimeWindows,
  getOptimalBand,
} from "./recommendations";
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

/**
 * Physical constants recomputed here from their primary definitions, so a
 * change to signal.ts cannot silently redefine them. k is the exact SI value
 * fixed by the 2019 redefinition; T0 = 290 K is the ITU-R P.372 noise-factor
 * reference temperature; 2500 Hz is the WSJT-X reference bandwidth the mode
 * thresholds are quoted in.
 */
const BOLTZMANN_J_PER_K = 1.380649e-23;
const T0_KELVIN = 290;
const REFERENCE_BANDWIDTH_HZ = 2500;
const KT0_DBM_PER_HZ = 10 * Math.log10((BOLTZMANN_J_PER_K * T0_KELVIN) / 1e-3);
const KT0B_DBM = KT0_DBM_PER_HZ + 10 * Math.log10(REFERENCE_BANDWIDTH_HZ);

/**
 * The ITU-R P.372 noise factor is not reproducible from a one-line formula:
 * the atmospheric term is the CCIR Report 322 numerical world map. These
 * values come from the ITU-R Study Group 3 reference implementation, run
 * natively over its own coefficient files -- the same provenance as the
 * fixtures in `src/lib/propagation/noise/p372Noise.test.ts`, which is where
 * the port is pinned case by case. Here they exist so a change to signal.ts
 * cannot silently redefine the floor the rest of this file reasons about.
 *
 * Receiver: Austin (30.27 N, 97.74 W), March, residential.
 */
const AUSTIN = { latitude: 30.27, longitude: -97.74, month: 3 };
/** 18 UTC = 12 h receiver local mean time. */
const AUSTIN_NOON = { ...AUSTIN, utcHour: 18 };
/** 06 UTC = 00 h receiver local mean time. */
const AUSTIN_MIDNIGHT = { ...AUSTIN, utcHour: 6 };

/**
 * Reference Fa (dB above kT0b) for the cases used below: the plain power sum
 * of the reference's FaA, FaM and FaG medians, which is the convention
 * `P533/CircuitReliability.c` forms the SNR against and therefore the one the
 * noise floor must use. The section 8 `FamT` for the same four cases is
 * 42.376513 / 41.315448 / 49.214435 / 55.158271 -- up to 0.5 dB away, pinned
 * separately in `p372Noise.test.ts`.
 */
const REFERENCE_FA = {
  noon14MHz: 42.158187,
  midnight14MHz: 41.808076,
  noon7MHz: 49.111587,
  midnight7MHz: 55.467055,
} as const;

describe("PROP-02 noise plane is kT0B + Fa (M09/M10)", () => {
  it("pins kT0 and kT0B in the 2500 Hz reference bandwidth", () => {
    // k*T0 / 1 mW = 4.00388e-18 -> -173.9752 dBm/Hz (the usual "-174").
    expect(KT0_DBM_PER_HZ).toBeCloseTo(-173.9752, 4);
    expect(KT0B_DBM).toBeCloseTo(-139.9958, 4);

    // The engine's floor must be exactly that thermal term plus Fa, with no
    // extra fudge: noiseFloorDbm - fa_dB is the bandwidth-referenced kT0B.
    const noise = calculateReferenceNoise(14, "residential", AUSTIN_NOON);
    expect(noise.referenceBandwidthHz).toBe(REFERENCE_BANDWIDTH_HZ);
    expect(noise.noiseFloorDbm - noise.fa_dB).toBeCloseTo(KT0B_DBM, 6);
    expect(noise.noiseFloorDbm).toBeCloseTo(KT0B_DBM + noise.fa_dB, 12);
  });

  it("reproduces the reference P.372 Fa at 14 MHz, residential, local noon", () => {
    const noise = calculateReferenceNoise(14, "residential", AUSTIN_NOON);
    expect(noise.fa_dB).toBeCloseTo(REFERENCE_FA.noon14MHz, 1);
    expect(noise.noiseFloorDbm).toBeCloseTo(
      KT0B_DBM + REFERENCE_FA.noon14MHz,
      1,
    );
    // -97.8 dBm in 2500 Hz: a residential 20 m daytime floor, not the -77.9
    // the uncited `Faa = 100 - 33 log10 f` curve produced (#948, #955).
    expect(noise.noiseFloorDbm).toBeLessThan(-95);
    expect(noise.noiseFloorDbm).toBeGreaterThan(-100);
  });

  it("carries the P.372 receiver context into the floor and the SNR", () => {
    // Regression for the PROP-02 blocker: the atmospheric options existed but
    // calculateReferenceNoise never forwarded them. The diurnal swing is a
    // property of the map, not of a flat correction, so it differs by band:
    // at 14 MHz man-made noise dominates and the night/day gap is ~1 dB, at
    // 7 MHz atmospheric noise dominates at night and the gap is ~6 dB.
    const noon14 = calculateReferenceNoise(14, "residential", AUSTIN_NOON);
    const midnight14 = calculateReferenceNoise(
      14,
      "residential",
      AUSTIN_MIDNIGHT,
    );
    const noon7 = calculateReferenceNoise(7.1, "residential", AUSTIN_NOON);
    const midnight7 = calculateReferenceNoise(
      7.1,
      "residential",
      AUSTIN_MIDNIGHT,
    );

    expect(noon14.fa_dB).toBeCloseTo(REFERENCE_FA.noon14MHz, 1);
    expect(midnight14.fa_dB).toBeCloseTo(REFERENCE_FA.midnight14MHz, 1);
    expect(noon7.fa_dB).toBeCloseTo(REFERENCE_FA.noon7MHz, 1);
    expect(midnight7.fa_dB).toBeCloseTo(REFERENCE_FA.midnight7MHz, 1);
    expect(midnight7.fa_dB - noon7.fa_dB).toBeGreaterThan(5);

    // Omitting the context is not neutral either: with no receiver position
    // and no time there is no atmospheric term at all, so the floor drops to
    // the man-made/galactic pair. It must not silently equal a stated context.
    const noContext = calculateReferenceNoise(7.1, "residential");
    expect(noContext.fa_dB).toBeLessThan(midnight7.fa_dB - 5);

    // And the context must reach the SNR, not just the noise object.
    const snrNoon = calculateExpectedSNR(
      100,
      140,
      "FT8",
      0,
      7.1,
      "residential",
      AUSTIN_NOON,
    );
    const snrMidnight = calculateExpectedSNR(
      100,
      140,
      "FT8",
      0,
      7.1,
      "residential",
      AUSTIN_MIDNIGHT,
    );
    // calculateExpectedSNR reports to 0.1 dB, so a difference of two of its
    // returns carries up to 0.1 dB of rounding.
    expect(
      Math.abs(snrNoon - snrMidnight - (midnight7.fa_dB - noon7.fa_dB)),
    ).toBeLessThanOrEqual(0.1);
  });

  it("rejects a non-finite frequency instead of returning a fabricated SNR", () => {
    expect(() =>
      calculateExpectedSNR(100, 140, "FT8", 0, Number.NaN, "residential"),
    ).toThrow(RangeError);
    expect(() =>
      calculateExpectedSNR(
        100,
        140,
        "FT8",
        0,
        Number.POSITIVE_INFINITY,
        "residential",
      ),
    ).toThrow(RangeError);
  });
});

describe("PROP-02 noise-environment policy (M09/M10)", () => {
  it("an omitted noise environment is the declared default, not a second noise model", () => {
    // Audit: omitted gave +35.0 dB, any explicit environment about -12 dB (47 dB swing).
    // Anchor on the physics: the omitted path must land on the residential
    // floor computed from the P.372 coefficients, not on an uncited constant.
    const omitted = calculateExpectedSNR(100, 140, "FT8", 0, 14);
    const explicitDefault = calculateExpectedSNR(
      100,
      140,
      "FT8",
      0,
      14,
      DEFAULT_NOISE_ENVIRONMENT,
    );
    expect(omitted).toBe(explicitDefault);

    // Anchor the level on the two components that need no receiver context,
    // computed here from the published formulas rather than from the code
    // under test: man-made Fam = 72.5 - 27.7*log10(f) (P.372-16 Table 1,
    // residential) and galactic Fag = 52 - 23*log10(f). With no receiver
    // context there is no atmospheric term, so Fa is exactly their power sum:
    // the SNR convention adds the medians in power, and the section 8
    // log-normal combination (which would sit ~0.2 dB lower here) is reported
    // separately as faDecileTotal_dB rather than used for the floor.
    const lg = Math.log10(14);
    const fam = 72.5 - 27.7 * lg;
    const fag = 52 - 23 * lg;
    const powerSum = 10 * Math.log10(10 ** (fam / 10) + 10 ** (fag / 10));
    const noise = calculateReferenceNoise(14);
    expect(noise.environment).toBe(DEFAULT_NOISE_ENVIRONMENT);
    expect(noise.fa_dB).toBeGreaterThan(Math.max(fam, fag));
    expect(Math.abs(noise.fa_dB - powerSum)).toBeLessThan(1e-9);

    const txPowerDbm = 30 + 10 * Math.log10(100);
    // calculateExpectedSNR reports to 0.1 dB.
    expect(
      Math.abs(omitted - (txPowerDbm - 140 - (KT0B_DBM + noise.fa_dB))),
    ).toBeLessThanOrEqual(0.05);
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
      expect(band20!.signalPrediction?.signalClass).toBe("none");
      expect(band20!.sUnit?.value).toBe(0);
      expect(band20!.sUnit?.dBm).toBe(Number.NEGATIVE_INFINITY);
      expect(band20!.snrEstimate).toBe(-30);
      // Only the row's snrEstimate takes the -30 display floor. The prediction
      // object keeps the engine's no-power sentinel so non-UI consumers cannot
      // mistake an unsupported circuit for a merely weak one (Codex round 3).
      expect(band20!.signalPrediction?.expectedSNR).toBe(
        Number.NEGATIVE_INFINITY,
      );
      expect(band20!.signalPrediction?.snrLow).toBe(Number.NEGATIVE_INFINITY);
      expect(band20!.signalPrediction?.snrHigh).toBe(Number.NEGATIVE_INFINITY);
    }
  });

  it("an unsupported circuit carries no power and no confidence", () => {
    // Raw engine output (not the display object): zero received power is
    // -Infinity dBm, and there is nothing to be confident about, so the
    // confidence and both of its bounds are 0 rather than the 65-75 the
    // distance/hop heuristic would otherwise produce (PROP-02 #948).
    const unsupported = predictSignalStrength(
      28,
      3000,
      1,
      5,
      100,
      "SSB",
      0,
      "residential",
      undefined,
      2,
      150,
      10,
      "above_basic_muf",
    );
    expect(unsupported.expectedSNR).toBe(Number.NEGATIVE_INFINITY);
    expect(unsupported.snrLow).toBe(Number.NEGATIVE_INFINITY);
    expect(unsupported.snrHigh).toBe(Number.NEGATIVE_INFINITY);
    expect(unsupported.sUnit.value).toBe(0);
    expect(unsupported.sUnit.dBm).toBe(Number.NEGATIVE_INFINITY);
    expect(unsupported.signalClass).toBe("none");
    expect(unsupported.confidence).toBe(0);
    expect(unsupported.confidenceLow).toBe(0);
    expect(unsupported.confidenceHigh).toBe(0);

    // Same inputs, supported: the heuristic confidence is back and non-zero,
    // so the 0 above is the support branch and not a degenerate case.
    const supported = predictSignalStrength(
      28,
      3000,
      1,
      5,
      100,
      "SSB",
      0,
      "residential",
      undefined,
      2,
      150,
      10,
      "supported",
    );
    expect(supported.confidence).toBeGreaterThan(0);
    expect(Number.isFinite(supported.expectedSNR)).toBe(true);
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
        // The displayed centre is the physics value put through whole-dB
        // rounding and the [-30, +30] display clamp, so a 10x power step moves
        // it by exactly 10 dB unless it was already pinned to a display limit.
        // (Unclamped 10 dB linearity is asserted on the raw budget above.)
        const a = c100.snrEstimate;
        const b = c1000.snrEstimate;
        if (a > -30) {
          expect(b, c100.band).toBe(Math.min(30, a + 10));
        } else {
          expect(b, c100.band).toBeGreaterThanOrEqual(-30);
        }
      } else {
        expect(c1000.status).toBe("closed");
      }
    }
  });

  it("a band is closed exactly when it is unsupported or its margin is below -3 dB", () => {
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
          // Derived from the number the UI shows and the published mode
          // threshold, not from the engine's own class: "closed" means the
          // decode margin is more than 3 dB below threshold (see the margin
          // ladder note above), or the circuit carries no power at all.
          const margin = c.snrEstimate - MODE_PARAMETERS[mode].minSNR;
          const closedByMargin = pred.support !== "supported" || margin < -3;
          expect(c.status === "closed", `${mode} ${c.band} ${c.notes}`).toBe(
            closedByMargin,
          );
        }
      }
    }
  });
});

describe("PROP-02 status uses the selected mode sensitivity", () => {
  /**
   * The ladder is the decode/copy margin above the mode's own threshold, in
   * the 2500 Hz reference bandwidth. The 20 / 10 / 3 / -3 dB steps are the
   * ITU-R P.533 / P.842 reliability convention: P.842 derives circuit
   * reliability from the required-SNR margin, and roughly 3 dB of margin marks
   * the 50%-of-days threshold case, 10 dB a comfortably reliable circuit and
   * 20 dB a circuit that stays up through normal day-to-day variability.
   * Below -3 dB the mode is not expected to copy at all. Contract M10: this is
   * a threshold margin, NOT a calibrated QSO probability.
   *
   * These are absolute dB values, not `threshold + 20` restatements of the
   * implementation: changing MODE_PARAMETERS.minSNR must break this test.
   */
  const LADDER: Record<
    OperatingMode,
    {
      excellent: number;
      good: number;
      fair: number;
      poor: number;
      closed: number;
    }
  > = {
    SSB: { excellent: 23, good: 13, fair: 6, poor: 0, closed: -0.1 },
    CW: { excellent: 12, good: 2, fair: -5, poor: -11, closed: -11.1 },
    FT8: { excellent: -1, good: -11, fair: -18, poor: -24, closed: -24.1 },
    RTTY: { excellent: 15, good: 5, fair: -2, poor: -8, closed: -8.1 },
  };

  it("classifies each mode at its published absolute SNR boundaries", () => {
    for (const mode of Object.keys(LADDER) as OperatingMode[]) {
      const l = LADDER[mode];
      expect(classifyPathStatus(l.excellent, mode), `${mode} excellent`).toBe(
        "excellent",
      );
      expect(classifyPathStatus(l.good, mode), `${mode} good`).toBe("good");
      expect(classifyPathStatus(l.fair, mode), `${mode} fair`).toBe("fair");
      expect(classifyPathStatus(l.poor, mode), `${mode} poor`).toBe("poor");
      expect(classifyPathStatus(l.closed, mode), `${mode} closed`).toBe(
        "closed",
      );
      // The boundaries are the mode threshold plus the documented margins.
      expect(l.poor - MODE_PARAMETERS[mode].minSNR).toBeCloseTo(-3, 6);
      expect(getSignalClass(l.excellent, mode)).toBe("strong");
    }
  });

  it("an SNR that is good for FT8 is closed for SSB", () => {
    // -10 dB in 2500 Hz: FT8 margin +11 (good), SSB margin -13 (closed).
    expect(classifyPathStatus(-10, "FT8")).toBe("good");
    expect(classifyPathStatus(-10, "SSB")).toBe("closed");
  });
});

describe("PROP-02 the displayed centre is the classified centre", () => {
  /**
   * Blocker 2 / Codex round 1: the status was classified on the raw adjusted
   * SNR (22.6 dB -> "good") while the whole-dB value shown was 23 dB, which
   * the same ladder calls "excellent"; and the centre spread into the display
   * prediction was the unshifted, unclamped number, so it could sit far
   * outside its own [snrLow, snrHigh] range.
   */
  const CASES = [
    { lat2: 41, lon2: 0, kp: 2, label: "short path, quiet" },
    { lat2: 51.5, lon2: -0.1, kp: 2, label: "medium path, quiet" },
    { lat2: 35.7, lon2: 139.7, kp: 5, label: "long path, storm" },
    { lat2: -33.9, lon2: 151.2, kp: 7, label: "antipodal, severe storm" },
  ];

  it("keeps snrLow <= expectedSNR <= snrHigh and classifies the returned value", () => {
    for (const mode of ["SSB", "CW", "FT8"] as const) {
      for (const c of CASES) {
        const conditions = getEnhancedBandConditions(
          40,
          0,
          c.lat2,
          c.lon2,
          c.kp,
          150,
          NOON,
          100,
          mode === "CW" ? "SSB" : mode,
          0,
          "rural",
        );
        for (const cond of conditions) {
          const p = cond.signalPrediction!;
          const where = `${mode} ${c.label} ${cond.band}`;
          if (p.support !== "supported") {
            // No power: the prediction keeps the -Infinity sentinel and only
            // the row's snrEstimate takes the display floor.
            expect(p.expectedSNR, where).toBe(Number.NEGATIVE_INFINITY);
            expect(p.snrLow, where).toBe(Number.NEGATIVE_INFINITY);
            expect(p.snrHigh, where).toBe(Number.NEGATIVE_INFINITY);
            expect(cond.snrEstimate, where).toBe(-30);
            expect(cond.status, where).toBe("closed");
            expect(p.signalClass, where).toBe("none");
            continue;
          }
          expect(p.expectedSNR, where).toBe(cond.snrEstimate);
          expect(p.snrLow!, where).toBeLessThanOrEqual(p.expectedSNR);
          expect(p.snrHigh!, where).toBeGreaterThanOrEqual(p.expectedSNR);
          const effectiveMode = mode === "CW" ? "SSB" : mode;
          expect(classifyPathStatus(p.expectedSNR, effectiveMode), where).toBe(
            cond.status,
          );
          expect(getSignalClass(p.expectedSNR, effectiveMode), where).toBe(
            p.signalClass,
          );
        }
      }
    }
  });

  it("a Kp penalty that crosses a class boundary moves the status with it", () => {
    // Same path and date, Kp 2 (no penalty) vs Kp 7 (-10 dB). The status must
    // follow the number that is returned, at both ends, for every band.
    const quiet = getEnhancedBandConditions(
      40,
      0,
      51.5,
      -0.1,
      2,
      150,
      NOON,
      100,
      "FT8",
      0,
      "rural",
    );
    const storm = getEnhancedBandConditions(
      40,
      0,
      51.5,
      -0.1,
      7,
      150,
      NOON,
      100,
      "FT8",
      0,
      "rural",
    );
    let crossings = 0;
    for (const q of quiet) {
      const st = storm.find((c) => c.band === q.band)!;
      expect(classifyPathStatus(q.snrEstimate, "FT8"), q.band).toBe(q.status);
      expect(classifyPathStatus(st.snrEstimate, "FT8"), st.band).toBe(
        st.status,
      );
      if (
        q.signalPrediction!.support === "supported" &&
        q.status !== st.status
      ) {
        crossings += 1;
        expect(st.snrEstimate).toBeLessThan(q.snrEstimate);
      }
    }
    // The scenario is only meaningful if the penalty actually crossed a
    // boundary somewhere.
    expect(crossings).toBeGreaterThan(0);
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
      if (p.support !== "supported") {
        expect(c.snrEstimate, c.band).toBe(-30);
        expect(p.expectedSNR, c.band).toBe(Number.NEGATIVE_INFINITY);
        continue;
      }
      expect(p.snrLow!, c.band).toBeLessThanOrEqual(c.snrEstimate);
      expect(p.snrHigh!, c.band).toBeGreaterThanOrEqual(c.snrEstimate);
      expect(p.expectedSNR, c.band).toBe(c.snrEstimate);
    }
  });
});

/**
 * Codex round 2 on PR #1081. Three variations on one mistake: a mode-specific
 * status or an empirical penalty is applied to one number while a sibling the
 * user reads beside it is left alone.
 */
describe("PROP-02 a penalty moves every number it should (Codex r2)", () => {
  /** Same path and time; only Kp changes, so only the penalty differs. */
  function atKp(kp: number) {
    return getEnhancedBandConditions(
      AUDIT_PATH.homeLat,
      AUDIT_PATH.homeLon,
      AUDIT_PATH.targetLat,
      AUDIT_PATH.targetLon,
      kp,
      150,
      NOON,
      100,
      "SSB",
      0,
      "rural",
    );
  }

  it("drops the S-meter by the same loss it drops the SNR", () => {
    // Kp 2 applies no penalty; Kp 9 applies (9-2)*2 = 14 dB, which is 2.33
    // S-units at 6 dB each. Before the fix the S-meter was identical in both
    // runs while the SNR fell 14 dB.
    const calm = atKp(2);
    const storm = atKp(9);
    let checked = 0;
    for (const band of calm) {
      const stormBand = storm.find((b) => b.band === band.band)!;
      if (band.signalPrediction?.support !== "supported") continue;
      if (stormBand.signalPrediction?.support !== "supported") continue;
      checked += 1;
      const dropDbm =
        band.signalPrediction.sUnit.dBm - stormBand.signalPrediction.sUnit.dBm;
      expect(dropDbm, `${band.band} received level`).toBeCloseTo(14, 0);
      // And the excess loss is carried on pathLoss, so rx = tx + gain - loss
      // still holds for the number that is displayed.
      const txPowerDbm = 30 + 10 * Math.log10(100);
      expect(
        stormBand.signalPrediction.sUnit.dBm,
        `${band.band} budget`,
      ).toBeCloseTo(txPowerDbm - stormBand.signalPrediction.pathLoss, 0);
    }
    expect(checked).toBeGreaterThan(0);
  });

  it("classifies RTTY against the RTTY threshold, not SSB's", () => {
    // -4 dB in 2500 Hz: RTTY threshold -5 (margin +1, poor/usable), SSB
    // threshold +3 (margin -7, closed). getOptimalBand used to translate RTTY
    // to SSB before this classifier ran.
    expect(classifyPathStatus(-4, "RTTY")).toBe("poor");
    expect(classifyPathStatus(-4, "SSB")).toBe("closed");

    // The recommendation path is where the collapse happened: getOptimalBand
    // and getAlternateBands handed the enhanced calculation "SSB" whenever the
    // requested mode was RTTY. At 0.2 W over this path, 30 m (-8 dB) and 20 m
    // (-1 dB) are usable for RTTY and closed for SSB, so they must survive
    // into the RTTY recommendation.
    const qrpArgs = [
      AUDIT_PATH.homeLat,
      AUDIT_PATH.homeLon,
      51.5,
      -0.13,
      2,
      150,
      new Date(Date.UTC(2026, 2, 20, 12, 0, 0)),
    ] as const;
    const optimal = getOptimalBand(
      ...qrpArgs,
      "RTTY",
      undefined,
      0,
      "rural",
      0.2,
    );
    const alternates = getAlternateBands(
      ...qrpArgs,
      "RTTY",
      undefined,
      0,
      "rural",
      0.2,
    );
    const recommended = [optimal, ...alternates]
      .filter((r): r is NonNullable<typeof r> => r !== null)
      .map((r) => r.band);
    const ssbWouldClose = new Set(
      getEnhancedBandConditions(...qrpArgs, 0.2, "SSB", 0, "rural")
        .filter((c) => c.status === "closed")
        .map((c) => c.band),
    );
    expect(recommended.some((band) => ssbWouldClose.has(band))).toBe(true);

    // And the enhanced calculation must accept RTTY rather than be handed SSB.
    const rtty = getEnhancedBandConditions(
      AUDIT_PATH.homeLat,
      AUDIT_PATH.homeLon,
      AUDIT_PATH.targetLat,
      AUDIT_PATH.targetLon,
      2,
      150,
      NOON,
      100,
      "RTTY",
      0,
      "rural",
    );
    for (const band of rtty) {
      expect(band.signalPrediction?.mode, band.band).toBe("RTTY");
      expect(classifyPathStatus(band.snrEstimate, "RTTY"), band.band).toBe(
        band.status,
      );
    }
  });

  it("builds forecast windows with the selected mode, not the rig's", () => {
    // Active rig on SSB, operator asking about FT8. Every window the SSB
    // statuses closed used to be dropped before the FT8 threshold could see
    // it, so the FT8 answer could only ever be a subset of the SSB one.
    const station = {
      txPowerWatts: 100,
      mode: "SSB" as const,
      antennaGainDbi: 0,
      noiseEnvironment: "rural" as const,
    };
    const args = [
      AUDIT_PATH.homeLat,
      AUDIT_PATH.homeLon,
      AUDIT_PATH.targetLat,
      AUDIT_PATH.targetLon,
      2,
      150,
      NOON,
    ] as const;

    const ft8Windows = getBestTimeWindows(...args, "FT8", station);
    const ssbWindows = getBestTimeWindows(...args, "SSB", station);

    // FT8 copies ~24 dB below SSB, so asking about FT8 while the rig sits on
    // SSB must not return fewer opportunities than asking about SSB.
    expect(ft8Windows.length).toBeGreaterThanOrEqual(ssbWindows.length);
    expect(ft8Windows.length).toBeGreaterThan(0);
    // The windows reported for FT8 must clear the FT8 threshold, and at least
    // one must be an hour/band SSB would have called closed.
    const ssbKeys = new Set(
      ssbWindows.map((w) => `${w.band}:${w.startHour}-${w.endHour}`),
    );
    const onlyForFt8 = ft8Windows.filter(
      (w) => !ssbKeys.has(`${w.band}:${w.startHour}-${w.endHour}`),
    );
    expect(onlyForFt8.length).toBeGreaterThan(0);
  });
});
