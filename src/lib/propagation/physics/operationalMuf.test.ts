// @vitest-environment node

import { describe, expect, it } from "vitest";

import {
  resolveRoute,
  type ResolvedRoute,
} from "@/lib/propagation/geometry/route";
import { basicMuf, type ResolvedBasicMuf } from "./basicMuf";
import ropTable from "./assets/p1240-rop.json";
import {
  dayOrNightFromSolarZenith,
  dayOrNightFromUtcSunTimes,
  eirpBand,
  operationalMuf,
  p533Season,
  ropFactor,
  E_MODE_DECILE_FACTORS,
  EIRP_BAND_BOUNDARY_DBW,
} from "./operationalMuf";

function routeOfLength(groundDistanceKm: number): ResolvedRoute {
  const base = resolveRoute(
    { latitudeDeg: 0, longitudeDeg: 0 },
    { latitudeDeg: 10, longitudeDeg: 40 },
  );
  if (base.kind !== "resolved") throw new Error("fixture route is degenerate");
  return { ...base, groundDistanceKm, arcAngleRad: groundDistanceKm / 6371 };
}

function shortPathBasicMuf(): ResolvedBasicMuf {
  const result = basicMuf({
    route: routeOfLength(1200),
    sample: () => ({
      foF2MHz: 8,
      m3000F2: 3,
      foEMHz: 2,
      gyrofrequency300kmMHz: 1.2,
    }),
  });
  if (result.kind !== "resolved") throw new Error(result.detail);
  return result;
}

describe("the P.1240 Table 1 asset", () => {
  it("carries its recommendation, table, edition and the limits of its provenance", () => {
    expect(ropTable.provenance.recommendation).toBe("ITU-R P.1240");
    expect(ropTable.provenance.edition).toBe("P.1240-1");
    expect(ropTable.provenance.table).toBe("Table 1");
    // The high-EIRP band is second-hand and unconfirmed. If that ever stops
    // being true the caveat has to be rewritten, and this fails until it is.
    expect(ropTable.provenance.transcription_caveat).toContain(
      "NOT confirmed by any evidence we hold",
    );
  });

  it("is indexed band, season, day/night and not transposed", () => {
    // Within the 30 dBW and below band the operational MUF sits further above
    // the basic MUF at night than by day, in every season, and furthest above
    // it in winter. A transposed lookup breaks both orderings.
    for (const season of ["winter", "equinox", "summer"] as const) {
      expect(ropFactor("le_30_dbw", season, "night")).toBeGreaterThan(
        ropFactor("le_30_dbw", season, "day"),
      );
    }
    expect(ropFactor("le_30_dbw", "winter", "day")).toBe(1.2);
    expect(ropFactor("le_30_dbw", "winter", "night")).toBe(1.3);
    expect(ropFactor("le_30_dbw", "equinox", "day")).toBe(1.15);
    expect(ropFactor("le_30_dbw", "equinox", "night")).toBe(1.25);
    expect(ropFactor("le_30_dbw", "summer", "day")).toBe(1.1);
    expect(ropFactor("le_30_dbw", "summer", "night")).toBe(1.2);
  });

  it("splits the EIRP bands at 30 dBW inclusive of the boundary", () => {
    expect(eirpBand(EIRP_BAND_BOUNDARY_DBW)).toBe("le_30_dbw");
    expect(eirpBand(EIRP_BAND_BOUNDARY_DBW + 1e-9)).toBe("gt_30_dbw");
    expect(eirpBand(-10)).toBe("le_30_dbw");
  });
});

describe("the season the Rop row is chosen by", () => {
  it("swaps winter and summer across the equator and leaves equinox alone", () => {
    expect(p533Season(40, 1)).toBe("winter");
    expect(p533Season(-40, 1)).toBe("summer");
    expect(p533Season(40, 7)).toBe("summer");
    expect(p533Season(-40, 7)).toBe("winter");
    for (const month of [3, 4, 9, 10]) {
      expect(p533Season(40, month)).toBe("equinox");
      expect(p533Season(-40, month)).toBe("equinox");
    }
  });

  it("covers every month and puts the equator on the northern calendar", () => {
    expect([11, 12, 1, 2].map((m) => p533Season(0, m))).toEqual([
      "winter",
      "winter",
      "winter",
      "winter",
    ]);
    expect([5, 6, 7, 8].map((m) => p533Season(0, m))).toEqual([
      "summer",
      "summer",
      "summer",
      "summer",
    ]);
    expect(() => p533Season(0, 0)).toThrow(RangeError);
    expect(() => p533Season(0, 13)).toThrow(RangeError);
  });
});

describe("day and night", () => {
  it("splits at the refracted horizon by solar zenith", () => {
    expect(dayOrNightFromSolarZenith(13)).toBe("day");
    expect(dayOrNightFromSolarZenith(90.8)).toBe("day");
    expect(dayOrNightFromSolarZenith(90.833)).toBe("night");
    expect(dayOrNightFromSolarZenith(120)).toBe("night");
  });

  it("reproduces the reference's wrapped-UTC test, including golden case G02", () => {
    // Austin to Dallas in July at 18 UTC. Mid-path sunrise is about 11.5 UTC
    // and sunset about 26.1 UTC, which fmod wraps to 2.1. The reference's
    // test is then 18 < 2.1 && 18 > 11.5, which is false, so the whole day is
    // NIGHT and the circuit is charged the 1.20 summer-night Rop. The sun is
    // 13 degrees from the zenith at that moment.
    expect(
      dayOrNightFromUtcSunTimes({
        hourUtc: 18,
        sunriseUtcHours: 11.5,
        sunsetUtcHours: 2.1,
      }),
    ).toBe("night");
    expect(dayOrNightFromSolarZenith(13)).toBe("day");
    expect(
      ropFactor("le_30_dbw", "summer", "night") -
        ropFactor("le_30_dbw", "summer", "day"),
    ).toBeCloseTo(0.1, 12);
  });

  it("agrees with the zenith test when sunset does not cross midnight UTC", () => {
    expect(
      dayOrNightFromUtcSunTimes({
        hourUtc: 12,
        sunriseUtcHours: 6,
        sunsetUtcHours: 18,
      }),
    ).toBe("day");
    expect(
      dayOrNightFromUtcSunTimes({
        hourUtc: 3,
        sunriseUtcHours: 6,
        sunsetUtcHours: 18,
      }),
    ).toBe("night");
  });
});

describe("the path operational MUF", () => {
  const base = shortPathBasicMuf();

  it("leaves E modes at their basic MUF and scales F2 modes by Rop", () => {
    const result = operationalMuf({
      basicMuf: base,
      season: "winter",
      dayOrNight: "night",
      eirpDbW: 20,
    });
    expect(result.ropFactor).toBe(1.3);
    for (const mode of result.modes) {
      expect(mode.operationalMufMHz).toBeCloseTo(
        mode.basicMufMHz * (mode.layer === "E" ? 1 : 1.3),
        12,
      );
      expect(mode.ropFactor).toBe(mode.layer === "E" ? 1 : 1.3);
    }
    expect(result.pathOperationalMufMHz).toBeCloseTo(
      Math.max(...result.modes.map((mode) => mode.operationalMufMHz)),
      12,
    );
    // The path basic MUF here is an F2 mode's, so the path operational MUF is
    // exactly Rop times it.
    expect(result.pathOperationalMufMHz).toBeCloseTo(
      base.pathBasicMufMHz * 1.3,
      12,
    );
  });

  it("gives E deciles from the recommendation's own 1.05 and 0.95", () => {
    const result = operationalMuf({
      basicMuf: base,
      season: "equinox",
      dayOrNight: "day",
      eirpDbW: 20,
    });
    const eMode = result.modes.find((mode) => mode.layer === "E");
    expect(eMode).toBeDefined();
    if (eMode === undefined) return;
    expect(eMode.operationalMuf10MHz).toEqual({
      known: true,
      valueMHz: eMode.operationalMufMHz * E_MODE_DECILE_FACTORS.upper,
    });
    expect(eMode.operationalMuf90MHz).toEqual({
      known: true,
      valueMHz: eMode.operationalMufMHz * E_MODE_DECILE_FACTORS.lower,
    });
  });

  it("refuses to invent an F2 decile while #1102 is unlanded", () => {
    const result = operationalMuf({
      basicMuf: base,
      season: "summer",
      dayOrNight: "day",
      eirpDbW: 20,
    });
    const f2Mode = result.modes.find((mode) => mode.layer === "F2");
    expect(f2Mode?.operationalMuf10MHz.known).toBe(false);
    expect(f2Mode?.operationalMuf90MHz.known).toBe(false);
    if (f2Mode !== undefined && !f2Mode.operationalMuf90MHz.known) {
      expect(f2Mode.operationalMuf90MHz.reason).toContain("#1102");
    }
    // The path maximum is unknown too: the largest known decile is a lower
    // bound on the path value, not the path value.
    expect(result.pathOperationalMuf10MHz.known).toBe(false);
    expect(result.pathOperationalMuf90MHz.known).toBe(false);
  });

  it("returns the F2 deciles as soon as the factors are supplied", () => {
    const result = operationalMuf({
      basicMuf: base,
      season: "summer",
      dayOrNight: "day",
      eirpDbW: 20,
      mufDecileFactors: { lower: 0.82, upper: 1.16 },
    });
    const f2Mode = result.modes.find((mode) => mode.layer === "F2");
    expect(f2Mode?.operationalMuf90MHz).toEqual({
      known: true,
      valueMHz: (f2Mode?.operationalMufMHz as number) * 0.82,
    });
    expect(result.pathOperationalMuf10MHz.known).toBe(true);
    if (result.pathOperationalMuf10MHz.known) {
      expect(result.pathOperationalMuf10MHz.valueMHz).toBeCloseTo(
        base.pathBasicMufMHz * 1.1 * 1.16,
        10,
      );
    }
  });
});
