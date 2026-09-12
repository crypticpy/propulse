// @vitest-environment node

import { describe, expect, it } from "vitest";

import tables from "../assets/p533-fl-tables.json";
import {
  EARTH_RADIUS_KM,
  resolveRoute,
  type GeodeticPoint,
  type ResolvedRoute,
} from "@/lib/propagation/geometry/route";
import { hopGeometry } from "@/lib/propagation/geometry/hop";
import { MAX_ROUTE_DISTANCE_KM } from "./fM";
import {
  applySunsetDecay,
  longPathLuf,
  nightLufMHz,
  rawLufMHz,
  solarHourAngleRad,
  solarZenithCosine,
  subsolarLatitudeDeg,
  winterAnomalyFactor,
  LUF_COEFFICIENT,
  LUF_DECAY_EXPONENT,
  LUF_DECAY_HOURS,
  LUF_DECAY_PER_HOUR,
  LUF_MAX_HOP_KM,
  LUF_PATH_CONSTANT_KM,
  LUF_PENETRATION_HEIGHT_KM,
  LUF_REFLECTION_HEIGHT_KM,
  LUF_SUNSPOT_COEFFICIENT,
  NIGHT_LUF_DISTANCE_KM,
  WINTER_ANOMALY_LATITUDES_DEG,
  type ResolvedLongPathLuf,
} from "./fL";

/**
 * Every expected number here is transcribed from the published equations again
 * in this file, or worked out by hand in the comment above the assertion.
 *
 *   fL  = (5.3 [(1 + 0.009 R12) sum cos^0.5 chi
 *              / (cos(i90) log_e(9.5e6/p'))]^0.5 - fH) (Aw + 1)          (33)
 *   cos chi = sin(phi) sin(delta) + cos(phi) cos(delta) cos(eta)         (34)
 *   eta = (UTC/12 - 1) pi + y                                            (35)
 *   fLN = sqrt(D / 3000)                                                 (36)
 *   fL(tr)   = e^-0.23 fL(tr-1) (dt (1 - e^-0.23) + e^-0.23)             (37)
 *   fL(tr+n) = fL(tr+n-1) e^-0.23                                        (38)
 */
const DEG_TO_RAD = Math.PI / 180;

function route(tx: GeodeticPoint, rx: GeodeticPoint): ResolvedRoute {
  const resolved = resolveRoute(tx, rx);
  if (resolved.kind !== "resolved") {
    throw new Error(`fixture route is ${resolved.kind}`);
  }
  return resolved;
}

function stretched(base: ResolvedRoute, groundDistanceKm: number): ResolvedRoute {
  return {
    ...base,
    groundDistanceKm,
    arcAngleRad: groundDistanceKm / EARTH_RADIUS_KM,
  };
}

/** Due east along the equator from the prime meridian. */
const EQUATORIAL = route(
  { latitudeDeg: 0, longitudeDeg: 0 },
  { latitudeDeg: 0, longitudeDeg: 80 },
);

/** Up the prime meridian from the equator into the northern mid-latitudes. */
const MERIDIONAL = route(
  { latitudeDeg: 10, longitudeDeg: 0 },
  { latitudeDeg: 80, longitudeDeg: 0 },
);

interface LufCall {
  readonly route?: ResolvedRoute;
  readonly monthIndex?: number;
  readonly utcHour?: number;
  readonly r12?: number;
  readonly gyrofrequencyMHz?: number;
  readonly virtualSlantRangeKm?: number;
}

function call(overrides: LufCall = {}): ReturnType<typeof longPathLuf> {
  return longPathLuf({
    route: overrides.route ?? stretched(EQUATORIAL, 8095.11),
    monthIndex: overrides.monthIndex ?? 3,
    utcHour: overrides.utcHour ?? 12,
    r12: overrides.r12 ?? 100,
    gyrofrequencyMHz: overrides.gyrofrequencyMHz ?? 1.2,
    virtualSlantRangeKm: overrides.virtualSlantRangeKm ?? 8461.71,
  });
}

function resolved(overrides: LufCall = {}): ResolvedLongPathLuf {
  const result = call(overrides);
  if (result.kind !== "resolved") {
    throw new Error(`${result.reason}: ${result.detail}`);
  }
  return result;
}

describe("Table 4, the subsolar latitude for the middle of the month", () => {
  it("carries the twelve published values in calendar order", () => {
    expect(tables.table_4.subsolar_latitude_deg).toEqual([
      -21.2, -12.7, -2.2, 9.7, 18.8, 23.3, 21.6, 14.1, 3.1, -8.4, -18.4, -23.3,
    ]);
  });

  it("reads every month out through the accessor", () => {
    for (let month = 0; month < 12; month += 1) {
      expect(subsolarLatitudeDeg(month)).toBe(
        tables.table_4.subsolar_latitude_deg[month],
      );
    }
  });

  it("stays inside the tropics, as a subsolar latitude must", () => {
    for (const value of tables.table_4.subsolar_latitude_deg) {
      expect(Math.abs(value)).toBeLessThanOrEqual(23.45);
    }
    // The solstice months carry the extremes and the equinox months the near
    // zeros, which is what makes this a declination and not an arbitrary row.
    expect(subsolarLatitudeDeg(5)).toBeGreaterThan(23);
    expect(subsolarLatitudeDeg(11)).toBeLessThan(-23);
    expect(Math.abs(subsolarLatitudeDeg(2))).toBeLessThan(3);
    expect(Math.abs(subsolarLatitudeDeg(8))).toBeLessThan(4);
  });
});

describe("Table 5, the winter-anomaly factor", () => {
  it("carries both published rows", () => {
    expect(tables.table_5.northern).toEqual([
      0.3, 0.15, 0.03, 0.0, 0.0, 0.0, 0.0, 0.0, 0.01, 0.03, 0.15, 0.3,
    ]);
    expect(tables.table_5.southern).toEqual([
      0.0, 0.0, 0.0, 0.03, 0.15, 0.3, 0.3, 0.15, 0.03, 0.0, 0.0, 0.0,
    ]);
  });

  it("keeps the published northern September value of 0.01", () => {
    // The pinned reference's array holds 0.00 here and is exactly
    // antisymmetric under a six-month shift, which the published table is not.
    // See deviation 6.
    expect(tables.table_5.northern[8]).toBe(0.01);
    expect(tables.table_5.southern[2]).toBe(0.0);
  });

  it("returns each table cell at 60 degrees in its own hemisphere", () => {
    const [, mid] = WINTER_ANOMALY_LATITUDES_DEG;
    for (let month = 0; month < 12; month += 1) {
      expect(winterAnomalyFactor(mid, month)).toBeCloseTo(
        tables.table_5.northern[month],
        12,
      );
      expect(winterAnomalyFactor(-mid, month)).toBeCloseTo(
        tables.table_5.southern[month],
        12,
      );
    }
  });

  it("is zero from the equator to 30 degrees and again at the pole", () => {
    const [low, , high] = WINTER_ANOMALY_LATITUDES_DEG;
    for (let month = 0; month < 12; month += 1) {
      for (const latitude of [0, 5, 17.5, low, -low, high, -high]) {
        expect(winterAnomalyFactor(latitude, month)).toBe(0);
      }
    }
  });

  it("interpolates linearly on both sides of 60 degrees", () => {
    // January, northern: the 60-degree value is 0.30, so 45 degrees is half of
    // it on the way up and 75 degrees is half of it on the way down.
    expect(winterAnomalyFactor(45, 0)).toBeCloseTo(0.15, 12);
    expect(winterAnomalyFactor(75, 0)).toBeCloseTo(0.15, 12);
    expect(winterAnomalyFactor(40, 0)).toBeCloseTo(0.1, 12);
    expect(winterAnomalyFactor(80, 0)).toBeCloseTo(0.1, 12);
    // July, southern: the anomaly is the other hemisphere's winter.
    expect(winterAnomalyFactor(-45, 6)).toBeCloseTo(0.15, 12);
    expect(winterAnomalyFactor(45, 6)).toBe(0);
  });

  it("counts the equator as northern, which is the only rule two rows admit", () => {
    // At the equator the factor is zero in both rows, so the tie is only
    // visible one step away from it: a point just north of the equator can
    // never take a southern-row value.
    expect(winterAnomalyFactor(1e-9, 0)).toBe(0);
    expect(winterAnomalyFactor(-1e-9, 0)).toBe(0);
    expect(winterAnomalyFactor(59.999, 0)).toBeGreaterThan(0.29);
    expect(winterAnomalyFactor(-59.999, 0)).toBe(0);
  });
});

describe("equations (34) and (35), the solar zenith angle", () => {
  it("puts the sun on the prime meridian at 12 UTC", () => {
    expect(solarHourAngleRad(12, 0)).toBeCloseTo(0, 12);
    expect(solarZenithCosine(0, 0, 0, 12)).toBeCloseTo(1, 12);
  });

  it("puts it on the date line at 00 UTC", () => {
    expect(solarHourAngleRad(0, 180)).toBeCloseTo(0, 12);
    expect(solarZenithCosine(0, 180, 0, 0)).toBeCloseTo(1, 12);
  });

  it("moves the hour angle by 15 degrees per hour and per degree of longitude", () => {
    expect(solarHourAngleRad(13, 0) - solarHourAngleRad(12, 0)).toBeCloseTo(
      15 * DEG_TO_RAD,
      12,
    );
    expect(solarHourAngleRad(12, 15) - solarHourAngleRad(12, 0)).toBeCloseTo(
      15 * DEG_TO_RAD,
      12,
    );
  });

  it("matches the published expression written out again", () => {
    const latitude = 37.5;
    const longitude = -120;
    const declination = 18.8;
    const utc = 20;
    const eta = (utc / 12 - 1) * Math.PI + longitude * DEG_TO_RAD;
    const byHand =
      Math.sin(latitude * DEG_TO_RAD) * Math.sin(declination * DEG_TO_RAD) +
      Math.cos(latitude * DEG_TO_RAD) *
        Math.cos(declination * DEG_TO_RAD) *
        Math.cos(eta);
    expect(solarZenithCosine(latitude, longitude, declination, utc)).toBeCloseTo(
      byHand,
      12,
    );
  });

  it("is negative where the sun is below the horizon", () => {
    // Midnight on the prime meridian at the equinox: the antisolar point.
    expect(solarZenithCosine(0, 0, 0, 0)).toBeCloseTo(-1, 12);
    // And the polar night: 80 north in December, every hour of the day.
    for (let hour = 0; hour < 24; hour += 1) {
      expect(solarZenithCosine(80, 0, subsolarLatitudeDeg(11), hour)).toBeLessThan(
        0,
      );
    }
  });
});

describe("equation (36), the night LUF", () => {
  it("is one at the 3 000 km reference distance", () => {
    expect(nightLufMHz(NIGHT_LUF_DISTANCE_KM)).toBe(1);
  });

  it("is the square root of the distance in units of 3 000 km", () => {
    expect(nightLufMHz(12000)).toBeCloseTo(2, 12);
    expect(nightLufMHz(26400.16)).toBeCloseTo(2.9664883841561442, 12);
  });
});

describe("equation (33), the raw LUF before the night floor", () => {
  it("matches the published expression written out again", () => {
    const inputs = {
      zenithCosineRootSum: 3.4,
      r12: 120,
      incidenceAngle90Rad: 1.2,
      virtualSlantRangeKm: 8461.71,
      gyrofrequencyMHz: 1.15,
      winterAnomalyFactor: 0.12,
    };
    const byHand =
      (LUF_COEFFICIENT *
        Math.sqrt(
          ((1 + LUF_SUNSPOT_COEFFICIENT * inputs.r12) *
            inputs.zenithCosineRootSum) /
            (Math.cos(inputs.incidenceAngle90Rad) *
              Math.log(LUF_PATH_CONSTANT_KM / inputs.virtualSlantRangeKm)),
        ) -
        inputs.gyrofrequencyMHz) *
      (inputs.winterAnomalyFactor + 1);
    expect(rawLufMHz(inputs)).toBeCloseTo(byHand, 12);
  });

  it("is exactly -fH (Aw + 1) on a path with no sunlit penetration point", () => {
    // The whole sum is zero at night, the square root with it, and what is
    // left is the gyrofrequency subtraction. The text does not clamp this and
    // neither do we: equation (36)'s floor is what answers next.
    expect(
      rawLufMHz({
        zenithCosineRootSum: 0,
        r12: 100,
        incidenceAngle90Rad: 1.2,
        virtualSlantRangeKm: 8461.71,
        gyrofrequencyMHz: 1.2,
        winterAnomalyFactor: 0.3,
      }),
    ).toBeCloseTo(-1.2 * 1.3, 12);
  });

  it("rises with the sunspot number and with the sunlit sum", () => {
    const base = {
      zenithCosineRootSum: 3,
      r12: 50,
      incidenceAngle90Rad: 1.2,
      virtualSlantRangeKm: 8461.71,
      gyrofrequencyMHz: 1.2,
      winterAnomalyFactor: 0,
    };
    expect(rawLufMHz({ ...base, r12: 150 })).toBeGreaterThan(rawLufMHz(base));
    expect(rawLufMHz({ ...base, zenithCosineRootSum: 6 })).toBeGreaterThan(
      rawLufMHz(base),
    );
  });
});

describe("equations (37) and (38), the sunset decay", () => {
  it("evaluates e^-0.23 rather than rounding it to four places", () => {
    // The pinned reference substitutes the literal 0.7945. See deviation 3.
    expect(LUF_DECAY_PER_HOUR).toBe(Math.exp(LUF_DECAY_EXPONENT));
    expect(LUF_DECAY_PER_HOUR).toBeCloseTo(0.794533602503334, 15);
    expect(LUF_DECAY_PER_HOUR).not.toBe(0.7945);
  });

  it("finds no transition hour on a flat curve and changes nothing", () => {
    const flat = Array.from({ length: 24 }, () => 4);
    const decayed = applySunsetDecay(flat, 1);
    expect(decayed.transitionUtcHour).toBeNull();
    expect([...decayed.hours]).toEqual(flat);
  });

  it("finds no transition hour when both sides sit exactly on 2 fLN", () => {
    // The text's comparisons are strict, and that strictness is what keeps
    // equation (37)'s dt from dividing by zero. See deviation 4.
    const onThreshold = Array.from({ length: 24 }, () => 2);
    const decayed = applySunsetDecay(onThreshold, 1);
    expect(decayed.transitionUtcHour).toBeNull();
    for (const value of decayed.hours) {
      expect(Number.isFinite(value)).toBe(true);
    }
  });

  it("applies equation (37) at tr and equation (38) for three hours after", () => {
    const fLN = 1;
    const initial = Array.from({ length: 24 }, (_value, hour) =>
      hour < 12 ? 5 : 1,
    );
    const decayed = applySunsetDecay(initial, fLN);
    expect(decayed.transitionUtcHour).toBe(12);

    const e = Math.exp(-0.23);
    const dt = (2 * fLN - 1) / (5 - 1);
    const atTr = e * 5 * (dt * (1 - e) + e);
    expect(decayed.hours[12]).toBeCloseTo(atTr, 12);
    expect(decayed.hours[13]).toBeCloseTo(atTr * e, 12);
    expect(decayed.hours[14]).toBeCloseTo(atTr * e * e, 12);
    expect(decayed.hours[15]).toBeCloseTo(atTr * e * e * e, 12);
    // The fourth hour after tr is untouched: the text says three.
    expect(LUF_DECAY_HOURS).toBe(3);
    expect(decayed.hours[16]).toBe(1);
  });

  it("replaces a recalculated hour only when it is larger", () => {
    const fLN = 1;
    const initial = Array.from({ length: 24 }, (_value, hour) => {
      if (hour < 12) return 5;
      if (hour === 12) return 1.9;
      if (hour === 13) return 3.0;
      return 1;
    });
    const decayed = applySunsetDecay(initial, fLN);
    expect(decayed.transitionUtcHour).toBe(12);
    const e = Math.exp(-0.23);
    const dt = (2 * fLN - 1.9) / (5 - 1.9);
    const atTr = e * 5 * (dt * (1 - e) + e);
    // tr itself is raised, because the decayed value is above the initial one.
    expect(atTr).toBeGreaterThan(1.9);
    expect(decayed.hours[12]).toBeCloseTo(atTr, 12);
    // tr + 1 keeps its own larger initial value. The text's "only if they are
    // larger" covers both equations. See deviation 5.
    expect(atTr * e).toBeLessThan(3.0);
    expect(decayed.hours[13]).toBe(3.0);
  });

  it("does not mutate the array it was given", () => {
    const initial = Array.from({ length: 24 }, (_value, hour) =>
      hour < 12 ? 5 : 1,
    );
    const copy = [...initial];
    applySunsetDecay(initial, 1);
    expect(initial).toEqual(copy);
  });

  it("rolls the transition search and the decay across midnight", () => {
    // Sunset at 23 UTC: the decay must continue into 00, 01 and 02 of the same
    // 24-hour curve, which is what the recommendation's single-day table means.
    const initial = Array.from({ length: 24 }, (_value, hour) =>
      hour === 23 || hour <= 2 ? 1 : 5,
    );
    const decayed = applySunsetDecay(initial, 1);
    expect(decayed.transitionUtcHour).toBe(23);
    const e = Math.exp(-0.23);
    const dt = (2 - 1) / (5 - 1);
    const atTr = e * 5 * (dt * (1 - e) + e);
    expect(decayed.hours[23]).toBeCloseTo(atTr, 12);
    expect(decayed.hours[0]).toBeCloseTo(atTr * e, 12);
    expect(decayed.hours[1]).toBeCloseTo(atTr * e * e, 12);
    expect(decayed.hours[2]).toBeCloseTo(atTr * e * e * e, 12);
  });
});

describe("the fL hop division and its penetration points", () => {
  it("takes the fewest equal hops no longer than 3 000 km", () => {
    const result = resolved();
    expect(result.hopCount).toBe(3);
    expect(result.hopGroundDistanceKm).toBeCloseTo(8095.11 / 3, 9);
    expect(result.hopGroundDistanceKm).toBeLessThanOrEqual(LUF_MAX_HOP_KM);
  });

  it("places two penetration points per hop, transmitter end first", () => {
    const result = resolved();
    expect(result.penetrationPoints).toHaveLength(2 * result.hopCount);
    const geometry = hopGeometry({
      groundDistanceKm: 8095.11,
      hopCount: 3,
      mirrorHeightKm: LUF_REFLECTION_HEIGHT_KM,
    });
    if (geometry.kind !== "supported") throw new Error("hop geometry missing");
    result.penetrationPoints.forEach((point, index) => {
      expect(point.index).toBe(index);
      expect(point.hopIndex).toBe(Math.floor(index / 2));
      expect(point.end).toBe(index % 2 === 0 ? "transmitter" : "receiver");
      expect(point.offsetKm).toBeCloseTo(
        geometry.penetrationFractions[index] * 8095.11,
        9,
      );
    });
    expect(result.incidenceAngle90Rad).toBeCloseTo(
      geometry.incidenceAngle90Rad,
      12,
    );
    expect(result.elevationRad).toBeCloseTo(geometry.elevationAngleRad, 12);
  });

  it("uses the 300 km reflection height and the 90 km penetration height", () => {
    expect(LUF_REFLECTION_HEIGHT_KM).toBe(300);
    expect(LUF_PENETRATION_HEIGHT_KM).toBe(90);
    // The incidence angle is the 90 km one, not the 110 km one absorption
    // uses: sin(i90) = R0 cos(delta) / (R0 + 90).
    const result = resolved();
    expect(Math.sin(result.incidenceAngle90Rad)).toBeCloseTo(
      (EARTH_RADIUS_KM * Math.cos(result.elevationRad)) /
        (EARTH_RADIUS_KM + LUF_PENETRATION_HEIGHT_KM),
      12,
    );
  });

  it("sits the penetration points inside their own hop", () => {
    const result = resolved();
    for (const point of result.penetrationPoints) {
      const hopStart = point.hopIndex * result.hopGroundDistanceKm;
      const hopEnd = hopStart + result.hopGroundDistanceKm;
      expect(point.offsetKm).toBeGreaterThan(hopStart);
      expect(point.offsetKm).toBeLessThan(hopEnd);
    }
  });
});

describe("the 24-hour curve", () => {
  it("counts only the sunlit penetration points in the sum", () => {
    // "When chi > 90 degrees, cos^0.5 chi is set to zero", which is every
    // point whose cos(chi) is not positive.
    const result = resolved({ monthIndex: 2, utcHour: 12 });
    for (const hour of result.hours) {
      let sunlit = 0;
      let sum = 0;
      for (const point of result.penetrationPoints) {
        const cosChi = solarZenithCosine(
          point.point.latitudeDeg,
          point.point.longitudeDeg,
          result.declinationDeg,
          hour.utcHour,
        );
        if (cosChi > 0) {
          sunlit += 1;
          sum += Math.sqrt(cosChi);
        }
      }
      expect(hour.sunlitPointCount).toBe(sunlit);
      expect(hour.zenithCosineRootSum).toBeCloseTo(sum, 12);
      expect(hour.sunlitPointCount).toBeLessThanOrEqual(
        result.penetrationPoints.length,
      );
    }
  });

  it("has a fully lit hour and a fully dark hour on an 8 000 km equatorial path", () => {
    const result = resolved({ monthIndex: 2 });
    const lit = result.hours.map((hour) => hour.sunlitPointCount);
    expect(Math.max(...lit)).toBe(result.penetrationPoints.length);
    expect(Math.min(...lit)).toBe(0);
  });

  it("floors every hour at the night LUF of equation (36)", () => {
    const result = resolved();
    expect(result.nightLufMHz).toBeCloseTo(Math.sqrt(8095.11 / 3000), 12);
    for (const hour of result.hours) {
      expect(hour.initialLufMHz).toBeGreaterThanOrEqual(result.nightLufMHz);
      expect(hour.initialLufMHz).toBeCloseTo(
        Math.max(hour.rawLufMHz, result.nightLufMHz),
        12,
      );
      expect(hour.lufMHz).toBeGreaterThanOrEqual(result.nightLufMHz);
    }
  });

  it("collapses to the night LUF at every hour when the gyrofrequency swamps it", () => {
    // Equation (33)'s bracket peaks near 14.3 MHz on this circuit, so an fH of
    // 20 MHz makes the raw LUF negative at every hour, the whole curve is fLN
    // and there is no 2 fLN crossing to find.
    const result = resolved({ gyrofrequencyMHz: 20 });
    for (const hour of result.hours) {
      expect(hour.rawLufMHz).toBeLessThan(0);
      expect(hour.lufMHz).toBeCloseTo(result.nightLufMHz, 12);
    }
    expect(result.transitionUtcHour).toBeNull();
    expect(result.fLMHz).toBeCloseTo(result.nightLufMHz, 12);
  });

  it("selects the prediction's own hour, not the hour after it", () => {
    // The text says "the current hour fL value is selected". The pinned
    // reference reads fL[hour + 1]. See deviation 2.
    for (const utcHour of [0, 5, 12, 23]) {
      const result = resolved({ utcHour });
      expect(result.fLMHz).toBe(result.hours[utcHour].lufMHz);
    }
  });

  it("reports the same 24 hours whatever hour is asked for", () => {
    const noon = resolved({ utcHour: 12 });
    const midnight = resolved({ utcHour: 0 });
    expect(noon.hours.map((h) => h.lufMHz)).toEqual(
      midnight.hours.map((h) => h.lufMHz),
    );
    expect(noon.transitionUtcHour).toBe(midnight.transitionUtcHour);
  });

  it("applies the winter anomaly from the path midpoint", () => {
    const januaryNorth = resolved({
      route: stretched(MERIDIONAL, 7783.1),
      monthIndex: 0,
    });
    // The midpoint of a 10 to 80 degree meridian path is near 45 north, where
    // January's Table 5 value of 0.30 has interpolated down to about 0.15.
    expect(januaryNorth.winterAnomalyFactor).toBeGreaterThan(0.1);
    expect(januaryNorth.winterAnomalyFactor).toBeLessThan(0.2);
    const july = resolved({
      route: stretched(MERIDIONAL, 7783.1),
      monthIndex: 6,
    });
    expect(july.winterAnomalyFactor).toBe(0);
  });

  it("carries the Table 4 declination it used", () => {
    for (let month = 0; month < 12; month += 1) {
      expect(resolved({ monthIndex: month }).declinationDeg).toBe(
        subsolarLatitudeDeg(month),
      );
    }
  });
});

describe("what section 5.3.2 refuses rather than guesses", () => {
  it("declines a route with no usable ground distance", () => {
    const result = call({ route: stretched(EQUATORIAL, Number.NaN) });
    expect(result.kind).toBe("unsupported");
    if (result.kind !== "unsupported") return;
    expect(result.reason).toBe("out_of_domain");
  });

  it("declines a route longer than the sphere it was resolved on", () => {
    const result = call({
      route: stretched(EQUATORIAL, MAX_ROUTE_DISTANCE_KM + 1),
    });
    expect(result.kind).toBe("unsupported");
    if (result.kind !== "unsupported") return;
    expect(result.detail).toContain("circumference");
  });

  it("declines a month or an hour the tables have no column for", () => {
    for (const monthIndex of [-1, 12, 3.5]) {
      expect(call({ monthIndex }).kind).toBe("unsupported");
    }
    for (const utcHour of [-1, 24, 12.5]) {
      expect(call({ utcHour }).kind).toBe("unsupported");
    }
  });

  it("declines a negative sunspot number but allows one above 160", () => {
    expect(call({ r12: -1 }).kind).toBe("unsupported");
    // Equation (33) states its own rule: R12 "does not saturate for high
    // values and can exceed 160".
    expect(call({ r12: 311 }).kind).toBe("resolved");
  });

  it("declines a slant path that makes the logarithm zero or negative", () => {
    for (const virtualSlantRangeKm of [0, -1, LUF_PATH_CONSTANT_KM, 1e7]) {
      const result = call({ virtualSlantRangeKm });
      expect(result.kind).toBe("unsupported");
      if (result.kind !== "unsupported") continue;
      expect(result.detail).toContain("9500000");
    }
  });

  it("never returns a NaN on any field of a resolved record", () => {
    const result = resolved({
      route: stretched(MERIDIONAL, 12345.6),
      monthIndex: 0,
      utcHour: 17,
      r12: 200,
    });
    const numbers: number[] = [
      result.groundDistanceKm,
      result.hopCount,
      result.hopGroundDistanceKm,
      result.elevationRad,
      result.incidenceAngle90Rad,
      result.winterAnomalyFactor,
      result.declinationDeg,
      result.nightLufMHz,
      result.fLMHz,
    ];
    for (const point of result.penetrationPoints) {
      numbers.push(
        point.index,
        point.hopIndex,
        point.offsetKm,
        point.point.latitudeDeg,
        point.point.longitudeDeg,
      );
    }
    for (const hour of result.hours) {
      numbers.push(
        hour.utcHour,
        hour.zenithCosineRootSum,
        hour.sunlitPointCount,
        hour.rawLufMHz,
        hour.initialLufMHz,
        hour.lufMHz,
      );
    }
    for (const value of numbers) {
      expect(Number.isFinite(value)).toBe(true);
    }
  });
});
