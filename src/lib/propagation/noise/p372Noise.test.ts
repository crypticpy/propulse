import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import {
  P372_MANIFEST,
  p372Payload,
  type P372ArrayName,
} from "./p372Coefficients";
import { atmosphericNoiseP372 } from "./p372Noise";
import {
  getExternalNoise,
  getExternalNoiseFigure,
  type NoiseEnvironment,
} from "@/lib/utils/noiseModel";

/**
 * Golden fixtures for the ITU-R P.372 noise port.
 *
 * Every row was produced by running the ITU-R Study Group 3 reference
 * implementation natively: `P372/Src/P372/{Noise,NoiseMemory,InitializeNoise}.c`
 * from https://github.com/ITU-R-Study-Group-3/ITU-R-HF at commit
 * cd172be56dc04b154e5d2fa91cbaa6ecf5284305, compiled with `cc -O2`, driven by a
 * harness that loads the monthly `COEFF*W.txt` coefficients and calls
 * `Noise(&np, hour, lon*D2R, lat*D2R, freq)` once per row. `faA` is
 * `noiseP->FaA`, `faTotal` is `noiseP->FamT`, `duTotal`/`dlTotal` are
 * `noiseP->DuT`/`noiseP->DlT`, and `faMedianSum` is the power sum of the same
 * run's `FaA`, `FaM` and `FaG`. The regeneration procedure is in
 * `docs/plans.local/prop-02-948-notes.md`.
 *
 * Coverage: 16 cases over both hemispheres (latitude -34.6 to +64.1), all four
 * seasons, all six four-hour local-time blocks, 3.5 to 28.3 MHz, and all four
 * man-made noise categories.
 */
interface GoldenCase {
  name: string;
  month: number;
  utcHour: number;
  latitude: number;
  longitude: number;
  frequencyMHz: number;
  environment: NoiseEnvironment;
  faA: number;
  /** `noiseP->FamT`: the P.372 section 8 log-normal combination. */
  faTotal: number;
  /**
   * The plain power sum of the reference's three medians,
   * 10*log10(10^(FaA/10) + 10^(FaM/10) + 10^(FaG/10)), computed from the same
   * run's `FaA`/`FaM`/`FaG`. This is the SNR convention
   * `P533/CircuitReliability.c:166` uses, and it differs from `faTotal` by up
   * to 0.93 dB across these 16 cases.
   */
  faMedianSum: number;
  duTotal: number;
  dlTotal: number;
}

const GOLDEN: readonly GoldenCase[] = [
  {
    name: "Austin, March, 12 LMT, 20 m, residential",
    month: 3,
    utcHour: 18,
    latitude: 30.27,
    longitude: -97.74,
    frequencyMHz: 14.1,
    environment: "residential",
    faA: 36.164487,
    faTotal: 42.292813,
    faMedianSum: 42.082855,
    duTotal: 10.057709,
    dlTotal: 4.509608,
  },
  {
    name: "Tokyo, July, 12 LMT, 40 m, city",
    month: 7,
    utcHour: 3,
    latitude: 35.68,
    longitude: 139.65,
    frequencyMHz: 7.1,
    environment: "city",
    faA: 32.817623,
    faTotal: 53.295207,
    faMedianSum: 53.295207,
    duTotal: 11.002658,
    dlTotal: 6.638548,
  },
  {
    name: "London, January, 12 LMT, 80 m, residential",
    month: 1,
    utcHour: 12,
    latitude: 51.51,
    longitude: -0.13,
    frequencyMHz: 3.6,
    environment: "residential",
    faA: 21.26845,
    faTotal: 57.115888,
    faMedianSum: 57.161642,
    duTotal: 10.591538,
    dlTotal: 5.260558,
  },
  {
    name: "Sydney, December, 08 LMT, 15 m, rural",
    month: 12,
    utcHour: 22,
    latitude: -33.87,
    longitude: 151.21,
    frequencyMHz: 21.2,
    environment: "rural",
    faA: 10.928588,
    faTotal: 30.790584,
    faMedianSum: 31.021971,
    duTotal: 9.075608,
    dlTotal: 4.26778,
  },
  {
    name: "Nairobi, April, 08 LMT, 10 m, quiet rural",
    month: 4,
    utcHour: 6,
    latitude: -1.29,
    longitude: 36.82,
    frequencyMHz: 28,
    environment: "quiet_rural",
    faA: 3.462025,
    faTotal: 18.831991,
    faMedianSum: 19.696582,
    duTotal: 6.427704,
    dlTotal: 1.918028,
  },
  {
    name: "Reykjavik, October, 23 LMT, 60 m, rural",
    month: 10,
    utcHour: 0,
    latitude: 64.13,
    longitude: -21.9,
    frequencyMHz: 5,
    environment: "rural",
    faA: 45.319782,
    faTotal: 50.344522,
    faMedianSum: 49.945097,
    duTotal: 8.255824,
    dlTotal: 4.808035,
  },
  {
    name: "Buenos Aires, June, 11 LMT, 30 m, residential",
    month: 6,
    utcHour: 15,
    latitude: -34.6,
    longitude: -58.38,
    frequencyMHz: 10.1,
    environment: "residential",
    faA: 37.056522,
    faTotal: 45.403033,
    faMedianSum: 45.469422,
    duTotal: 10.35858,
    dlTotal: 4.735542,
  },
  {
    name: "Singapore, September, 15 LMT, 17 m, city",
    month: 9,
    utcHour: 9,
    latitude: 1.35,
    longitude: 103.82,
    frequencyMHz: 18.1,
    environment: "city",
    faA: 38.584799,
    faTotal: 42.934026,
    faMedianSum: 43.642495,
    duTotal: 10.684253,
    dlTotal: 5.761504,
  },
  {
    name: "Anchorage, February, 12 LMT, 80 m, residential",
    month: 2,
    utcHour: 21,
    latitude: 61.22,
    longitude: -149.9,
    frequencyMHz: 3.5,
    environment: "residential",
    faA: 19.981116,
    faTotal: 57.454085,
    faMedianSum: 57.499272,
    duTotal: 10.59177,
    dlTotal: 5.261451,
  },
  {
    name: "Cape Town, August, 14 LMT, 12 m, rural",
    month: 8,
    utcHour: 13,
    latitude: -33.92,
    longitude: 18.42,
    frequencyMHz: 24.9,
    environment: "rural",
    faA: 10.97788,
    faTotal: 28.898005,
    faMedianSum: 29.148954,
    duTotal: 9.059444,
    dlTotal: 4.232654,
  },
  {
    name: "Delhi, May, 00 LMT, 40 m, city",
    month: 5,
    utcHour: 19,
    latitude: 28.61,
    longitude: 77.21,
    frequencyMHz: 7.05,
    environment: "city",
    faA: 53.88361,
    faTotal: 55.719049,
    faMedianSum: 56.631085,
    duTotal: 10.203251,
    dlTotal: 5.279012,
  },
  {
    name: "Sao Paulo, November, 23 LMT, 20 m, quiet rural",
    month: 11,
    utcHour: 2,
    latitude: -23.55,
    longitude: -46.63,
    frequencyMHz: 14.2,
    environment: "quiet_rural",
    faA: 35.461102,
    faTotal: 36.124364,
    faMedianSum: 36.006565,
    duTotal: 4.939562,
    dlTotal: 4.141338,
  },
  {
    name: "Chicago, March, 12 LMT, 80 m, residential",
    month: 3,
    utcHour: 18,
    latitude: 41.88,
    longitude: -87.63,
    frequencyMHz: 3.6,
    environment: "residential",
    faA: 44.308617,
    faTotal: 57.380092,
    faMedianSum: 57.380092,
    duTotal: 10.962368,
    dlTotal: 5.759211,
  },
  {
    name: "Perth, January, 12 LMT, 10 m, rural",
    month: 1,
    utcHour: 5,
    latitude: -31.95,
    longitude: 115.86,
    frequencyMHz: 28.3,
    environment: "rural",
    faA: -18.027425,
    faTotal: 27.311365,
    faMedianSum: 27.574922,
    duTotal: 9.077212,
    dlTotal: 4.259759,
  },
  {
    name: "Moscow, December, 10 LMT, 30 m, residential",
    month: 12,
    utcHour: 8,
    latitude: 55.75,
    longitude: 37.62,
    frequencyMHz: 10.1,
    environment: "residential",
    faA: 33.029872,
    faTotal: 44.994345,
    faMedianSum: 45.073687,
    duTotal: 10.495392,
    dlTotal: 4.976774,
  },
  {
    name: "Honolulu, June, 13 LMT, 15 m, quiet rural",
    month: 6,
    utcHour: 23,
    latitude: 21.31,
    longitude: -157.86,
    frequencyMHz: 21.1,
    environment: "quiet_rural",
    faA: 6.829299,
    faTotal: 21.733165,
    faMedianSum: 22.667051,
    duTotal: 6.709702,
    dlTotal: 1.965186,
  },
];

/**
 * Tolerance, in dB, between this port and the reference implementation.
 *
 * A faithful port is expected inside about 0.5 dB. This gate is set an order of
 * magnitude tighter because the only two deliberate deviations are bounded and
 * measured: the int16 storage of `fakp` and `dud` costs at most 0.013 dB of Fa
 * over a 4 000-case random sweep, and the galactic decile is carried as the
 * published 2.0 dB rather than the reference's hard-coded sigma of 1.56
 * (2.0/1.282 = 1.56006), worth under 0.001 dB in the combination. Anything
 * larger than 0.05 dB is a porting error, not rounding.
 */
const TOLERANCE_DB = 0.05;

describe("ITU-R P.372 coefficient asset", () => {
  it("matches the digests recorded in the manifest", () => {
    const names: P372ArrayName[] = ["fakp", "fakabp", "dud", "fam"];
    for (const name of names) {
      const payload = p372Payload(name);
      const digest = createHash("sha256").update(payload, "utf8").digest("hex");
      expect(
        digest,
        `sha256 of the ${name} payload does not match P372_MANIFEST`,
      ).toBe(P372_MANIFEST.arrays[name].sha256);
    }
  });
});

describe("ITU-R P.372 atmospheric noise matches the reference implementation", () => {
  for (const c of GOLDEN) {
    it(`${c.name}`, () => {
      const atmospheric = atmosphericNoiseP372(
        {
          latitude: c.latitude,
          longitude: c.longitude,
          month: c.month,
          utcHour: c.utcHour,
        },
        c.frequencyMHz,
      );
      expect(atmospheric).not.toBeNull();
      expect(atmospheric!.fa).toBeCloseTo(c.faA, 1);
      expect(Math.abs(atmospheric!.fa - c.faA)).toBeLessThan(TOLERANCE_DB);
    });
  }
});

describe("ITU-R P.372 combined noise matches the reference implementation", () => {
  for (const c of GOLDEN) {
    it(`${c.name}`, () => {
      const noise = getExternalNoise(c.frequencyMHz, c.environment, {
        latitude: c.latitude,
        longitude: c.longitude,
        month: c.month,
        utcHour: c.utcHour,
      });
      expect(Math.abs(noise.faDecileTotal_dB - c.faTotal)).toBeLessThan(
        TOLERANCE_DB,
      );
      expect(Math.abs(noise.duTotal_dB - c.duTotal)).toBeLessThan(TOLERANCE_DB);
      expect(Math.abs(noise.dlTotal_dB - c.dlTotal)).toBeLessThan(TOLERANCE_DB);
    });
  }
});

/**
 * The SNR convention. `P372/Src/P372/Noise.c:189` sets
 * `FamT = min(FamTu, FamTl)`, but `P533/Src/P533/CircuitReliability.c:166`
 * forms the signal-to-noise ratio against the plain power sum of the three
 * medians. The two differ by up to 0.93 dB over these cases, and
 * `SNR = PR - (Fsum - 204 + 10*log10(BW))` reproduces the reference's analog
 * golden circuits only with the power sum, so that is what
 * `getExternalNoiseFigure` returns and what every noise floor here uses.
 *
 * Tolerance is the same 0.05 dB as the other goldens: the only error sources
 * are the int16 coefficient storage (<=0.013 dB of FaA) and float64 rounding,
 * and the man-made and galactic medians are closed-form and exact.
 */
describe("ITU-R P.372 median power sum is the SNR convention", () => {
  for (const c of GOLDEN) {
    it(`${c.name}`, () => {
      const noise = getExternalNoise(c.frequencyMHz, c.environment, {
        latitude: c.latitude,
        longitude: c.longitude,
        month: c.month,
        utcHour: c.utcHour,
      });
      expect(Math.abs(noise.faMedianSum_dB - c.faMedianSum)).toBeLessThan(
        TOLERANCE_DB,
      );
      // getExternalNoiseFigure is the SNR path; it must be the power sum, not
      // the section 8 FamT.
      expect(
        getExternalNoiseFigure(c.frequencyMHz, c.environment, {
          latitude: c.latitude,
          longitude: c.longitude,
          month: c.month,
          utcHour: c.utcHour,
        }),
      ).toBe(noise.faMedianSum_dB);
    });
  }

  it("differs from the section 8 combination by up to about 1 dB", () => {
    const gaps = GOLDEN.map((c) => Math.abs(c.faMedianSum - c.faTotal));
    expect(Math.max(...gaps)).toBeGreaterThan(0.9);
    expect(Math.max(...gaps)).toBeLessThan(1.5);
  });
});

describe("ITU-R P.372 atmospheric noise contract", () => {
  const context = {
    latitude: 30.27,
    longitude: -97.74,
    month: 3,
    utcHour: 18,
  };

  it("has no value without a complete receiver context", () => {
    expect(atmosphericNoiseP372(undefined, 14.1)).toBeNull();
    expect(atmosphericNoiseP372({}, 14.1)).toBeNull();
    expect(
      atmosphericNoiseP372({ ...context, longitude: undefined }, 14.1),
    ).toBeNull();
    expect(
      atmosphericNoiseP372({ ...context, utcHour: undefined }, 14.1),
    ).toBeNull();
    expect(atmosphericNoiseP372({ ...context, month: 13 }, 14.1)).toBeNull();
    expect(atmosphericNoiseP372(context, Number.NaN)).toBeNull();
  });

  it("clamps to the 1-30 MHz interval the CCIR 322 maps are fitted over", () => {
    expect(atmosphericNoiseP372(context, 0.5)!.fa).toBeCloseTo(
      atmosphericNoiseP372(context, 1)!.fa,
      10,
    );
    expect(atmosphericNoiseP372(context, 50.1)!.fa).toBeCloseTo(
      atmosphericNoiseP372(context, 30)!.fa,
      10,
    );
  });

  it("varies with the four-hour local-time block, not with a daylight flag", () => {
    // Same receiver, same month, 12 UTC apart: Austin local noon against local
    // midnight. The night value must be the higher one -- lightning noise peaks
    // at night -- and the difference must be large enough that a flat
    // correction could not stand in for it.
    const noon = atmosphericNoiseP372(context, 7.1)!.fa;
    const midnight = atmosphericNoiseP372({ ...context, utcHour: 6 }, 7.1)!.fa;
    expect(midnight).toBeGreaterThan(noon + 10);
  });

  it("varies with longitude at a fixed UTC hour", () => {
    // The map is geographic: two stations at the same latitude and UTC hour but
    // 120 degrees apart are in different local-time blocks and different noise
    // regions, so their atmospheric noise must differ.
    const west = atmosphericNoiseP372(context, 7.1)!.fa;
    const east = atmosphericNoiseP372(
      { ...context, longitude: 22.26 },
      7.1,
    )!.fa;
    expect(Math.abs(east - west)).toBeGreaterThan(1);
  });
});
