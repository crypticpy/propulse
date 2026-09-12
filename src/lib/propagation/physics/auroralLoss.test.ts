// @vitest-environment node
//
// Node, because the sha256 pin reads the transcribed asset off disk. The
// module itself imports the JSON and runs anywhere.

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

import table from "./assets/p533-table2-lh.json";
import {
  auroralLoss,
  auroralLossAtPoint,
  geomagneticLatitudeDeg,
  lhDistanceRegime,
  lhLatitudeBandIndex,
  lhSeason,
  lhTimeBandIndex,
  midPathLocalTimeHours,
  AURORAL_MIN_GEOMAGNETIC_LATITUDE_DEG,
  AURORAL_RANGE_BOUNDARY_KM,
  GEOMAGNETIC_POLE_LATITUDE_DEG,
  GEOMAGNETIC_POLE_LONGITUDE_DEG,
  TABLE_2_SHA256,
} from "./auroralLoss";

const ASSET_PATH = path.join(
  process.cwd(),
  "src/lib/propagation/physics/assets/p533-table2-lh.json",
);

describe("the transcribed Table 2 asset", () => {
  it("hashes to the sha256 recorded in the module", async () => {
    const bytes = await readFile(ASSET_PATH);
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(
      TABLE_2_SHA256,
    );
  });

  it("carries 384 values in six eight by eight blocks", () => {
    const blocks = [
      table.lh.le_2500_km.winter,
      table.lh.le_2500_km.equinox,
      table.lh.le_2500_km.summer,
      table.lh.gt_2500_km.winter,
      table.lh.gt_2500_km.equinox,
      table.lh.gt_2500_km.summer,
    ];
    expect(blocks).toHaveLength(6);
    let count = 0;
    for (const block of blocks) {
      expect(block).toHaveLength(8);
      for (const row of block) {
        expect(row).toHaveLength(8);
        for (const value of row) {
          expect(Number.isFinite(value)).toBe(true);
          // Lh is a loss. A negative cell would be a transcription slip that
          // the hash cannot catch on its own, because the hash only proves
          // the file has not changed since it was checked.
          expect(value).toBeGreaterThanOrEqual(0);
          count += 1;
        }
      }
    }
    expect(count).toBe(384);
  });

  it("records where it came from", () => {
    expect(table.provenance.recommendation).toContain("P.533-14");
    expect(table.provenance.table).toContain("Table 2");
    expect(table.provenance.transcribed_on).toBe("2026-09-12");
  });

  it("declares the published band edges the module indexes on", () => {
    expect(table.local_time_bands.map((band) => band.from_hours)).toEqual([
      1, 4, 7, 10, 13, 16, 19, 22,
    ]);
    expect(
      table.geomagnetic_latitude_bands.map((band) => band.from_deg),
    ).toEqual([77.5, 72.5, 67.5, 62.5, 57.5, 52.5, 47.5, 42.5]);
  });
});

describe("geomagneticLatitudeDeg", () => {
  it("gives 90 degrees at the dipole pole itself", () => {
    expect(
      geomagneticLatitudeDeg(
        GEOMAGNETIC_POLE_LATITUDE_DEG,
        GEOMAGNETIC_POLE_LONGITUDE_DEG,
      ),
    ).toBeCloseTo(90, 9);
  });

  it("gives the pole's colatitude complement at the geographic pole", () => {
    // At the geographic north pole the dipole latitude is the pole's own
    // latitude, 78.5 degrees, for every longitude.
    expect(geomagneticLatitudeDeg(90, 0)).toBeCloseTo(78.5, 9);
    expect(geomagneticLatitudeDeg(90, 123.4)).toBeCloseTo(78.5, 9);
  });

  it("gives -90 at the antipode of the dipole pole", () => {
    expect(geomagneticLatitudeDeg(-78.5, 111.8)).toBeCloseTo(-90, 9);
  });

  it("reduces to the pole's cosine on the pole meridian at the equator", () => {
    // sin(Gn) = cos(0) cos(78.5) cos(0) = cos(78.5).
    const expected =
      (Math.asin(Math.cos((78.5 * Math.PI) / 180)) * 180) / Math.PI;
    expect(
      geomagneticLatitudeDeg(0, GEOMAGNETIC_POLE_LONGITUDE_DEG),
    ).toBeCloseTo(expected, 9);
  });

  it("is symmetric about the pole meridian", () => {
    const east = geomagneticLatitudeDeg(
      50,
      GEOMAGNETIC_POLE_LONGITUDE_DEG + 30,
    );
    const west = geomagneticLatitudeDeg(
      50,
      GEOMAGNETIC_POLE_LONGITUDE_DEG - 30,
    );
    expect(east).toBeCloseTo(west, 12);
  });

  it("puts northern Europe well inside the auroral zone and Texas outside it", () => {
    // Tromso, 69.65 N 18.96 E, is a classic auroral-zone site; Austin, Texas,
    // 30.27 N 97.74 W, is not. The floor is 42.5 degrees.
    expect(geomagneticLatitudeDeg(69.65, 18.96)).toBeGreaterThan(
      AURORAL_MIN_GEOMAGNETIC_LATITUDE_DEG,
    );
    expect(geomagneticLatitudeDeg(30.27, -97.74)).toBeLessThan(
      AURORAL_MIN_GEOMAGNETIC_LATITUDE_DEG,
    );
  });

  it("rejects a non-finite coordinate", () => {
    expect(() => geomagneticLatitudeDeg(Number.NaN, 0)).toThrow(RangeError);
    expect(() => geomagneticLatitudeDeg(0, Number.POSITIVE_INFINITY)).toThrow(
      RangeError,
    );
  });
});

describe("midPathLocalTimeHours", () => {
  it("is UTC at the prime meridian", () => {
    expect(midPathLocalTimeHours(13, 0)).toBe(13);
  });

  it("advances one hour per fifteen degrees east", () => {
    expect(midPathLocalTimeHours(12, 15)).toBeCloseTo(13, 12);
    expect(midPathLocalTimeHours(12, -15)).toBeCloseTo(11, 12);
  });

  it("keeps the fractional part of an odd longitude", () => {
    // 68.2 W is 4.546666... hours behind UTC, not 4 and not 5.
    expect(midPathLocalTimeHours(12, -68.2)).toBeCloseTo(12 - 68.2 / 15, 12);
  });

  it("wraps past midnight in both directions", () => {
    expect(midPathLocalTimeHours(23, 30)).toBeCloseTo(1, 12);
    expect(midPathLocalTimeHours(1, -30)).toBeCloseTo(23, 12);
  });

  it("bands on the real local time and not on a truncated one", () => {
    // 68.2 W at 11:30 UTC is 06:57 local mean time, inside the 04 to 07 band.
    // Truncating the hour and the time zone separately, which is what the
    // reference does, gives 11 + (-4) = 7 and reads the 07 to 10 band.
    const t = midPathLocalTimeHours(11.5, -68.2);
    expect(t).toBeCloseTo(11.5 - 68.2 / 15, 12);
    expect(lhTimeBandIndex(t)).toBe(1);
    expect(lhTimeBandIndex(Math.trunc(11.5) + Math.trunc(-68.2 / 15))).toBe(2);
  });

  it("rejects a non-finite argument", () => {
    expect(() => midPathLocalTimeHours(Number.NaN, 0)).toThrow(RangeError);
    expect(() => midPathLocalTimeHours(0, Number.NaN)).toThrow(RangeError);
  });
});

describe("lhSeason", () => {
  it("reads the published northern months", () => {
    expect(lhSeason(50, 12)).toBe("winter");
    expect(lhSeason(50, 1)).toBe("winter");
    expect(lhSeason(50, 2)).toBe("winter");
    expect(lhSeason(50, 6)).toBe("summer");
    expect(lhSeason(50, 7)).toBe("summer");
    expect(lhSeason(50, 8)).toBe("summer");
    for (const month of [3, 4, 5, 9, 10, 11]) {
      expect(lhSeason(50, month)).toBe("equinox");
    }
  });

  it("interchanges winter and summer in the southern hemisphere", () => {
    expect(lhSeason(-50, 12)).toBe("summer");
    expect(lhSeason(-50, 1)).toBe("summer");
    expect(lhSeason(-50, 7)).toBe("winter");
  });

  it("leaves the equinox months alone in both hemispheres", () => {
    for (const month of [3, 4, 5, 9, 10, 11]) {
      expect(lhSeason(-50, month)).toBe("equinox");
      expect(lhSeason(50, month)).toBe(lhSeason(-50, month));
    }
  });

  it("counts the equator as northern", () => {
    expect(lhSeason(0, 1)).toBe("winter");
  });

  it("rejects a month outside 1 to 12", () => {
    expect(() => lhSeason(50, 0)).toThrow(RangeError);
    expect(() => lhSeason(50, 13)).toThrow(RangeError);
    expect(() => lhSeason(50, 6.5)).toThrow(RangeError);
    expect(() => lhSeason(Number.NaN, 6)).toThrow(RangeError);
  });
});

describe("lhTimeBandIndex", () => {
  it("puts each published band's lower edge in its own column", () => {
    expect(lhTimeBandIndex(1)).toBe(0);
    expect(lhTimeBandIndex(4)).toBe(1);
    expect(lhTimeBandIndex(7)).toBe(2);
    expect(lhTimeBandIndex(10)).toBe(3);
    expect(lhTimeBandIndex(13)).toBe(4);
    expect(lhTimeBandIndex(16)).toBe(5);
    expect(lhTimeBandIndex(19)).toBe(6);
    expect(lhTimeBandIndex(22)).toBe(7);
  });

  it("treats every band as half-open on the left", () => {
    expect(lhTimeBandIndex(3.999)).toBe(0);
    expect(lhTimeBandIndex(6.999)).toBe(1);
    expect(lhTimeBandIndex(21.999)).toBe(6);
  });

  it("wraps the 22 to 01 band through midnight", () => {
    expect(lhTimeBandIndex(23.5)).toBe(7);
    expect(lhTimeBandIndex(0)).toBe(7);
    expect(lhTimeBandIndex(0.999)).toBe(7);
    expect(lhTimeBandIndex(24)).toBe(7);
  });

  it("bands a time outside the day by wrapping it first", () => {
    expect(lhTimeBandIndex(25)).toBe(lhTimeBandIndex(1));
    expect(lhTimeBandIndex(-2)).toBe(lhTimeBandIndex(22));
  });

  it("agrees with the asset's declared bands over the whole day", () => {
    // The function is arithmetic and the asset is a transcription; this is the
    // sweep that proves they are the same eight intervals.
    for (let step = 0; step < 2400; step += 1) {
      const t = step / 100;
      const band = table.local_time_bands[lhTimeBandIndex(t)];
      const inBand =
        (t >= band.from_hours && t < band.to_hours) ||
        (t + 24 >= band.from_hours && t + 24 < band.to_hours);
      expect({ t, inBand }).toEqual({ t, inBand: true });
    }
  });

  it("rejects a non-finite time", () => {
    expect(() => lhTimeBandIndex(Number.NaN)).toThrow(RangeError);
  });
});

describe("lhLatitudeBandIndex", () => {
  it("puts each published band's lower edge in its own row", () => {
    expect(lhLatitudeBandIndex(77.5)).toBe(0);
    expect(lhLatitudeBandIndex(72.5)).toBe(1);
    expect(lhLatitudeBandIndex(67.5)).toBe(2);
    expect(lhLatitudeBandIndex(62.5)).toBe(3);
    expect(lhLatitudeBandIndex(57.5)).toBe(4);
    expect(lhLatitudeBandIndex(52.5)).toBe(5);
    expect(lhLatitudeBandIndex(47.5)).toBe(6);
    expect(lhLatitudeBandIndex(42.5)).toBe(7);
  });

  it("leaves the top band unbounded above", () => {
    expect(lhLatitudeBandIndex(80)).toBe(0);
    expect(lhLatitudeBandIndex(90)).toBe(0);
  });

  it("returns null below the 42.5 degree floor", () => {
    expect(lhLatitudeBandIndex(42.4999)).toBeNull();
    expect(lhLatitudeBandIndex(0)).toBeNull();
  });

  it("indexes on the magnitude, so the southern auroral zone reads the same rows", () => {
    for (const gn of [42.5, 55, 68, 79]) {
      expect(lhLatitudeBandIndex(-gn)).toBe(lhLatitudeBandIndex(gn));
    }
  });

  it("agrees with the asset's declared bands from the floor to the pole", () => {
    for (let step = 4250; step <= 9000; step += 1) {
      const gn = step / 100;
      const index = lhLatitudeBandIndex(gn);
      expect(index).not.toBeNull();
      const band = table.geomagnetic_latitude_bands[index as number];
      const inBand =
        gn >= band.from_deg && (band.to_deg === null || gn < band.to_deg);
      expect({ gn, inBand }).toEqual({ gn, inBand: true });
    }
  });

  it("rejects a non-finite latitude", () => {
    expect(() => lhLatitudeBandIndex(Number.NaN)).toThrow(RangeError);
  });
});

describe("lhDistanceRegime", () => {
  it("reads the 2500 km boundary as part a)", () => {
    expect(lhDistanceRegime(AURORAL_RANGE_BOUNDARY_KM)).toBe("le_2500_km");
    expect(lhDistanceRegime(2500.0001)).toBe("gt_2500_km");
    expect(lhDistanceRegime(1)).toBe("le_2500_km");
  });

  it("rejects a non-positive range", () => {
    expect(() => lhDistanceRegime(0)).toThrow(RangeError);
    expect(() => lhDistanceRegime(-1)).toThrow(RangeError);
    expect(() => lhDistanceRegime(Number.NaN)).toThrow(RangeError);
  });
});

describe("auroralLossAtPoint", () => {
  // A point on the dipole pole meridian at geographic 64 N, 68.2 W has
  // Gn = 64 - 78.5 + 90 = 75.5 degrees, because on the pole's own meridian the
  // dipole latitude is 90 - |lat_pole - lat|. That lands in row 1, 72.5 to
  // 77.5 degrees, with no table interpolation to hide an indexing error.
  const onPoleMeridian = { latitudeDeg: 64, longitudeDeg: -68.2 };

  it("places a pole-meridian point in the band the closed form predicts", () => {
    expect(geomagneticLatitudeDeg(64, -68.2)).toBeCloseTo(75.5, 9);
    const result = auroralLossAtPoint({
      point: onPoleMeridian,
      month: 1,
      midPathLocalTimeHours: 5,
      transmissionRangeKm: 2000,
    });
    expect(result.latitudeBandIndex).toBe(1);
    expect(result.timeBandIndex).toBe(1);
    expect(result.season).toBe("winter");
    expect(result.distanceRegime).toBe("le_2500_km");
    // Table 2 a), winter, 72.5-77.5 degrees, 04-07 local time.
    expect(result.lossDb).toBe(8.3);
  });

  it("reads the other half of the table past 2500 km", () => {
    const result = auroralLossAtPoint({
      point: onPoleMeridian,
      month: 1,
      midPathLocalTimeHours: 5,
      transmissionRangeKm: 2600,
    });
    expect(result.distanceRegime).toBe("gt_2500_km");
    // Table 2 b), winter, 72.5-77.5 degrees, 04-07 local time.
    expect(result.lossDb).toBe(4.5);
  });

  it("swaps the season for the same geomagnetic band in the south", () => {
    // 64 S on the meridian 180 degrees from the pole is the mirror point:
    // Gn = -75.5 degrees, magnitude the same row.
    const southern = { latitudeDeg: -64, longitudeDeg: 111.8 };
    expect(geomagneticLatitudeDeg(-64, 111.8)).toBeCloseTo(-75.5, 9);
    const january = auroralLossAtPoint({
      point: southern,
      month: 1,
      midPathLocalTimeHours: 5,
      transmissionRangeKm: 2000,
    });
    expect(january.season).toBe("summer");
    // Table 2 a), summer, 72.5-77.5 degrees, 04-07 local time.
    expect(january.lossDb).toBe(3.0);
  });

  it("is zero below the 42.5 degree floor whatever the season and hour", () => {
    const equatorial = { latitudeDeg: 0, longitudeDeg: 0 };
    for (const month of [1, 4, 7, 10]) {
      for (const hour of [0, 5, 11, 17, 23]) {
        const result = auroralLossAtPoint({
          point: equatorial,
          month,
          midPathLocalTimeHours: hour,
          transmissionRangeKm: 3000,
        });
        expect(result.lossDb).toBe(0);
        expect(result.latitudeBandIndex).toBeNull();
      }
    }
  });

  it("reports the geomagnetic latitude it used", () => {
    const result = auroralLossAtPoint({
      point: onPoleMeridian,
      month: 6,
      midPathLocalTimeHours: 23,
      transmissionRangeKm: 900,
    });
    expect(result.geomagneticLatitudeDeg).toBeCloseTo(75.5, 9);
    expect(result.timeBandIndex).toBe(7);
    expect(result.season).toBe("summer");
    // Table 2 a), summer, 72.5-77.5 degrees, 22-01 local time.
    expect(result.lossDb).toBe(4.5);
  });
});

describe("auroralLoss", () => {
  const auroral = {
    label: "M",
    point: { latitudeDeg: 64, longitudeDeg: -68.2 },
  };
  const equatorial = {
    label: "T + 1000",
    point: { latitudeDeg: 0, longitudeDeg: 0 },
  };

  it("returns the single point's value when Table 1d gives one point", () => {
    const result = auroralLoss({
      points: [auroral],
      month: 1,
      midPathLocalTimeHours: 5,
      transmissionRangeKm: 2000,
    });
    expect(result.lossDb).toBe(8.3);
    expect(result.perPoint).toHaveLength(1);
    expect(result.perPoint[0].label).toBe("M");
  });

  it("counts a point below the floor as a zero in the mean, not as absent", () => {
    const result = auroralLoss({
      points: [auroral, equatorial, equatorial],
      month: 1,
      midPathLocalTimeHours: 5,
      transmissionRangeKm: 2000,
    });
    // 8.3 dB at one point and 0 dB at two: the recommendation's mean over the
    // control points of Table 1d, not a mean over the auroral ones.
    expect(result.lossDb).toBeCloseTo(8.3 / 3, 12);
  });

  it("takes the mean over five points as Table 1d asks past 4000 km", () => {
    const result = auroralLoss({
      points: [auroral, auroral, equatorial, equatorial, equatorial],
      month: 1,
      midPathLocalTimeHours: 5,
      transmissionRangeKm: 2000,
    });
    expect(result.lossDb).toBeCloseTo((2 * 8.3) / 5, 12);
  });

  it("uses one mid-path local time for every control point", () => {
    // The same t reaches both points even though they are 68 degrees apart in
    // longitude: the column heading is "mid-path local time", not "local time
    // at the control point".
    const result = auroralLoss({
      points: [auroral, { ...auroral, label: "R - 1000" }],
      month: 1,
      midPathLocalTimeHours: 5,
      transmissionRangeKm: 2000,
    });
    expect(result.perPoint[0].timeBandIndex).toBe(
      result.perPoint[1].timeBandIndex,
    );
    expect(result.timeBandIndex).toBe(1);
  });

  it("wraps the reported mid-path local time into the day", () => {
    const result = auroralLoss({
      points: [auroral],
      month: 1,
      midPathLocalTimeHours: 26,
      transmissionRangeKm: 2000,
    });
    expect(result.midPathLocalTimeHours).toBeCloseTo(2, 12);
  });

  it("rejects an empty control point list", () => {
    expect(() =>
      auroralLoss({
        points: [],
        month: 1,
        midPathLocalTimeHours: 5,
        transmissionRangeKm: 2000,
      }),
    ).toThrow(RangeError);
  });
});
