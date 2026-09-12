// @vitest-environment node

import { describe, expect, it } from "vitest";

import { MAX_R12 } from "@/lib/propagation/ionosphere/numericalMap";
import {
  circuitDomain,
  DECLARED_DOMAIN,
  MAN_MADE_NOISE_CATEGORIES,
  MAX_FREQUENCY_MHZ,
  MAX_MONTH,
  MAX_UTC_HOUR,
  MIN_FREQUENCY_MHZ,
  MIN_MONTH,
  MIN_UTC_HOUR,
  MODEL_ID,
  PATH_DIRECTIONS,
  UNMODELLED_MECHANISMS,
  type CircuitDomainReason,
  type CircuitRequest,
} from "./domain";
import { MAX_ROUTE_DISTANCE_KM } from "./longPath/fM";

/**
 * The domain module is a statement, so these tests read it as one: every bound
 * is checked from both sides, every refusal is checked for the reason AND for
 * the declared interval appearing in the detail, and nothing is allowed to
 * throw. A domain that refuses without saying what it would have accepted is
 * not a declared domain.
 */
const BASE: CircuitRequest = {
  transmitter: { latitudeDeg: 30.3, longitudeDeg: -97.7 },
  receiver: { latitudeDeg: 51.5, longitudeDeg: -0.1 },
  frequencyMHz: 14.1,
  month: 6,
  utcHour: 12,
  r12: 50,
  bandwidthHz: 2500,
  manMadeNoise: { kind: "category", category: "residential" },
};

function ask(overrides: Partial<CircuitRequest>) {
  return circuitDomain({ ...BASE, ...overrides });
}

function refusedWith(
  overrides: Partial<CircuitRequest>,
  reason: CircuitDomainReason,
): string {
  const result = ask(overrides);
  expect(result.kind).toBe("out_of_domain");
  if (result.kind !== "out_of_domain") throw new Error("unreachable");
  expect(result.reason).toBe(reason);
  expect(result.declaredDomain).toBe(DECLARED_DOMAIN);
  return result.detail;
}

describe("the declared domain itself", () => {
  it("names the model identity contract M03 gives the TypeScript leaves", () => {
    expect(MODEL_ID).toBe("propulse-physics-v1");
    expect(DECLARED_DOMAIN.modelId).toBe(MODEL_ID);
  });

  it("is P.533-14's own 2 to 30 MHz", () => {
    // recommends 1: "that the information contained in Annex 1 should be used
    // for the prediction of sky-wave propagation at frequencies between 2 and
    // 30 MHz".
    expect(DECLARED_DOMAIN.frequencyMHz).toEqual({ min: 2, max: 30 });
  });

  it("declares the layers it models and the mechanisms it does not", () => {
    expect(DECLARED_DOMAIN.layers).toEqual(["E", "F2"]);
    // The absent mechanisms are declared rather than refused, because no field
    // of a request selects one. A reader is entitled to know which claim was
    // made about a circuit that is in fact carried by sporadic E.
    expect(DECLARED_DOMAIN.unmodelledMechanisms).toEqual(UNMODELLED_MECHANISMS);
    expect(DECLARED_DOMAIN.unmodelledMechanisms).toContain("sporadic_e");
    expect(DECLARED_DOMAIN.unmodelledMechanisms).toContain("ground_wave");
    expect(DECLARED_DOMAIN.unmodelledMechanisms).toContain("f1_layer");
  });

  it("is frozen, so a caller cannot widen it by writing to it", () => {
    expect(Object.isFrozen(DECLARED_DOMAIN)).toBe(true);
    expect(Object.isFrozen(DECLARED_DOMAIN.frequencyMHz)).toBe(true);
    expect(Object.isFrozen(DECLARED_DOMAIN.layers)).toBe(true);
  });
});

describe("an admitted request", () => {
  it("comes back with the route resolved exactly once", () => {
    // Contract M06. The route is on the admission, so the solver has no reason
    // to resolve a second one and no way to disagree with itself about the
    // path length or the azimuth.
    const result = ask({});
    expect(result.kind).toBe("admitted");
    if (result.kind !== "admitted") return;
    expect(result.route.kind).toBe("resolved");
    expect(result.route.direction).toBe("short");
    expect(result.route.groundDistanceKm).toBeGreaterThan(7000);
    expect(result.route.groundDistanceKm).toBeLessThan(8500);
    expect(result.request).toBe(result.request);
  });

  it("honours a long-path request", () => {
    const result = ask({ pathDirection: "long" });
    expect(result.kind).toBe("admitted");
    if (result.kind !== "admitted") return;
    expect(result.route.direction).toBe("long");
    const short = ask({});
    if (short.kind !== "admitted") throw new Error("unreachable");
    expect(
      result.route.groundDistanceKm + short.route.groundDistanceKm,
    ).toBeCloseTo(MAX_ROUTE_DISTANCE_KM, 6);
  });

  it("admits both ends of every interval", () => {
    for (const frequencyMHz of [MIN_FREQUENCY_MHZ, MAX_FREQUENCY_MHZ]) {
      expect(ask({ frequencyMHz }).kind).toBe("admitted");
    }
    for (const month of [MIN_MONTH, MAX_MONTH]) {
      expect(ask({ month }).kind).toBe("admitted");
    }
    for (const utcHour of [MIN_UTC_HOUR, MAX_UTC_HOUR]) {
      expect(ask({ utcHour }).kind).toBe("admitted");
    }
    for (const r12 of [0, MAX_R12]) {
      expect(ask({ r12 }).kind).toBe("admitted");
    }
  });

  it("admits every man-made noise category and an explicit figure", () => {
    for (const category of MAN_MADE_NOISE_CATEGORIES) {
      expect(ask({ manMadeNoise: { kind: "category", category } }).kind).toBe(
        "admitted",
      );
    }
    expect(
      ask({ manMadeNoise: { kind: "explicit", famAt1MHzDb: 63.5 } }).kind,
    ).toBe("admitted");
  });

  it("names the four categories ITU-R P.372-17 Table 1 publishes", () => {
    // Not a list this module chose. Table 1 of P.372-17 has five rows and the
    // fifth, curve E, is galactic noise, which is not an environment: it is
    // added to every circuit whatever the site is.
    expect([...MAN_MADE_NOISE_CATEGORIES]).toEqual([
      "city",
      "residential",
      "rural",
      "quiet_rural",
    ]);
  });

  it("admits a receiver whose man-made noise is not known at all", () => {
    // The third kind, and the reason it exists. A caller with a site P.372-17
    // does not describe gets a MUF and a field strength; what it must not get
    // is a noise figure invented from a neighbouring category.
    const result = ask({
      manMadeNoise: {
        kind: "unavailable",
        reason: "the site category is not one P.372-17 Table 1 publishes",
      },
    });
    expect(result.kind).toBe("admitted");
  });
});

describe("the frequency band", () => {
  it("refuses below 2 MHz and above 30 MHz, and never clamps", () => {
    const low = refusedWith(
      { frequencyMHz: 1.999 },
      "unsupported_frequency_band",
    );
    expect(low).toContain("2");
    expect(low).toContain("30");
    expect(low).toContain("not clamped");
    refusedWith({ frequencyMHz: 30.001 }, "unsupported_frequency_band");
    refusedWith({ frequencyMHz: 0 }, "unsupported_frequency_band");
    refusedWith({ frequencyMHz: Number.NaN }, "unsupported_frequency_band");
    refusedWith(
      { frequencyMHz: Number.POSITIVE_INFINITY },
      "unsupported_frequency_band",
    );
  });

  it("quotes the recommendation rather than asserting the bound", () => {
    const detail = refusedWith(
      { frequencyMHz: 50 },
      "unsupported_frequency_band",
    );
    expect(detail).toContain("sky-wave propagation at frequencies");
    expect(detail).toContain("50 MHz");
  });
});

describe("the route", () => {
  it("refuses coincident and antipodal endpoints", () => {
    const coincident = refusedWith(
      { receiver: BASE.transmitter },
      "unsupported_route_geometry",
    );
    expect(coincident).toContain("coincident_endpoints");
    const antipode = {
      latitudeDeg: -BASE.transmitter.latitudeDeg,
      longitudeDeg: BASE.transmitter.longitudeDeg + 180,
    };
    const antipodal = refusedWith(
      { receiver: antipode },
      "unsupported_route_geometry",
    );
    expect(antipodal).toContain("antipodal_endpoints");
  });

  it("refuses a coordinate that is not on the sphere", () => {
    refusedWith(
      { transmitter: { latitudeDeg: 91, longitudeDeg: 0 } },
      "unsupported_coordinates",
    );
    refusedWith(
      { receiver: { latitudeDeg: 0, longitudeDeg: Number.NaN } },
      "unsupported_coordinates",
    );
    const detail = refusedWith(
      { receiver: { latitudeDeg: -90.5, longitudeDeg: 10 } },
      "unsupported_coordinates",
    );
    expect(detail).toContain("receiver");
    expect(detail).toContain("[-90, 90]");
  });
});

describe("the path direction", () => {
  it("names the two directions geometry/route.ts resolves", () => {
    expect([...PATH_DIRECTIONS]).toEqual(["short", "long"]);
  });

  it("admits every member of the literal set", () => {
    for (const pathDirection of PATH_DIRECTIONS) {
      const result = ask({ pathDirection });
      expect(result.kind).toBe("admitted");
      if (result.kind !== "admitted") continue;
      expect(result.route.direction).toBe(pathDirection);
    }
  });

  it("refuses a near-miss typo rather than defaulting to the short path", () => {
    // "lng" is the finding this guards: resolveRoute only recognises the
    // literal "long", so anything else would silently get short-path
    // geometry while the invalid value is copied into route.direction,
    // leaving the label and the geometry disagreeing.
    const detail = refusedWith(
      { pathDirection: "lng" as CircuitRequest["pathDirection"] },
      "unsupported_path_direction",
    );
    expect(detail).toContain("lng");
    expect(detail).toContain("short");
    expect(detail).toContain("long");
  });

  it("refuses the wrong case", () => {
    refusedWith(
      { pathDirection: "Long" as CircuitRequest["pathDirection"] },
      "unsupported_path_direction",
    );
    refusedWith(
      { pathDirection: "SHORT" as CircuitRequest["pathDirection"] },
      "unsupported_path_direction",
    );
  });

  it("names the field in the refusal detail", () => {
    const detail = refusedWith(
      { pathDirection: "lng" as CircuitRequest["pathDirection"] },
      "unsupported_path_direction",
    );
    expect(detail).toContain("path direction");
  });
});

describe("the time and the solar index", () => {
  it("refuses a month outside 1 to 12 or one that is not an integer", () => {
    refusedWith({ month: 0 }, "unsupported_month");
    refusedWith({ month: 13 }, "unsupported_month");
    // 6.5 is not a coefficient block. Rounding it silently would move the
    // answer by up to half a month of solar cycle without saying so.
    const detail = refusedWith({ month: 6.5 }, "unsupported_month");
    expect(detail).toContain("integer months");
    refusedWith({ month: Number.NaN }, "unsupported_month");
  });

  it("refuses an hour outside 0 to 23 or one that is not an integer", () => {
    refusedWith({ utcHour: -1 }, "unsupported_utc_hour");
    refusedWith({ utcHour: 24 }, "unsupported_utc_hour");
    refusedWith({ utcHour: 12.25 }, "unsupported_utc_hour");
  });

  it("refuses an R12 the maps were not fitted for, rather than clipping", () => {
    refusedWith({ r12: -1 }, "unsupported_solar_index");
    const detail = refusedWith({ r12: MAX_R12 + 1 }, "unsupported_solar_index");
    expect(detail).toContain(String(MAX_R12));
    expect(detail).toContain("clip");
    refusedWith({ r12: Number.NaN }, "unsupported_solar_index");
  });
});

describe("the receiver", () => {
  it("refuses a bandwidth equation (45) has no logarithm for", () => {
    const detail = refusedWith({ bandwidthHz: 0 }, "unsupported_bandwidth");
    expect(detail).toContain("10 log10 b");
    refusedWith({ bandwidthHz: -2500 }, "unsupported_bandwidth");
    refusedWith(
      { bandwidthHz: Number.POSITIVE_INFINITY },
      "unsupported_bandwidth",
    );
  });

  it("refuses a man-made noise setting P.372 section 5 does not name", () => {
    const detail = refusedWith(
      {
        manMadeNoise: {
          kind: "category",
          category: "suburban" as (typeof MAN_MADE_NOISE_CATEGORIES)[number],
        },
      },
      "unsupported_noise_environment",
    );
    expect(detail).toContain("suburban");
    for (const category of MAN_MADE_NOISE_CATEGORIES) {
      expect(detail).toContain(category);
    }
    refusedWith(
      { manMadeNoise: { kind: "explicit", famAt1MHzDb: Number.NaN } },
      "unsupported_noise_environment",
    );
  });

  it("refuses a negative decile deviation, because it is a magnitude", () => {
    // snrDecileDeviations (signalDeciles.ts) applies these directionally,
    // fa - dl and fa + du: a negative value would move the noise the wrong
    // way and yield a plausible but wrong SNR decile.
    let detail = refusedWith(
      {
        manMadeNoise: {
          kind: "explicit",
          famAt1MHzDb: 63.5,
          upperDecileDb: -0.001,
        },
      },
      "unsupported_noise_environment",
    );
    expect(detail).toContain("the upper decile");
    detail = refusedWith(
      {
        manMadeNoise: {
          kind: "explicit",
          famAt1MHzDb: 63.5,
          lowerDecileDb: -0.001,
        },
      },
      "unsupported_noise_environment",
    );
    expect(detail).toContain("the lower decile");
  });

  it("admits a zero decile deviation on either side", () => {
    expect(
      ask({
        manMadeNoise: {
          kind: "explicit",
          famAt1MHzDb: 63.5,
          upperDecileDb: 0,
          lowerDecileDb: 0,
        },
      }).kind,
    ).toBe("admitted");
  });

  it("refuses the two categories that are software conventions, not P.372", () => {
    // "quiet" and "noisy" are in the pinned ITU reference build and in most HF
    // prediction software. Neither is in P.372-17 Table 1, so neither has a
    // published c and d, and admitting them would put two unsourced constants
    // behind the same interface as four sourced ones.
    for (const category of ["quiet", "noisy"]) {
      const detail = refusedWith(
        {
          manMadeNoise: {
            kind: "category",
            category: category as (typeof MAN_MADE_NOISE_CATEGORIES)[number],
          },
        },
        "unsupported_noise_environment",
      );
      expect(detail).toContain(category);
      expect(detail).toContain("P.372-17 Table 1");
      expect(detail).toContain("unavailable");
    }
  });
});

describe("the power budget", () => {
  it("refuses a non-finite transmitter power, transmitter gain or receiver gain", () => {
    let detail = refusedWith(
      { transmitterPowerDbKw: Number.NaN },
      "unsupported_power_budget",
    );
    expect(detail).toContain("equations (43) and (44)");
    detail = refusedWith(
      { transmitterGainDbi: Number.POSITIVE_INFINITY },
      "unsupported_power_budget",
    );
    expect(detail).toContain("equations (43) and (44)");
    detail = refusedWith(
      { receiverGainDbi: Number.NEGATIVE_INFINITY },
      "unsupported_power_budget",
    );
    expect(detail).toContain("equations (43) and (44)");
  });

  it("refuses a non-finite otherLossesDb", () => {
    const detail = refusedWith(
      { otherLossesDb: Number.NaN },
      "unsupported_power_budget",
    );
    expect(detail).toContain("equations (43) and (44)");
  });

  it("refuses a negative otherLossesDb, because it is a loss", () => {
    const detail = refusedWith(
      { otherLossesDb: -0.01 },
      "unsupported_power_budget",
    );
    expect(detail).toContain("cannot be negative");
  });

  it("admits the valid boundary: zero loss and finite gains either side of zero", () => {
    const result = ask({
      transmitterPowerDbKw: -10,
      transmitterGainDbi: -3,
      receiverGainDbi: 0,
      otherLossesDb: 0,
    });
    expect(result.kind).toBe("admitted");
  });

  it("admits a request that supplies no power budget fields at all", () => {
    expect(ask({}).kind).toBe("admitted");
  });
});

describe("nothing throws, whatever it is handed", () => {
  it("answers every malformed request with a label", () => {
    const hostile: readonly Partial<CircuitRequest>[] = [
      { frequencyMHz: Number.NaN },
      { frequencyMHz: Number.NEGATIVE_INFINITY },
      { month: Number.POSITIVE_INFINITY },
      { utcHour: Number.NaN },
      { r12: Number.POSITIVE_INFINITY },
      { bandwidthHz: Number.NaN },
      { transmitterPowerDbKw: Number.NaN },
      { transmitterGainDbi: Number.POSITIVE_INFINITY },
      { receiverGainDbi: Number.NEGATIVE_INFINITY },
      { otherLossesDb: Number.NaN },
      { transmitter: { latitudeDeg: Number.NaN, longitudeDeg: Number.NaN } },
      {
        transmitter: { latitudeDeg: 1e9, longitudeDeg: 1e9 },
        receiver: { latitudeDeg: -1e9, longitudeDeg: -1e9 },
      },
      { receiver: BASE.transmitter, frequencyMHz: Number.NaN },
    ];
    for (const overrides of hostile) {
      const result = ask(overrides);
      expect(result.kind).toBe("out_of_domain");
      if (result.kind !== "out_of_domain") continue;
      expect(typeof result.detail).toBe("string");
      expect(result.detail.length).toBeGreaterThan(20);
      expect(result.declaredDomain.modelId).toBe(MODEL_ID);
    }
  });

  it("leaves the request object untouched", () => {
    const request: CircuitRequest = { ...BASE, frequencyMHz: 100 };
    const before = JSON.stringify(request);
    circuitDomain(request);
    expect(JSON.stringify(request)).toBe(before);
  });
});
