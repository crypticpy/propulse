import { describe, expect, it } from "vitest";
import {
  MOON_APOGEE_KM,
  MOON_PERIGEE_KM,
  declinationWord,
  degradationDb,
  dopplerShiftHz,
  getMutualMoonWindow,
  isNearGalacticPlane,
  pathLossDb,
  skyNoiseTempK,
  skyNoiseWord,
} from "./eme";

describe("pathLossDb", () => {
  it("is greater at apogee than at perigee, for every band", () => {
    for (const band of ["2m", "70cm", "23cm"] as const) {
      expect(pathLossDb(MOON_APOGEE_KM, band)).toBeGreaterThan(
        pathLossDb(MOON_PERIGEE_KM, band),
      );
    }
  });

  it("is greater at a higher frequency band for the same range", () => {
    // Free-space loss rises with frequency, so 23 cm always costs more than
    // 2 m at the same distance.
    expect(pathLossDb(MOON_PERIGEE_KM, "23cm")).toBeGreaterThan(
      pathLossDb(MOON_PERIGEE_KM, "70cm"),
    );
    expect(pathLossDb(MOON_PERIGEE_KM, "70cm")).toBeGreaterThan(
      pathLossDb(MOON_PERIGEE_KM, "2m"),
    );
  });

  it("matches the bistatic radar equation's reference value at 144 MHz, average Earth-Moon range", () => {
    // 10*log10((4*pi)^3 * R^4 / (lambda^2 * sigma)) at R = 384 400 km: the
    // commonly cited ~252 dB two-way EME path loss at 2 m, not the ~204 dB a
    // simple free-space-over-2R calculation would give.
    expect(pathLossDb(384_400, "2m")).toBeCloseTo(252.1, 0);
  });

  it("matches the bistatic radar equation's reference value at 1296 MHz, average Earth-Moon range", () => {
    expect(pathLossDb(384_400, "23cm")).toBeCloseTo(271.2, 0);
  });
});

describe("degradationDb", () => {
  it("is zero at perigee", () => {
    expect(degradationDb(MOON_PERIGEE_KM, "2m")).toBeCloseTo(0, 6);
  });

  it("is negative at apogee", () => {
    expect(degradationDb(MOON_APOGEE_KM, "2m")).toBeLessThan(0);
  });

  it("is about -2.29 dB at apogee (40*log10(perigee/apogee), the fourth-power range term)", () => {
    expect(degradationDb(MOON_APOGEE_KM, "2m")).toBeCloseTo(-2.29, 1);
  });

  it("is the same size at apogee regardless of band (frequency cancels out of the difference)", () => {
    const twoMeter = degradationDb(MOON_APOGEE_KM, "2m");
    const seventyCm = degradationDb(MOON_APOGEE_KM, "70cm");
    const twentyThreeCm = degradationDb(MOON_APOGEE_KM, "23cm");
    expect(twoMeter).toBeCloseTo(seventyCm, 6);
    expect(seventyCm).toBeCloseTo(twentyThreeCm, 6);
  });
});

describe("declinationWord", () => {
  it("reads HIGH at a large declination magnitude, either sign", () => {
    expect(declinationWord(24)).toBe("HIGH");
    expect(declinationWord(-24)).toBe("HIGH");
  });

  it("reads LOW near the celestial equator", () => {
    expect(declinationWord(3)).toBe("LOW");
    expect(declinationWord(-3)).toBe("LOW");
  });
});

describe("sky noise", () => {
  it("is hotter near the galactic plane than on a cold-sky night, for every band", () => {
    // Galactic latitude, not declination: near-plane is a small |b|.
    for (const band of ["2m", "70cm", "23cm"] as const) {
      expect(skyNoiseTempK(3, band)).toBeGreaterThan(skyNoiseTempK(25, band));
    }
  });

  it("names the two states", () => {
    expect(skyNoiseWord(3)).toBe("GALACTIC PLANE");
    expect(skyNoiseWord(25)).toBe("COLD SKY");
    expect(isNearGalacticPlane(3)).toBe(true);
    expect(isNearGalacticPlane(25)).toBe(false);
  });

  it("is far louder at 2 m than at 23 cm on the same night (galactic synchrotron noise falls with frequency)", () => {
    expect(skyNoiseTempK(3, "2m")).toBeGreaterThan(skyNoiseTempK(3, "23cm"));
  });
});

describe("dopplerShiftHz", () => {
  it("is positive while the Moon is approaching (negative range rate)", () => {
    // -0.055 km/s is a representative EME closing rate (moonrise, where
    // getMoonRangeRateKmS's dominant observer-rotation term is largest).
    expect(dopplerShiftHz(-0.055, "2m")).toBeGreaterThan(0);
  });

  it("is negative while the Moon is receding (positive range rate)", () => {
    // +0.055 km/s is a representative EME opening rate (moonset).
    expect(dopplerShiftHz(0.055, "2m")).toBeLessThan(0);
  });

  it("is zero at zero range rate", () => {
    expect(dopplerShiftHz(0, "2m")).toBeCloseTo(0, 9);
  });

  it("scales up with frequency for the same range rate", () => {
    const twoMeter = Math.abs(dopplerShiftHz(-0.055, "2m"));
    const seventyCm = Math.abs(dopplerShiftHz(-0.055, "70cm"));
    const twentyThreeCm = Math.abs(dopplerShiftHz(-0.055, "23cm"));
    expect(seventyCm).toBeGreaterThan(twoMeter);
    expect(twentyThreeCm).toBeGreaterThan(seventyCm);
  });
});

describe("getMutualMoonWindow", () => {
  it("finds the overlap between two ordinary mid-latitude stations", () => {
    const window = getMutualMoonWindow(
      30.27,
      -97.74,
      35.68,
      139.69,
      new Date("2026-09-05T13:14:00Z"),
    );
    expect(window).not.toBeNull();
    expect(window!.end.getTime()).toBeGreaterThan(window!.start.getTime());
  });

  it("is correctly empty when the two stations never see the Moon together", () => {
    // At 2026-09-05T13:14Z the Moon's declination is ~+27.8 deg: a station
    // pinned near the north pole sees it continuously above the horizon
    // (altitude ~= declination - colatitude), while a station near the
    // south pole sees it continuously below (altitude ~= -declination -
    // colatitude) -- the two moon-up windows cannot overlap in the next
    // 24 h.
    const window = getMutualMoonWindow(
      89,
      0,
      -89,
      0,
      new Date("2026-09-05T13:14:00Z"),
    );
    expect(window).toBeNull();
  });
});
