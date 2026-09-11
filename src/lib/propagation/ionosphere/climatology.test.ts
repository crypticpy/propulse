import { describe, expect, it } from "vitest";

import fixtures from "./fixtures/reference-parity.json";
import { foE, phi12FromR12 } from "./foE";
import { D2R, magneticField, modifiedDipLatitudeRad, R2D } from "./modip";
import { MONTH_ANCHOR_DAY_OF_YEAR, solarParameters } from "./solar";

/**
 * Control-point dumps from the ITU reference executable, produced by running
 * `ITURHFProp -s` with `RptFileFormat "RPT_DUMPPATH"` against the pinned build
 * at commit cd172be56dc04b154e5d2fa91cbaa6ecf5284305. They are independent of
 * this TypeScript: no code in this repository took part in producing them.
 * Regeneration is `ml/propagation_validation/ionosphere_coefficients.py
 * --fixtures`.
 *
 * The reference prints to three decimals, so a value is only known to +-5e-4,
 * and its coordinates are printed as arc seconds, so the evaluation point is
 * only known to +-0.5 arcsec. The tolerances below are those two facts, not
 * slack: foE varies by roughly 1e-3 MHz over half an arc second near the
 * terminator.
 */
type DumpRow = (typeof fixtures.rows)[number];

const DUMP_ROWS = fixtures.rows.filter(
  (row): row is DumpRow & { solar_zenith_angle_deg: number; foE_mhz: number } =>
    row.source === "iturhfprop-dumppath" &&
    typeof row.solar_zenith_angle_deg === "number" &&
    typeof row.foE_mhz === "number",
);

const rowSolar = (row: (typeof DUMP_ROWS)[number]) =>
  solarParameters(
    row.latitude_deg * D2R,
    row.longitude_deg * D2R,
    row.month - 1,
    row.hour_utc,
  );

describe("solar geometry against the ITU reference dumps", () => {
  it("covers both hemispheres, all seasons and the full day", () => {
    expect(DUMP_ROWS.length).toBeGreaterThanOrEqual(24);
    expect(
      new Set(DUMP_ROWS.map((row) => row.month)).size,
    ).toBeGreaterThanOrEqual(6);
    expect(DUMP_ROWS.some((row) => row.latitude_deg < -30)).toBe(true);
    expect(DUMP_ROWS.some((row) => row.latitude_deg > 60)).toBe(true);
    expect(DUMP_ROWS.some((row) => row.solar_zenith_angle_deg < 73)).toBe(true);
    expect(DUMP_ROWS.some((row) => row.solar_zenith_angle_deg > 90)).toBe(true);
  });

  it.each(DUMP_ROWS.map((row) => [row.case_id, row] as const))(
    "reproduces the solar declination and zenith angle at %s",
    (_id, row) => {
      const solar = rowSolar(row);
      expect(solar.declinationRad * R2D).toBeCloseTo(
        row.solar_declination_deg as number,
        3,
      );
      expect(
        Math.abs(solar.zenithAngleRad * R2D - row.solar_zenith_angle_deg),
      ).toBeLessThan(1e-3);
    },
  );
});

describe("magnetic field against the ITU reference dumps", () => {
  it.each(DUMP_ROWS.map((row) => [row.case_id, row] as const))(
    "reproduces dip and gyrofrequency at 300 km at %s",
    (_id, row) => {
      const field = magneticField(
        row.latitude_deg * D2R,
        row.longitude_deg * D2R,
        300,
      );
      expect(
        Math.abs(field.dipRad * R2D - (row.magnetic_dip_300km_deg as number)),
      ).toBeLessThan(1e-3);
      expect(
        Math.abs(
          field.gyrofrequencyMHz - (row.gyrofrequency_300km_mhz as number),
        ),
      ).toBeLessThan(1e-3);
    },
  );

  it("gives a modified dip latitude that tracks the dip and vanishes at the equator", () => {
    // modip = atan(I / sqrt(cos phi)), so it shares the sign of the dip and is
    // zero exactly where the dip is zero.
    for (const latitude of [-70, -35, -5, 5, 35, 70]) {
      const lonRad = 20 * D2R;
      const latRad = latitude * D2R;
      const modip = modifiedDipLatitudeRad(latRad, lonRad);
      const { dipRad } = magneticField(latRad, lonRad, 300);
      expect(Math.sign(modip)).toBe(Math.sign(dipRad));
      expect(Math.abs(modip)).toBeLessThanOrEqual(Math.abs(dipRad) + 1e-12);
    }
  });

  it("stays finite at both poles, where cos(latitude) divides", () => {
    for (const latitude of [90, -90]) {
      const field = magneticField(latitude * D2R, 0, 300);
      expect(Number.isFinite(field.dipRad)).toBe(true);
      expect(Number.isFinite(field.gyrofrequencyMHz)).toBe(true);
      expect(Number.isFinite(modifiedDipLatitudeRad(latitude * D2R, 0))).toBe(
        true,
      );
    }
  });
});

describe("foE against the ITU reference dumps", () => {
  it.each(DUMP_ROWS.map((row) => [row.case_id, row] as const))(
    "reproduces foE at %s",
    (_id, row) => {
      const result = foE({
        latitudeRad: row.latitude_deg * D2R,
        monthIndex: row.month - 1,
        utcHours: row.hour_utc,
        r12: row.ssn,
        solar: rowSolar(row),
        clock: "reference",
      });
      expect(Math.abs(result.foEMHz - row.foE_mhz)).toBeLessThan(1e-3);
    },
  );
});

describe("foE branches and seams", () => {
  const at = (
    latitude: number,
    longitude: number,
    month: number,
    hour: number,
  ) => {
    const solar = solarParameters(latitude * D2R, longitude * D2R, month, hour);
    return {
      solar,
      result: foE({
        latitudeRad: latitude * D2R,
        monthIndex: month,
        utcHours: hour,
        r12: 80,
        solar,
        clock: "reference",
      }),
    };
  };

  it("derives phi12 from R12 rather than accepting an observed flux", () => {
    // ITU-R P.1239-2 equation (2) at R12 = 0 and R12 = 100.
    expect(phi12FromR12(0)).toBeCloseTo(63.7, 9);
    expect(phi12FromR12(100)).toBeCloseTo(63.7 + 72.8 + 8.9, 9);
    // And it clips with the map, so foE cannot run away above R12 160 either.
    expect(phi12FromR12(300)).toBe(phi12FromR12(160));
  });

  /**
   * The two UTC hours that bracket a zenith-angle threshold, to the last bit.
   * Scanned coarsely first because the crossing is not bracketed by any fixed
   * pair of hours: it moves with latitude and season.
   *
   * The comparison is in radians, against the same expression `foE` branches
   * on. Comparing converted degrees would land on the wrong side of the seam:
   * the reference's `R2D` is the truncated 57.2957795, so a zenith angle whose
   * converted value reads 89.9999 degrees can already exceed PI/2 radians.
   */
  const zenithCrossingHour = (
    latitude: number,
    month: number,
    targetRad: number,
  ): [number, number] => {
    const szaAt = (hour: number) =>
      solarParameters(latitude * D2R, 0, month, hour).zenithAngleRad;
    let low = Number.NaN;
    let high = Number.NaN;
    for (let hour = 0; hour < 24; hour += 0.01) {
      if (szaAt(hour) < targetRad && szaAt(hour + 0.01) >= targetRad) {
        low = hour;
        high = hour + 0.01;
        break;
      }
    }
    expect(Number.isNaN(low)).toBe(false);
    for (let i = 0; i < 60; i += 1) {
      const mid = (low + high) / 2;
      if (szaAt(mid) < targetRad) low = mid;
      else high = mid;
    }
    return [low, high];
  };

  const foEAt = (latitude: number, month: number, hour: number) =>
    foE({
      latitudeRad: latitude * D2R,
      monthIndex: month,
      utcHours: hour,
      r12: 80,
      solar: solarParameters(latitude * D2R, 0, month, hour),
      clock: "reference",
    });

  it("keeps the reference's small twilight kink at a zenith angle of 73 degrees", () => {
    // `dsza = 6.27e-13 * (sza_deg - 50)^8` is 0.049 degrees at 73 degrees, not
    // zero, so the day and twilight branches do not meet. The seam is the
    // reference's; this pins its size so a refactor cannot quietly change it,
    // and so nobody "fixes" foE into continuity and loses P.533 parity.
    const latitude = 45;
    const month = 3;
    const [low, high] = zenithCrossingHour(latitude, month, 73 * D2R);
    const before = foEAt(latitude, month, low);
    const after = foEAt(latitude, month, high);
    expect(before.branch).toBe("day");
    expect(after.branch).toBe("twilight");
    const jump = Math.abs(after.foEMHz - before.foEMHz);
    expect(jump).toBeGreaterThan(1e-6);
    expect(jump).toBeLessThan(5e-3);
  });

  it("switches to the night branch at a zenith angle of 90 degrees", () => {
    const latitude = 45;
    const month = 3;
    const [low, high] = zenithCrossingHour(latitude, month, Math.PI / 2);
    const day = foEAt(latitude, month, low);
    const night = foEAt(latitude, month, high);
    expect(day.branch).toBe("twilight");
    expect(night.branch).toBe("night");
    // The seam is small but it steps *up*, not down. At 90 degrees the
    // twilight branch evaluates cos(90 - 4.109)^p = 0.0456 while the night
    // branch's exp(25.2 - 0.28*90) is exactly 0.072^p = 0.0459, and the night
    // branch takes the larger of its two decays. Pinning the sign as well as
    // the size stops a "continuity fix" that would break P.533 parity.
    expect(night.foEMHz).toBeGreaterThan(day.foEMHz);
    expect(night.foEMHz - day.foEMHz).toBeLessThan(5e-3);
    // Two hours further into the night it has decayed well below the seam.
    expect(foEAt(latitude, month, high + 2).foEMHz).toBeLessThan(
      night.foEMHz * 0.75,
    );
  });

  it("never falls below the P.1239-2 night floor", () => {
    const floor = (0.004 * (1 + 0.021 * phi12FromR12(80)) ** 2) ** 0.25;
    for (const hour of [0, 3, 6, 9, 12, 15, 18, 21]) {
      for (const latitude of [-80, -45, 0, 45, 80]) {
        const { result } = at(latitude, 0, 0, hour);
        expect(result.foEMHz).toBeGreaterThanOrEqual(floor - 1e-12);
      }
    }
  });

  it("takes the northern polar-winter branch above 72.5622 N in November to January", () => {
    for (const month of [10, 11, 0]) {
      const { result } = at(80, 0, month, 0);
      expect(result.branch).toBe("polar-winter");
    }
    // Same place in April is an ordinary night, not polar winter.
    expect(at(80, 0, 3, 0).result.branch).not.toBe("polar-winter");
  });

  it("reproduces the reference's unsigned southern polar-winter test", () => {
    // `CalculateCPParameters.c` writes `here->L.lat < 72.5622*D2R` where the
    // northern test is `> 72.5622*D2R`, so in May, June and July every
    // night-side latitude below +72.5622 takes the polar-winter formula. This
    // is almost certainly a missing minus sign in the reference. It is
    // reproduced for parity and pinned here so the deviation is visible in the
    // test suite rather than buried in a comment.
    const southern = at(-40, 0, 5, 0);
    expect(southern.solar.zenithAngleRad * R2D).toBeGreaterThan(90);
    expect(southern.result.branch).toBe("polar-winter");
    // The same latitude in August, where the test does not fire.
    expect(at(-40, 0, 7, 0).result.branch).toBe("night");
  });

  it("survives polar day and polar night, where the sunrise hour angle has no solution", () => {
    const polarNight = at(85, 0, 11, 12);
    expect(Number.isNaN(polarNight.solar.sunriseUtcHours)).toBe(true);
    expect(Number.isFinite(polarNight.result.foEMHz)).toBe(true);
    const polarDay = at(85, 0, 5, 12);
    expect(Number.isFinite(polarDay.result.foEMHz)).toBe(true);
  });
});

describe("solar parameter conventions", () => {
  it("anchors every month on its 15th, as P.533's monthly medians require", () => {
    expect(MONTH_ANCHOR_DAY_OF_YEAR).toHaveLength(12);
    expect(MONTH_ANCHOR_DAY_OF_YEAR[0]).toBe(15);
    expect(MONTH_ANCHOR_DAY_OF_YEAR[11]).toBe(349);
    for (let i = 1; i < 12; i += 1) {
      expect(MONTH_ANCHOR_DAY_OF_YEAR[i]).toBeGreaterThan(
        MONTH_ANCHOR_DAY_OF_YEAR[i - 1],
      );
    }
  });

  it("puts the solstices and equinoxes where they belong", () => {
    const decl = (month: number) =>
      solarParameters(0, 0, month, 12).declinationRad * R2D;
    expect(decl(5)).toBeGreaterThan(21);
    expect(decl(11)).toBeLessThan(-21);
    expect(Math.abs(decl(2))).toBeLessThan(3);
    expect(Math.abs(decl(8))).toBeLessThan(3);
  });

  it("is continuous in UTC across midnight", () => {
    const before = solarParameters(45 * D2R, 30 * D2R, 6, 24 - 1 / 3600, 196);
    const after = solarParameters(45 * D2R, 30 * D2R, 6, 24, 196);
    expect(
      Math.abs(after.zenithAngleRad - before.zenithAngleRad) * R2D,
    ).toBeLessThan(1e-2);
  });
});
