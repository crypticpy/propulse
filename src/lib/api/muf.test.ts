/**
 * `calculateLUF` context wiring (#1108 PR A).
 *
 * Before this change the LUF binary search called `calculateDLayerAbsorption`
 * with only a frequency, a zenith angle and an SFI, so equation (21) fell back
 * to the declared 45 N / March / dip 60 stand-in in `D_REGION_STANDIN`. Every
 * caller therefore got mid-latitude equinox absorption no matter where or when
 * it asked. The fixtures below hold the zenith angle fixed and vary only the
 * things the stand-in used to erase: latitude, magnetic dip and month.
 *
 * Per decision O9 these assert differences rather than invented golden values.
 * There is no ITU golden for this composite LUF, so a target number would be a
 * calibration claim the function cannot support.
 */
import { describe, it, expect } from "vitest";
import { calculateLUF } from "./muf";
import { calculateZenithAngle } from "@/lib/utils/ionosphere";

const SFI = 140;

/**
 * Two places, one instant, the same solar zenith angle to within 1e-3 degrees.
 * Longitudes solved by sweeping `calculateZenithAngle` at 0.001 degree steps,
 * so the only inputs that differ are latitude, modified dip and the local-noon
 * zenith angle the diurnal term is referenced to.
 */
const JUNE = new Date(Date.UTC(2026, 5, 21, 12, 0, 0));
const HIGH_LATITUDE = { lat: 60, lon: 38.13 };
const LOW_LATITUDE = { lat: 20, lon: -48.16 };

/** Same latitude, same zenith angle, six months apart. */
const MONTH_LAT = 35;
const JUNE_LON = 75.364;
const DECEMBER = new Date(Date.UTC(2026, 11, 21, 12, 0, 0));
const DECEMBER_LON = 29.535;

describe("calculateLUF absorption context (#1108)", () => {
  it("uses the caller's own latitude and month, not the 45 N March stand-in", () => {
    const high = calculateZenithAngle(
      HIGH_LATITUDE.lat,
      HIGH_LATITUDE.lon,
      JUNE,
    );
    const low = calculateZenithAngle(LOW_LATITUDE.lat, LOW_LATITUDE.lon, JUNE);
    // The fixture only means anything if the zenith angles really do match:
    // that is what removes the one input the old call already carried.
    expect(Math.abs(high - low)).toBeLessThan(1e-3);

    const lufHigh = calculateLUF(
      HIGH_LATITUDE.lat,
      HIGH_LATITUDE.lon,
      SFI,
      JUNE,
    );
    const lufLow = calculateLUF(LOW_LATITUDE.lat, LOW_LATITUDE.lon, SFI, JUNE);
    // Before the wiring both read 5.4 MHz, because both got 45 N in March.
    expect(lufHigh).not.toBe(lufLow);
  });

  it("at 45 N in March stays inside half a megahertz of the stand-in it replaces", () => {
    // The one case the stand-in was right about: 45 N, March. The pre-change
    // value here was 5.4 MHz. The wiring still supplies a real modified dip
    // (72.8 rather than the declared 60) and a real noon zenith angle, so this
    // is a bounded regression pin, not an identity.
    const luf = calculateLUF(45, -93, SFI, new Date(Date.UTC(2026, 2, 20, 18)));
    expect(Math.abs(luf - 5.4)).toBeLessThanOrEqual(0.5);
  });

  it("passes the caller's date so a June and a December call differ at the same place", () => {
    const june = calculateZenithAngle(MONTH_LAT, JUNE_LON, JUNE);
    const december = calculateZenithAngle(MONTH_LAT, DECEMBER_LON, DECEMBER);
    expect(Math.abs(june - december)).toBeLessThan(1e-3);

    const lufJune = calculateLUF(MONTH_LAT, JUNE_LON, SFI, JUNE);
    const lufDecember = calculateLUF(MONTH_LAT, DECEMBER_LON, SFI, DECEMBER);
    // Before the wiring both read 4.4 MHz: month index 2 for every call.
    expect(lufJune).not.toBe(lufDecember);
  });
});
