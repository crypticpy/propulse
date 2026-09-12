// @vitest-environment node

import { describe, expect, it } from "vitest";

import { hopGeometry, mirrorHeightFromM3000F2 } from "./hop";
import {
  f2ReflectionHeight,
  maximumHopLengthKm,
  MAX_DMAX_KM,
  MAX_F2_REFLECTION_HEIGHT_KM,
  type F2ReflectionHeightInputs,
} from "./reflectionHeight";

/**
 * Every expected number below was computed twice: once by hand from the
 * published P.533-14 formulae (the arithmetic is in the comments, rounded to
 * what fits on a line) and once by an independent Python transcription of the
 * same formulae, which is where the full-precision values come from. The leaf
 * was not consulted for any of them.
 */
const PRECISION = 6;

function inputs(
  overrides: Partial<F2ReflectionHeightInputs>,
): F2ReflectionHeightInputs {
  return {
    m3000F2: 3.0,
    foF2MHz: 6.0,
    foEMHz: 1.5,
    r12: 50,
    frequencyMHz: 8.0,
    groundDistanceKm: 1000,
    ...overrides,
  };
}

/**
 * The ITU reference's `MirrorReflectionHeight()` (`ELayerScreeningFrequency.c`),
 * transcribed by hand for parity, including its dropped `+90.47 xr` term in G.
 * Nothing from the reference is redistributed: this is our own port of the
 * arithmetic, kept only as the oracle the header describes. It takes the hop
 * length directly because the reference computes hr per mode.
 */
function referenceMirrorReflectionHeight(
  m3000F2: number,
  foF2: number,
  foE: number,
  ssn: number,
  frequency: number,
  d: number,
): number {
  const x = foF2 / foE;
  const y = Math.max(x, 1.8);
  const deltaM = 0.18 / (y - 1.4) + (0.096 * (Math.min(ssn, 160) - 25)) / 150;
  const xr = frequency / foF2;
  const H = 1490 / (m3000F2 + deltaM) - 316;
  let h: number;
  if (x > 3.33 && xr >= 1) {
    const E1 = -0.09707 * xr ** 3 + 0.687 * xr * xr - 0.7506 * xr + 0.6;
    const F1 =
      xr <= 1.71
        ? -1.862 * xr ** 4 +
          12.95 * xr ** 3 -
          32.03 * xr * xr +
          33.5 * xr -
          10.91
        : 1.21 + 0.2 * xr;
    // The reference's G: no 90.47 xr term.
    const G =
      xr <= 3.7
        ? -2.102 * xr ** 4 + 19.5 * xr ** 3 - 63.15 * xr * xr - 44.73
        : 19.25;
    const ds = 160 + (H + 43) * G;
    const a = (d - ds) / (H + 140);
    const A1 = 140 + (H - 47) * E1;
    const B1 = 150 + (H - 17) * F1 - A1;
    h = B1 >= 0 && a >= 0 ? A1 + B1 * 2.4 ** -a : A1 + B1;
  } else if (x > 3.33) {
    const Z = Math.max(xr, 0.1);
    const E2 = 0.1906 * Z * Z + 0.00583 * Z + 0.1936;
    const A2 = 151 + (H - 47) * E2;
    const F2 = 0.645 * Z * Z + 0.883 * Z + 0.162;
    const B2 = 141 + (H - 24) * F2 - A2;
    const df = Math.min((0.115 * d) / (Z * (H + 140)), 0.65);
    const b =
      -7.535 * df ** 4 + 15.75 * df ** 3 - 8.834 * df * df - 0.378 * df + 1;
    h = B2 >= 0 ? A2 + B2 * b : A2 + B2;
  } else {
    const J = -0.7126 * y ** 3 + 5.863 * y * y - 16.13 * y + 16.07;
    const U = 8e-5 * (H - 80) * (1 + 11 * y ** -2.2) + 1.2e-3 * H * y ** -3.6;
    h = 115 + H * J + U * d;
  }
  return Math.min(h, 800);
}

describe("f2ReflectionHeight goldens from the published P.533-14 section 5.1", () => {
  it("case 1: one short hop, branch (a), xr below 1.71, inside the skip transition", () => {
    // M = 3.0, foF2 = 6, foE = 1.5, R12 = 50, f = 8, D = 1000.
    // Eq (2): hr = 1490/3 - 176 = 320.667; grazing hop 3960.6 km, so n0 = 1.
    // dmax: x = max(4, 2) = 4; B = 3 - 0.124 + 5 (0.0215 + 0.005 sin(1.9635 - 1.9635))
    //   = 2.876 + 5 * 0.0215 = 2.9835; dmax = 4780 + (12610 + 133.75 - 194.2 + 168.2)
    //   * (0.33518 - 0.303) = 4780 + 12717.8 * 0.032176 = 5189.2 -> restricted 4000.
    // Section 5.1: x = 4, y = 4, dM = 0.18/2.6 + 0.096*25/150 = 0.06923 + 0.016
    //   = 0.08523; H = 1490/3.08523 - 316 = 166.946; xr = 8/6 = 1.33333.
    //   E1 = -0.2301 + 1.2213 - 1.0008 + 0.6 = 0.59044
    //   F1 = -5.885 + 30.696 - 56.942 + 44.667 - 10.91 = 1.62590
    //   G  = -6.643 + 46.222 - 112.267 + 120.627 - 44.73 = 3.20886
    //   ds = 160 + 209.946 * 3.20886 = 833.688; a = (1000 - 833.688)/306.946 = 0.54183
    //   A1 = 140 + 119.946 * 0.59044 = 210.821; B1 = 150 + 149.946 * 1.6259 - 210.821 = 182.976
    //   B1 >= 0 and a >= 0: h = 210.821 + 182.976 * 2.4^-0.54183 = 210.821 + 113.864 = 324.685
    const result = f2ReflectionHeight(inputs({}));
    expect(result.branch).toBe("5.1a");
    expect(result.hopCount).toBe(1);
    expect(result.geometricHopCount).toBe(1);
    expect(result.dmaxKm).toBe(MAX_DMAX_KM);
    expect(result.unrestrictedDmaxKm).toBeCloseTo(5189.215597415832, PRECISION);
    expect(result.H).toBeCloseTo(166.946045676673, PRECISION);
    expect(result.skipDistanceKm).toBeCloseTo(833.6883493850586, PRECISION);
    expect(result.heightKm).toBeCloseTo(324.6850655279803, PRECISION);
    expect(result.capped).toBe(false);
  });

  it("case 2: branch (a) above the xr = 3.7 limit, G = 19.25, hop shorter than the skip distance", () => {
    // M = 3.2, foF2 = 4, foE = 1, R12 = 25, f = 16, D = 1500.
    // Eq (2): hr = 289.625; grazing 3771 km; n0 = 1. dmax 4888.2 -> 4000.
    // x = 4, y = 4, dM = 0.18/2.6 + 0 = 0.06923; H = 1490/3.26923 - 316 = 139.765
    // xr = 4: E1 = -6.2125 + 10.992 - 3.0024 + 0.6 = 2.37712; F1 = 1.21 + 0.8 = 2.01; G = 19.25
    // ds = 160 + 182.765 * 19.25 = 3678.22; a = (1500 - 3678.22)/279.765 = -7.786 < 0
    // A1 = 140 + 92.765 * 2.37712 = 360.513; B1 = 150 + 122.765 * 2.01 - 360.513 = 36.244
    // a < 0: h = A1 + B1 = 396.757
    const result = f2ReflectionHeight(
      inputs({
        m3000F2: 3.2,
        foF2MHz: 4.0,
        foEMHz: 1.0,
        r12: 25,
        frequencyMHz: 16.0,
        groundDistanceKm: 1500,
      }),
    );
    expect(result.branch).toBe("5.1a");
    expect(result.hopCount).toBe(1);
    expect(result.skipDistanceKm).toBeCloseTo(3678.220588235293, PRECISION);
    expect(result.heightKm).toBeCloseTo(396.75705882352923, PRECISION);
  });

  it("case 3: D beyond one hop, two hops, branch (a) with 1.71 < xr <= 3.7 and a long hop past the skip distance", () => {
    // M = 3.1, foF2 = 5, foE = 1.4, R12 = 100, f = 12, D = 6000.
    // Eq (2): hr = 304.645; grazing 3864 km < 6000, so n0 = 2, d = 3000 <= dmax.
    // dmax: x = 3.5714; B = 3.10316; dmax = 5026.5 -> 4000.
    // x = 3.5714 (> 3.33), dM = 0.18/2.1714 + 0.096*75/150 = 0.08289 + 0.048 = 0.13089
    // H = 1490/3.23089 - 316 = 145.173; xr = 2.4
    // E1 = -1.3419 + 3.9571 - 1.8014 + 0.6 = 1.41378; F1 = 1.21 + 0.48 = 1.69
    // G = -69.72 + 269.57 - 363.74 + 217.13 - 44.73 = 8.48268
    // ds = 160 + 188.173 * 8.48268 = 1756.21; a = (3000 - 1756.21)/285.173 = 4.36154
    // A1 = 140 + 98.173 * 1.41378 = 278.795; B1 = 150 + 128.173 * 1.69 - 278.795 = 87.817
    // h = 278.795 + 87.817 * 2.4^-4.36154 = 278.795 + 1.929 = 280.724
    const result = f2ReflectionHeight(
      inputs({
        m3000F2: 3.1,
        foF2MHz: 5.0,
        foEMHz: 1.4,
        r12: 100,
        frequencyMHz: 12.0,
        groundDistanceKm: 6000,
      }),
    );
    expect(result.branch).toBe("5.1a");
    expect(result.geometricHopCount).toBe(2);
    expect(result.hopCount).toBe(2);
    expect(result.hopGroundDistanceKm).toBe(3000);
    expect(result.heightKm).toBeCloseTo(280.7235560526543, PRECISION);
  });

  it("case 4: three hops, branch (b) below foF2, normalised distance at its 0.65 ceiling", () => {
    // M = 2.9, foF2 = 5, foE = 1.2, R12 = 80, f = 3.5, D = 9000.
    // Eq (2): hr = 337.793; grazing 4060.6 km; 9000/2 = 4500 > grazing, so n0 = 3, d = 3000.
    // dmax: x = 4.1667; B = 2.86908; dmax = 5358.4 -> 4000; 3000 <= 4000.
    // x = 4.1667, dM = 0.18/2.7667 + 0.096*55/150 = 0.06506 + 0.0352 = 0.10026
    // H = 1490/3.00026 - 316 = 180.624; xr = 0.7, Z = 0.7
    // E2 = 0.093394 + 0.004081 + 0.1936 = 0.291075; F2 = 0.31605 + 0.6181 + 0.162 = 1.09615
    // A2 = 151 + 133.624 * 0.291075 = 189.894; B2 = 141 + 156.624 * 1.09615 - 189.894 = 122.788
    // df = min(0.115 * 3000 / (0.7 * 320.624), 0.65) = min(1.5372, 0.65) = 0.65
    // b = -1.3452 + 4.3254 - 3.7324 - 0.2457 + 1 = 0.0022342
    // h = 189.894 + 122.788 * 0.0022342 = 190.169
    const result = f2ReflectionHeight(
      inputs({
        m3000F2: 2.9,
        foF2MHz: 5.0,
        foEMHz: 1.2,
        r12: 80,
        frequencyMHz: 3.5,
        groundDistanceKm: 9000,
      }),
    );
    expect(result.branch).toBe("5.1b");
    expect(result.hopCount).toBe(3);
    expect(result.skipDistanceKm).toBeNull();
    expect(result.heightKm).toBeCloseTo(190.16881391638876, PRECISION);
  });

  it("case 5: branch (c) at x = 3, low R12, one short hop", () => {
    // M = 3.3, foF2 = 3, foE = 1, R12 = 5, f = 7, D = 800.
    // Eq (2): hr = 275.515; n0 = 1. dmax: x = 3, B = 3.34511, dmax = 4726.5 -> 4000.
    // x = 3 (<= 3.33), y = 3, dM = 0.18/1.6 + 0.096*(-20)/150 = 0.1125 - 0.0128 = 0.0997
    // H = 1490/3.3997 - 316 = 122.274
    // J = -19.240 + 52.767 - 48.39 + 16.07 = 1.2068
    // U = 8e-5 * 42.274 * (1 + 11 * 3^-2.2) + 1.2e-3 * 122.274 * 3^-3.6
    //   = 8e-5 * 42.274 * 1.9807 + 1.2e-3 * 122.274 * 0.019126 = 0.0066987 + 0.0028062 = 0.0095111
    // h = 115 + 122.274 * 1.2068 + 0.0095111 * 800 = 115 + 147.56 + 7.609 = 270.169
    const result = f2ReflectionHeight(
      inputs({
        m3000F2: 3.3,
        foF2MHz: 3.0,
        foEMHz: 1.0,
        r12: 5,
        frequencyMHz: 7.0,
        groundDistanceKm: 800,
      }),
    );
    expect(result.branch).toBe("5.1c");
    expect(result.hopCount).toBe(1);
    expect(result.heightKm).toBeCloseTo(270.16912425835415, PRECISION);
  });

  it("case 6: the 800 km cap engages on branch (c) at low M(3000)F2, R12 = 160 and a 4000 km hop", () => {
    // M = 2.2, foF2 = 2, foE = 1.5, R12 = 160, f = 5, D = 4000.
    // Eq (2): 1490/2.2 - 176 = 501.3 -> 500; grazing 4891 km; n0 = 1.
    // dmax: x = max(1.333, 2) = 2; B = 2.076 + 0.84 * (0.0215 + 0.005 sin(1.9635)) = 2.09794
    //   dmax = 4780 + (12610 + 535 - 3107.5 + 10764.1) * (0.47666 - 0.303) = 8392.4 -> 4000.
    // x = 1.333, y = 1.8, dM = 0.18/0.4 + 0.096*135/150 = 0.45 + 0.0864 = 0.5364
    // H = 1490/2.7364 - 316 = 228.511
    // J = -4.1559 + 18.9961 - 29.034 + 16.07 = 1.87624
    // U = 8e-5 * 148.511 * (1 + 11 * 0.27442) + 1.2e-3 * 228.511 * 0.12052 = 0.047743 + 0.033048 = 0.080789
    // h = 115 + 228.511 * 1.87624 + 0.080789 * 4000 = 115 + 428.74 + 323.15 = 866.90 -> 800
    const result = f2ReflectionHeight(
      inputs({
        m3000F2: 2.2,
        foF2MHz: 2.0,
        foEMHz: 1.5,
        r12: 160,
        frequencyMHz: 5.0,
        groundDistanceKm: 4000,
      }),
    );
    expect(result.branch).toBe("5.1c");
    expect(result.geometryHeightKm).toBe(500);
    expect(result.hopCount).toBe(1);
    expect(result.capped).toBe(true);
    expect(result.uncappedHeightKm).toBeCloseTo(866.8952888119746, PRECISION);
    expect(result.heightKm).toBe(MAX_F2_REFLECTION_HEIGHT_KM);
  });

  it("case 7: D below dmax but beyond one equation (2) hop, so the geometry, not dmax, sets two hops", () => {
    // M = 3.5, foF2 = 7, foE = 1.5, R12 = 60, f = 10, D = 3800.
    // Eq (2): hr = 1490/3.5 - 176 = 249.714; grazing 3510.7 km < 3800, so n0 = 2, d = 1900.
    // dmax: x = 4.6667; B = 3.54196; dmax = 4518.1 -> 4000. D = 3800 <= 4000 even so.
    // x = 4.6667, dM = 0.18/3.2667 + 0.096*35/150 = 0.055102 + 0.0224 = 0.077502
    // H = 1490/3.5775 - 316 = 100.492; xr = 1.42857
    // E1 = -0.28300 + 1.40204 - 1.07229 + 0.6 = 0.64675; F1 = 1.57980
    // G = -8.7555 + 56.822 - 128.878 + 129.243 - 44.73 = 3.73193
    // ds = 160 + 143.492 * 3.73193 = 695.50; a = (1900 - 695.50)/240.492 = 5.00848
    // A1 = 140 + 53.492 * 0.64675 = 174.596; B1 = 150 + 83.492 * 1.5798 - 174.596 = 107.304
    // h = 174.596 + 107.304 * 2.4^-5.00848 = 174.596 + 1.338 = 175.934
    const result = f2ReflectionHeight(
      inputs({
        m3000F2: 3.5,
        foF2MHz: 7.0,
        foEMHz: 1.5,
        r12: 60,
        frequencyMHz: 10.0,
        groundDistanceKm: 3800,
      }),
    );
    expect(result.dmaxKm).toBe(MAX_DMAX_KM);
    expect(result.geometricHopCount).toBe(2);
    expect(result.hopCount).toBe(2);
    expect(result.heightKm).toBeCloseTo(175.93351653521816, PRECISION);
  });
});

describe("f2ReflectionHeight against the ITU reference implementation", () => {
  const cases: ReadonlyArray<[string, F2ReflectionHeightInputs]> = [
    [
      "branch (a), xr > 3.7",
      inputs({
        m3000F2: 3.2,
        foF2MHz: 4,
        foEMHz: 1,
        r12: 25,
        frequencyMHz: 16,
        groundDistanceKm: 1500,
      }),
    ],
    [
      "branch (b)",
      inputs({
        m3000F2: 2.9,
        foF2MHz: 5,
        foEMHz: 1.2,
        r12: 80,
        frequencyMHz: 3.5,
        groundDistanceKm: 9000,
      }),
    ],
    [
      "branch (c)",
      inputs({
        m3000F2: 3.3,
        foF2MHz: 3,
        foEMHz: 1,
        r12: 5,
        frequencyMHz: 7,
        groundDistanceKm: 800,
      }),
    ],
    [
      "branch (c), capped",
      inputs({
        m3000F2: 2.2,
        foF2MHz: 2,
        foEMHz: 1.5,
        r12: 160,
        frequencyMHz: 5,
        groundDistanceKm: 4000,
      }),
    ],
  ];

  it.each(cases)(
    "agrees with the reference exactly where the reference follows the text: %s",
    (_label, input) => {
      const ours = f2ReflectionHeight(input);
      const theirs = referenceMirrorReflectionHeight(
        input.m3000F2,
        input.foF2MHz,
        input.foEMHz,
        input.r12,
        input.frequencyMHz,
        ours.hopGroundDistanceKm,
      );
      expect(ours.heightKm).toBeCloseTo(theirs, 9);
    },
  );

  it("differs from the reference on branch (a) below xr = 3.7 by exactly the skip-distance term the reference drops", () => {
    // Case 1: published h = A1 + B1 2.4^-a = 324.685 km. The reference's G is
    // 3.20886 - 90.47 * 1.33333 = -117.418, ds = 160 + 209.946 * (-117.418)
    // = -24491 km, a = 83.0, 2.4^-83 ~ 0, so it returns A1 = 210.821 km.
    const input = inputs({});
    const ours = f2ReflectionHeight(input);
    const theirs = referenceMirrorReflectionHeight(
      input.m3000F2,
      input.foF2MHz,
      input.foEMHz,
      input.r12,
      input.frequencyMHz,
      ours.hopGroundDistanceKm,
    );
    expect(theirs).toBeCloseTo(210.82112090718027, PRECISION);
    expect(ours.heightKm).toBeCloseTo(324.6850655279803, PRECISION);
    expect(ours.heightKm - theirs).toBeGreaterThan(100);
  });

  it("the published G is continuous to 0.02 at xr = 3.7, and that step is P.533's, not smoothed here", () => {
    // G(3.7) = -2.102 * 187.4161 + 19.5 * 50.653 - 63.15 * 13.69 + 90.47 * 3.7 - 44.73
    //        = -393.949 + 987.734 - 864.524 + 334.739 - 44.73 = 19.2704
    // G(3.7+) = 19.25. ds = 160 + (H + 43) G, so ds steps by 0.0204 (H + 43).
    const base = inputs({ m3000F2: 3.2, foF2MHz: 4, foEMHz: 1, r12: 25 });
    const below = f2ReflectionHeight({ ...base, frequencyMHz: 4 * 3.7 });
    const above = f2ReflectionHeight({ ...base, frequencyMHz: 4 * 3.7000001 });
    const H = below.H;
    const expectedStepKm = (19.270357800000077 - 19.25) * (H + 43);
    expect(below.skipDistanceKm! - above.skipDistanceKm!).toBeCloseTo(
      expectedStepKm,
      4,
    );
    expect(expectedStepKm).toBeGreaterThan(3);
    expect(expectedStepKm).toBeLessThan(8);
  });
});

describe("dmax and the hop count", () => {
  it("dmax is monotonic in M(3000)F2", () => {
    let previous = Number.POSITIVE_INFINITY;
    for (let m = 2.2; m <= 4.0; m += 0.05) {
      const dmax = maximumHopLengthKm(m, 6, 1.5);
      expect(dmax).toBeLessThan(previous);
      previous = dmax;
    }
  });

  it("applies the section 3.5.1.1 floor of 2 on foF2/foE to dmax only", () => {
    // foF2/foE = 1.2 and 2.0 must give the same dmax.
    expect(maximumHopLengthKm(3, 2.4, 2)).toBe(maximumHopLengthKm(3, 4, 2));
    // But section 5.1's own y floor is 1.8, and x itself is unfloored, so the
    // two heights differ.
    const low = f2ReflectionHeight(inputs({ foF2MHz: 2.4, foEMHz: 2 }));
    const two = f2ReflectionHeight(inputs({ foF2MHz: 4, foEMHz: 2 }));
    expect(low.x).toBeCloseTo(1.2, 12);
    expect(low.heightKm).not.toBe(two.heightKm);
  });

  it("uses one hop iff D <= dmax, whenever the equation (2) height reaches D in one hop", () => {
    const base = inputs({ m3000F2: 2.6, foF2MHz: 6, foEMHz: 1.5 });
    // Eq (2): 1490/2.6 - 176 = 397 km; grazing hop 4438 km > 4000 = dmax.
    expect(mirrorHeightFromM3000F2(2.6)).toBeCloseTo(397.077, 3);
    const inside = f2ReflectionHeight({ ...base, groundDistanceKm: 3999 });
    const atLimit = f2ReflectionHeight({ ...base, groundDistanceKm: 4000 });
    const beyond = f2ReflectionHeight({ ...base, groundDistanceKm: 4001 });
    expect(inside.dmaxKm).toBe(MAX_DMAX_KM);
    expect(inside.hopCount).toBe(1);
    expect(atLimit.hopCount).toBe(1);
    expect(beyond.geometricHopCount).toBe(1);
    expect(beyond.hopCount).toBe(2);
  });

  it("calls the equation (2) height of hop.ts for the geometry, not a second copy of it", () => {
    const result = f2ReflectionHeight(inputs({ m3000F2: 2.37 }));
    expect(result.geometryHeightKm).toBe(mirrorHeightFromM3000F2(2.37));
  });

  it("a pinned hopCount is the mode (Table 1c), so the dmax gate does not move it and the height is solved at D/n", () => {
    const base = inputs({ m3000F2: 2.6, foF2MHz: 6, foEMHz: 1.5 });
    // Free: 9000 km over dmax = 4000 km is 3F2.
    const free = f2ReflectionHeight({ ...base, groundDistanceKm: 9000 });
    expect(free.hopCount).toBe(3);
    // Pinned to the mode the midpoint chose, at an outer control point whose
    // own state would have asked for more hops: M(3000)F2 = 4.5 puts the
    // equation (2) height at 155 km (grazing hop 2775 km) and, with
    // foF2/foE at the floor of 2, dmax at 2879 km, both below D/3 = 3000 km.
    // The count stays put.
    const outer = {
      m3000F2: 4.5,
      foF2MHz: 6,
      foEMHz: 3,
      groundDistanceKm: 9000,
    };
    const pinned = f2ReflectionHeight({ ...base, ...outer, hopCount: 3 });
    expect(pinned.hopCount).toBe(3);
    expect(pinned.hopGroundDistanceKm).toBe(3000);
    // And the same inputs unpinned would not have stayed at 3.
    const unpinned = f2ReflectionHeight({ ...base, ...outer });
    expect(unpinned.dmaxKm).toBeLessThan(3000);
    expect(unpinned.geometricHopCount).toBe(4);
    expect(unpinned.hopCount).toBe(4);
    // The pinned height is section 5.1 at 3000 km, not at 2250 km.
    expect(pinned.heightKm).not.toBe(unpinned.heightKm);
    // The pin changes the mode and nothing else: with the free count pinned,
    // the answer is identical.
    const same = f2ReflectionHeight({
      ...base,
      groundDistanceKm: 9000,
      hopCount: 3,
    });
    expect(same.heightKm).toBe(free.heightKm);
    expect(same.branch).toBe(free.branch);
  });
});

describe("f2ReflectionHeight and hop.ts agree", () => {
  const goldens: ReadonlyArray<F2ReflectionHeightInputs> = [
    inputs({}),
    inputs({
      m3000F2: 3.2,
      foF2MHz: 4,
      foEMHz: 1,
      r12: 25,
      frequencyMHz: 16,
      groundDistanceKm: 1500,
    }),
    inputs({
      m3000F2: 3.1,
      foF2MHz: 5,
      foEMHz: 1.4,
      r12: 100,
      frequencyMHz: 12,
      groundDistanceKm: 6000,
    }),
    inputs({
      m3000F2: 2.9,
      foF2MHz: 5,
      foEMHz: 1.2,
      r12: 80,
      frequencyMHz: 3.5,
      groundDistanceKm: 9000,
    }),
    inputs({
      m3000F2: 3.3,
      foF2MHz: 3,
      foEMHz: 1,
      r12: 5,
      frequencyMHz: 7,
      groundDistanceKm: 800,
    }),
    inputs({
      m3000F2: 2.2,
      foF2MHz: 2,
      foEMHz: 1.5,
      r12: 160,
      frequencyMHz: 5,
      groundDistanceKm: 4000,
    }),
    inputs({
      m3000F2: 3.5,
      foF2MHz: 7,
      foEMHz: 1.5,
      r12: 60,
      frequencyMHz: 10,
      groundDistanceKm: 3800,
    }),
  ];

  it.each(goldens.map((g, i) => [i + 1, g] as const))(
    "golden case %i: hopGeometry supports the chosen hop count at the returned height",
    (_index, input) => {
      const result = f2ReflectionHeight(input);
      const geometry = hopGeometry({
        groundDistanceKm: input.groundDistanceKm,
        hopCount: result.hopCount,
        mirrorHeightKm: result.heightKm,
      });
      expect(geometry.kind).toBe("supported");
      if (geometry.kind !== "supported") return;
      expect(geometry.hopGroundDistanceKm).toBe(result.hopGroundDistanceKm);
      expect(geometry.elevationAngleRad).toBeGreaterThan(0);
    },
  );
});

describe("f2ReflectionHeight input guards", () => {
  it.each([
    ["m3000F2", { m3000F2: 0 }],
    ["m3000F2", { m3000F2: Number.NaN }],
    ["foF2MHz", { foF2MHz: -1 }],
    ["foEMHz", { foEMHz: 0 }],
    ["foEMHz", { foEMHz: Number.POSITIVE_INFINITY }],
    ["frequencyMHz", { frequencyMHz: 0 }],
    ["r12", { r12: -1 }],
    ["r12", { r12: Number.NaN }],
    ["groundDistanceKm", { groundDistanceKm: -1 }],
    ["groundDistanceKm", { groundDistanceKm: Number.NaN }],
    ["hopCount", { hopCount: 0 }],
    ["hopCount", { hopCount: 1.5 }],
    ["hopCount", { hopCount: 1001 }],
  ] as const)(
    "throws a RangeError naming %s rather than clamping",
    (name, bad) => {
      expect(() => f2ReflectionHeight(inputs(bad))).toThrow(RangeError);
      expect(() => f2ReflectionHeight(inputs(bad))).toThrow(name);
    },
  );

  it("accepts a zero-length circuit as one hop of zero length", () => {
    const result = f2ReflectionHeight(inputs({ groundDistanceKm: 0 }));
    expect(result.hopCount).toBe(1);
    expect(result.hopGroundDistanceKm).toBe(0);
    expect(Number.isFinite(result.heightKm)).toBe(true);
  });
});
