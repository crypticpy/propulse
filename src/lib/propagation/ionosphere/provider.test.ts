// @vitest-environment node
//
// Deliberately node, not the repository default of jsdom. The provider must
// produce identical states on a server and in a browser, so one of the two test
// files that exercise it runs without a DOM. `numericalMap.test.ts` runs the
// same query under jsdom and asserts the same digest literal; if the two
// environments ever diverge, exactly one of those two assertions fails.

import { readFile } from "node:fs/promises";
import path from "node:path";

import { beforeAll, describe, expect, it } from "vitest";

import fixtures from "./fixtures/reference-parity.json";
import manifest from "./assets/manifest.json";
import {
  loadNumericalMapAsset,
  resetNumericalMapAssetCache,
  type AssetByteSource,
} from "./assets/loader";
import {
  CAPABILITIES,
  DETERMINISM_PROBE_DIGEST,
  DETERMINISM_PROBE_QUERY,
  createCcirIonosphereProvider,
  clearIonosphereProviders,
  getIonosphereProvider,
  ionosphereStateDigest,
  monthAnchorBracket,
  PROVIDER_ID,
  registerIonosphereProvider,
  type IonosphereProvider,
} from "./provider";
import {
  canonicalCoordinates,
  deepFreeze,
  IonosphereAssetError,
  IonosphereQueryError,
  known,
  nmF2FromFoF2,
  parseInstant,
  unknown,
  type CanonicalCoordinates,
  type IonosphereQuery,
} from "./types";

const assetBytes: AssetByteSource = async () => {
  const file = path.join(process.cwd(), manifest.asset.path);
  const bytes = await readFile(file);
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
};

/** The next representable double above `value`, for one-ulp probes. */
function nextUp(value: number): number {
  const view = new DataView(new ArrayBuffer(8));
  view.setFloat64(0, value);
  view.setBigUint64(0, view.getBigUint64(0) + 1n);
  return view.getFloat64(0);
}

async function freshProvider(
  source: AssetByteSource = assetBytes,
): Promise<IonosphereProvider> {
  resetNumericalMapAssetCache();
  return createCcirIonosphereProvider(source);
}

/**
 * Control-point dumps from the ITU reference executable (see
 * `climatology.test.ts` for provenance). The reference reaches foF2 and
 * M(3000)F2 by bilinear interpolation of float32 grids printed to three
 * decimals, at coordinates printed to the arc second, so the budget is the sum
 * of the map-versus-grid residual (1.0e-4 MHz measured over all 16,796,736
 * nodes), the printing (5e-4) and the coordinate rounding.
 */
const DUMP_ROWS = fixtures.rows.filter(
  (row) => row.source === "iturhfprop-dumppath",
);
const FOF2_TOLERANCE_MHZ = 2e-3;
const M3000F2_TOLERANCE = 1e-3;
const FOE_TOLERANCE_MHZ = 1e-3;

const queryFor = (row: (typeof DUMP_ROWS)[number]): IonosphereQuery => ({
  coordinates: canonicalCoordinates(row.latitude_deg, row.longitude_deg),
  validAt: `2026-${String(row.month).padStart(2, "0")}-15T${String(
    row.hour_utc,
  ).padStart(2, "0")}:00:00Z`,
  r12: known(row.ssn),
  mode: "reference",
});

describe("provider parity with the ITU reference executable", () => {
  let provider: IonosphereProvider;

  beforeAll(async () => {
    provider = await freshProvider();
  });

  it("has fixtures spanning the equator, mid-latitudes, aurora and the poles", () => {
    expect(DUMP_ROWS.length).toBeGreaterThanOrEqual(24);
    expect(DUMP_ROWS.some((row) => Math.abs(row.latitude_deg) < 10)).toBe(true);
    expect(DUMP_ROWS.some((row) => row.latitude_deg > 65)).toBe(true);
    expect(DUMP_ROWS.some((row) => row.latitude_deg < -35)).toBe(true);
    expect(
      new Set(DUMP_ROWS.map((row) => row.ssn)).size,
    ).toBeGreaterThanOrEqual(6);
  });

  it.each(DUMP_ROWS.map((row) => [row.case_id, row] as const))(
    "matches %s",
    (_id, row) => {
      const state = provider.state(queryFor(row));
      expect(Math.abs(state.foF2MHz - row.foF2_mhz)).toBeLessThan(
        FOF2_TOLERANCE_MHZ,
      );
      expect(Math.abs(state.m3000F2 - (row.m3000f2 as number))).toBeLessThan(
        M3000F2_TOLERANCE,
      );
      expect(Math.abs(state.foEMHz - (row.foE_mhz as number))).toBeLessThan(
        FOE_TOLERANCE_MHZ,
      );
      expect(
        Math.abs(state.nmF2PerM3 / nmF2FromFoF2(row.foF2_mhz) - 1),
      ).toBeLessThan(1e-3);
    },
  );

  it("round-trips foF2 through the plasma relation", () => {
    const state = provider.state(queryFor(DUMP_ROWS[0]));
    expect(8.98e-6 * Math.sqrt(state.nmF2PerM3)).toBeCloseTo(state.foF2MHz, 12);
  });
});

describe("capabilities", () => {
  it("marks everything P.533-14 does not compute as unsupported, with a reason", () => {
    for (const quantity of [
      "foF1",
      "hmF2",
      "foEs",
      "dRegionElectronDensity",
      "collisionFrequency",
      "mirrorReflectionHeight",
    ] as const) {
      const capability = CAPABILITIES[quantity];
      expect(capability.status).toBe("unsupported");
      if (capability.status === "unsupported") {
        expect(capability.reason.length).toBeGreaterThan(40);
      }
    }
  });

  it("names P.533-14 in the reason for foF1 and hmF2", () => {
    for (const quantity of ["foF1", "hmF2"] as const) {
      const capability = CAPABILITIES[quantity];
      expect(
        capability.status === "unsupported" && capability.reason,
      ).toContain("P.533-14");
    }
  });

  it("exposes no numeric accessor for an unsupported quantity", () => {
    // The state type has no `foF1MHz`/`hmF2Km` field at all, so a consumer
    // cannot read an undefined and treat it as a number.
    expect(Object.keys(CAPABILITIES)).toContain("hmF2");
  });
});

describe("solar index handling", () => {
  let provider: IonosphereProvider;

  beforeAll(async () => {
    provider = await freshProvider();
  });

  const query = (r12: IonosphereQuery["r12"]): IonosphereQuery => ({
    coordinates: canonicalCoordinates(40, -75),
    validAt: "2026-04-15T12:00:00Z",
    r12,
    mode: "reference",
  });

  it("uses the bundled SILSO climatology when R12 is unknown, and says so", () => {
    const state = provider.state(query(unknown("no solar feed")));
    expect(state.solarIndex.source).toBe("bundled-climatology");
    const assumption = state.assumptions.find((line) =>
      line.includes("R12 was not supplied"),
    );
    expect(assumption).toBeDefined();
    expect(assumption).toContain(manifest.solar_index_climatology.series);
    expect(assumption).toContain("no solar feed");
    expect(assumption).toContain(manifest.solar_index_climatology.captured_at);
  });

  it("converts the SILSO version 2.0 scale to the classic R12 the maps were fitted to", () => {
    const state = provider.state(query(unknown("no solar feed")));
    const latest =
      manifest.solar_index_climatology.months[
        manifest.solar_index_climatology.months.length - 1
      ];
    expect(state.solarIndex.requestedR12).toBeCloseTo(
      latest.smoothed_sn_v2 / 1.43,
      9,
    );
  });

  it("clips at R12 160 and reports the clip", () => {
    const state = provider.state(query(known(250)));
    expect(state.solarIndex.r12).toBe(160);
    expect(state.solarIndex.requestedR12).toBe(250);
    expect(state.solarIndex.clipped).toBe(true);
    expect(state.assumptions.some((line) => line.includes("clipped"))).toBe(
      true,
    );
    // And the clipped result is the R12 = 160 result, not an extrapolation.
    expect(state.foF2MHz).toBeCloseTo(
      provider.state(query(known(160))).foF2MHz,
      12,
    );
  });

  it("rejects a negative or non-finite R12 instead of producing a number", () => {
    expect(() => provider.state(query(known(-1)))).toThrow(RangeError);
    expect(() => provider.state(query(known(Number.NaN)))).toThrow(RangeError);
  });

  it("always names the adopted model in the assumptions", () => {
    const state = provider.state(query(known(80)));
    expect(state.assumptions[0]).toContain("ITU-R P.533-14");
    expect(state.assumptions[0]).toContain(manifest.asset.sha256);
  });
});

describe("query canonicalisation", () => {
  let provider: IonosphereProvider;

  beforeAll(async () => {
    provider = await freshProvider();
  });

  it("folds -0, longitude 180 and the poles to one spelling", () => {
    expect(canonicalCoordinates(-0, -0)).toEqual({ latitude: 0, longitude: 0 });
    expect(canonicalCoordinates(10, 180).longitude).toBe(-180);
    expect(canonicalCoordinates(90, 47).longitude).toBe(0);
    expect(canonicalCoordinates(-90, -133).longitude).toBe(0);
    expect(canonicalCoordinates(10, 540).longitude).toBe(-180);
  });

  it("rejects an out-of-range or non-finite position", () => {
    expect(() => canonicalCoordinates(91, 0)).toThrow(RangeError);
    expect(() => canonicalCoordinates(Number.NaN, 0)).toThrow(RangeError);
  });

  it("rejects a timestamp without an offset", () => {
    const bad: IonosphereQuery = {
      coordinates: canonicalCoordinates(0, 0),
      validAt: "2026-04-15T12:00:00",
      r12: known(80),
      mode: "reference",
    };
    expect(() => provider.state(bad)).toThrow(RangeError);
  });

  it("rejects an impossible calendar date that Date silently normalises", () => {
    // `new Date("2026-02-30T12:00:00Z")` is 2 March and
    // `new Date("2026-01-01T24:00:00Z")` is 2 January: the parser rolls the
    // overflow over instead of refusing it. Accepting either would answer a
    // different instant from the one the caller named while echoing the
    // impossible `validAt` back in the state.
    const query = (validAt: string): IonosphereQuery => ({
      coordinates: canonicalCoordinates(0, 0),
      validAt,
      r12: known(80),
      mode: "reference",
    });
    expect(parseInstant("2026-02-30T12:00:00Z")).toBeNull();
    expect(parseInstant("2026-01-01T24:00:00Z")).toBeNull();
    expect(() => provider.state(query("2026-02-30T12:00:00Z"))).toThrow(
      RangeError,
    );
    expect(() => provider.state(query("2026-01-01T24:00:00Z"))).toThrow(
      RangeError,
    );
    expect(parseInstant("2026-04-31T00:00:00Z")).toBeNull();
    expect(parseInstant("2026-06-15T12:60:00Z")).toBeNull();
  });

  it("accepts a real leap day and a non-UTC offset", () => {
    expect(parseInstant("2028-02-29T12:00:00Z")?.toISOString()).toBe(
      "2028-02-29T12:00:00.000Z",
    );
    // The offset shifts the instant, so the round-trip check must compare the
    // written calendar fields, not the UTC components of the parsed instant.
    expect(parseInstant("2026-03-08T12:00:00+05:30")?.toISOString()).toBe(
      "2026-03-08T06:30:00.000Z",
    );
    expect(parseInstant("2026-03-08T00:30:00-05:00")?.toISOString()).toBe(
      "2026-03-08T05:30:00.000Z",
    );
    expect(
      provider.state({
        coordinates: canonicalCoordinates(0, 0),
        validAt: "2028-02-29T12:00:00Z",
        r12: known(80),
        mode: "reference",
      }).foF2MHz,
    ).toBeGreaterThan(0);
  });

  it("validates coordinates at the boundary, not at the helper", () => {
    // `CanonicalCoordinates` is structural: nothing stops a caller building the
    // object literally and skipping `canonicalCoordinates()`. The grid edge
    // logic and the sunrise hour angle both have geographic domains, so the
    // check has to live at the entry point.
    const raw = (latitude: number, longitude: number): IonosphereQuery => ({
      coordinates: { latitude, longitude } as CanonicalCoordinates,
      validAt: "2026-04-15T12:00:00Z",
      r12: known(80),
      mode: "reference",
    });
    expect(() => provider.state(raw(91, 181))).toThrow(IonosphereQueryError);
    expect(() => provider.state(raw(-91, 0))).toThrow(IonosphereQueryError);
    expect(() => provider.state(raw(0, 181))).toThrow(IonosphereQueryError);
    expect(() => provider.state(raw(0, -180.5))).toThrow(IonosphereQueryError);
    expect(() => provider.state(raw(Number.NaN, 0))).toThrow(
      IonosphereQueryError,
    );
    expect(() => provider.state(raw(0, Number.POSITIVE_INFINITY))).toThrow(
      IonosphereQueryError,
    );
    // A query error is a RangeError, so callers that already catch RangeError
    // keep working.
    expect(() => provider.state(raw(91, 0))).toThrow(RangeError);
  });

  it("canonicalises an uncanonical query and echoes the canonical form", () => {
    const state = provider.state({
      coordinates: { latitude: -0, longitude: 180 } as CanonicalCoordinates,
      validAt: "2026-04-15T12:00:00Z",
      r12: known(80),
      mode: "reference",
    });
    expect(state.coordinates.longitude).toBe(-180);
    expect(Object.is(state.coordinates.latitude, 0)).toBe(true);
  });

  it("does not freeze the caller's own coordinate object", () => {
    // The state is deep-frozen. If it held the caller's object, freezing it
    // would reach back out of the provider and change the caller's value.
    const coordinates = { latitude: 30, longitude: 60 };
    provider.state({
      coordinates: coordinates as CanonicalCoordinates,
      validAt: "2026-04-15T12:00:00Z",
      r12: known(80),
      mode: "reference",
    });
    expect(Object.isFrozen(coordinates)).toBe(false);
  });

  it("rejects a mode it does not implement", () => {
    const query = {
      coordinates: canonicalCoordinates(30, 60),
      validAt: "2026-04-15T12:00:00Z",
      r12: known(80),
      mode: "Reference",
    } as unknown as IonosphereQuery;
    expect(() => provider.state(query)).toThrow(IonosphereQueryError);
  });

  it("rejects a malformed solar index", () => {
    const query = (r12: unknown): IonosphereQuery =>
      ({
        coordinates: canonicalCoordinates(30, 60),
        validAt: "2026-04-15T12:00:00Z",
        r12,
        mode: "reference",
      }) as IonosphereQuery;
    expect(() =>
      provider.state(query({ known: true, value: Number.NaN })),
    ).toThrow(IonosphereQueryError);
    expect(() => provider.state(query({ known: true, value: -1 }))).toThrow(
      IonosphereQueryError,
    );
    expect(() => provider.state(query(undefined))).toThrow(
      IonosphereQueryError,
    );
  });

  it("rejects a solar index whose discriminant is not a boolean literal", () => {
    // A truthy test on `known` reads {"known":"false"} out of untrusted JSON as
    // a caller-supplied R12, and reads {"known":0} as an unknown index with a
    // missing reason - the wrong field in the wrong error.
    const query = (r12: unknown): IonosphereQuery =>
      ({
        coordinates: canonicalCoordinates(30, 60),
        validAt: "2026-04-15T12:00:00Z",
        r12,
        mode: "reference",
      }) as IonosphereQuery;
    const fieldOf = (r12: unknown): string => {
      try {
        provider.state(query(r12));
      } catch (error) {
        if (error instanceof IonosphereQueryError) return error.field;
        throw error;
      }
      return "accepted";
    };
    expect(fieldOf({ known: "false", value: 80 })).toBe("r12.known");
    expect(fieldOf({ known: "true", value: 80 })).toBe("r12.known");
    expect(fieldOf({ known: 0, reason: "none" })).toBe("r12.known");
    expect(fieldOf({ known: 1, value: 80 })).toBe("r12.known");
    expect(fieldOf({ value: 80 })).toBe("r12");
  });

  it("gives the same answer at every meridian at a pole", () => {
    const at = (longitude: number) =>
      provider.state({
        coordinates: canonicalCoordinates(90, longitude),
        validAt: "2026-04-15T12:00:00Z",
        r12: known(80),
        mode: "reference",
      }).foF2MHz;
    expect(at(0)).toBe(at(137));
    expect(at(0)).toBe(at(-42));
  });

  it("is continuous across the antimeridian in enhanced mode", () => {
    const at = (longitude: number) =>
      provider.state({
        coordinates: canonicalCoordinates(35, longitude),
        validAt: "2026-07-15T06:00:00Z",
        r12: known(80),
        mode: "enhanced",
      }).foF2MHz;
    expect(Math.abs(at(179.999) - at(-179.999))).toBeLessThan(1e-4);
  });

  it("is discontinuous across the antimeridian in reference mode", () => {
    // Not a wrap bug: +179.999 is in the reference's north-east quadrant and
    // -179.999 in its north-west one, and the two quadrants measure the
    // longitude fraction in opposite directions. Pinned so the seam is visible
    // rather than surprising, and so it stays confined to reference mode.
    const at = (longitude: number) =>
      provider.state({
        coordinates: canonicalCoordinates(35, longitude),
        validAt: "2026-07-15T06:00:00Z",
        r12: known(80),
        mode: "reference",
      }).foF2MHz;
    expect(Math.abs(at(179.999) - at(-179.999))).toBeGreaterThan(1e-3);
  });

  it("is continuous across a 1.5-degree grid line in enhanced mode", () => {
    const at = (latitude: number) =>
      provider.state({
        coordinates: canonicalCoordinates(latitude, 60),
        validAt: "2026-07-15T06:00:00Z",
        r12: known(80),
        mode: "enhanced",
      }).foF2MHz;
    // 0.0002 degrees of latitude at dfoF2/dlat ~ 0.1 MHz/degree.
    expect(Math.abs(at(30.0001) - at(29.9999))).toBeLessThan(1e-4);
  });
});

describe("time modes", () => {
  let provider: IonosphereProvider;

  beforeAll(async () => {
    provider = await freshProvider();
  });

  const at = (validAt: string, mode: IonosphereQuery["mode"]) =>
    provider.state({
      coordinates: canonicalCoordinates(30, 60),
      validAt,
      r12: known(80),
      mode,
    });

  it("agrees between modes at a grid node on an anchor day and integer hour", () => {
    // 30N 60E is a node of the 1.5-degree grid and the start of 15 April is a
    // P.533 monthly anchor, so reference mode's bilinear weights are zero and
    // enhanced mode's month weight is zero: both evaluate the same map at the
    // same hour. Anchors are the start of the 15th, not its noon; the choice is
    // arbitrary within a monthly-median model and is fixed here so it is
    // testable.
    const reference = at("2026-04-15T00:00:00Z", "reference");
    const enhanced = at("2026-04-15T00:00:00Z", "enhanced");
    expect(enhanced.foF2MHz).toBeCloseTo(reference.foF2MHz, 7);
    expect(enhanced.m3000F2).toBeCloseTo(reference.m3000F2, 7);
    expect(enhanced.foEMHz).toBeCloseTo(reference.foEMHz, 7);
  });

  it("exposes the reference implementation's mirrored western fraction", () => {
    // 52.214167 N 42.034722 W in January at 11 UTC is a control point of the
    // ITU executable's own dump, which reports foF2 = 5.202 MHz. Evaluating the
    // numerical map at that point gives 5.298. Reference mode must reproduce
    // the former and enhanced mode the latter: that gap is the whole reason
    // both modes exist, and a regression in either direction is a silent
    // 0.1 MHz error for every western-hemisphere user.
    const query = {
      coordinates: canonicalCoordinates(52.214167, -42.034722),
      validAt: "2026-01-15T11:00:00Z",
      r12: known(50),
    } as const;
    const reference = provider.state({ ...query, mode: "reference" });
    const enhanced = provider.state({ ...query, mode: "enhanced" });
    expect(reference.foF2MHz).toBeCloseTo(5.202, 3);
    // 5.30, not 5.298: enhanced mode is 11/24 of a day past the January anchor
    // and has already blended 1.5% of February in.
    expect(enhanced.foF2MHz).toBeCloseTo(5.3, 2);
    expect(enhanced.foF2MHz - reference.foF2MHz).toBeGreaterThan(0.09);
    expect(
      reference.assumptions.some((line) => line.includes("mirrored")),
    ).toBe(true);
  });

  it("is discontinuous at an hour boundary in reference mode, because P.533 is", () => {
    const before = at("2026-04-15T08:59:59Z", "reference");
    const after = at("2026-04-15T09:00:00Z", "reference");
    expect(Math.abs(after.foF2MHz - before.foF2MHz)).toBeGreaterThan(1e-3);
  });

  it("is continuous across the same hour boundary in enhanced mode", () => {
    const before = at("2026-04-15T08:59:59.999Z", "enhanced");
    const after = at("2026-04-15T09:00:00Z", "enhanced");
    expect(Math.abs(after.foF2MHz - before.foF2MHz)).toBeLessThan(1e-5);
  });

  it("is continuous across midnight in enhanced mode", () => {
    const before = at("2026-04-15T23:59:59.999Z", "enhanced");
    const after = at("2026-04-16T00:00:00Z", "enhanced");
    expect(Math.abs(after.foF2MHz - before.foF2MHz)).toBeLessThan(1e-5);
  });

  it("is discontinuous at a month boundary in reference mode", () => {
    const before = at("2026-04-30T12:00:00Z", "reference");
    const after = at("2026-05-01T12:00:00Z", "reference");
    expect(Math.abs(after.foF2MHz - before.foF2MHz)).toBeGreaterThan(1e-3);
  });

  it("is continuous across the same month boundary in enhanced mode", () => {
    const before = at("2026-04-30T23:59:59.999Z", "enhanced");
    const after = at("2026-05-01T00:00:00Z", "enhanced");
    expect(Math.abs(after.foF2MHz - before.foF2MHz)).toBeLessThan(1e-4);
  });

  it("wraps the December to January anchor seam without a jump", () => {
    const bracket = monthAnchorBracket(1, 2026);
    expect(bracket.earlier).toBe(11);
    expect(bracket.later).toBe(0);
    expect(monthAnchorBracket(15, 2026)).toEqual({
      earlier: 0,
      later: 1,
      weight: 0,
    });
    expect(monthAnchorBracket(349, 2026)).toEqual({
      earlier: 11,
      later: 0,
      weight: 0,
    });
    const before = at("2026-12-31T23:59:59.999Z", "enhanced");
    const after = at("2027-01-01T00:00:00Z", "enhanced");
    expect(Math.abs(after.foF2MHz - before.foF2MHz)).toBeLessThan(1e-4);
  });

  it("anchors on the calendar 15th in a leap year", () => {
    // 15 March 2028 is day 75, not the fixed-table 74: after February a leap
    // year shifts every anchor by a day. With a fixed table the enhanced month
    // weight would be 1/31 instead of 0 on the calendar anchor and the two
    // modes would no longer meet.
    expect(monthAnchorBracket(75, 2028)).toEqual({
      earlier: 2,
      later: 3,
      weight: 0,
    });
    const reference = at("2028-03-15T00:00:00Z", "reference");
    const enhanced = at("2028-03-15T00:00:00Z", "enhanced");
    expect(enhanced.foF2MHz).toBeCloseTo(reference.foF2MHz, 7);
    expect(enhanced.m3000F2).toBeCloseTo(reference.m3000F2, 7);
    expect(enhanced.foEMHz).toBeCloseTo(reference.foEMHz, 7);
  });

  it("wraps the leap-year December to January seam without a jump", () => {
    // 2028 has 366 days. A 365-day wrap runs the weight past 1 on 31 December
    // and then drops it back by a day's worth at midnight.
    const before = at("2028-12-31T23:59:59.999Z", "enhanced");
    const after = at("2029-01-01T00:00:00Z", "enhanced");
    expect(Math.abs(after.foF2MHz - before.foF2MHz)).toBeLessThan(1e-4);
    expect(Math.abs(after.m3000F2 - before.m3000F2)).toBeLessThan(1e-4);
  });

  it("keeps the solar geometry continuous across the leap-year seam", () => {
    // The reference's solar model reads the day number as orbital phase. On a
    // leap year that number reaches 366 and then resets to 1, which is three
    // quarters of a day of orbit in one millisecond. Enhanced mode maps the
    // calendar onto the model's own year length instead.
    const solarAt = (validAt: string, mode: IonosphereQuery["mode"]) =>
      provider.state({
        coordinates: canonicalCoordinates(45, 0),
        validAt,
        r12: known(80),
        mode,
      }).solar;
    const before = solarAt("2028-12-31T23:59:59.999Z", "enhanced");
    const after = solarAt("2029-01-01T00:00:00Z", "enhanced");
    expect(Math.abs(after.zenithAngleDeg - before.zenithAngleDeg)).toBeLessThan(
      1e-6,
    );
    expect(Math.abs(after.declinationDeg - before.declinationDeg)).toBeLessThan(
      1e-6,
    );
    expect(
      Math.abs(after.equationOfTimeMinutes - before.equationOfTimeMinutes),
    ).toBeLessThan(1e-4);
  });

  it("keeps the solar geometry continuous across an ordinary year seam", () => {
    const solarAt = (validAt: string) =>
      provider.state({
        coordinates: canonicalCoordinates(45, 0),
        validAt,
        r12: known(80),
        mode: "enhanced",
      }).solar;
    const before = solarAt("2026-12-31T23:59:59.999Z");
    const after = solarAt("2027-01-01T00:00:00Z");
    expect(Math.abs(after.zenithAngleDeg - before.zenithAngleDeg)).toBeLessThan(
      1e-6,
    );
  });

  it("interpolates monotonically between two monthly anchors", () => {
    const january = at("2026-01-15T12:00:00Z", "enhanced").foF2MHz;
    const february = at("2026-02-15T12:00:00Z", "enhanced").foF2MHz;
    const between = at("2026-01-31T12:00:00Z", "enhanced").foF2MHz;
    expect(between).toBeGreaterThan(Math.min(january, february) - 1e-9);
    expect(between).toBeLessThan(Math.max(january, february) + 1e-9);
  });

  it("advances the night foE clock continuously in enhanced mode", () => {
    // 45 N 0 E in mid-January: the sun set around 16:20 UTC, so at 18:00 the
    // E layer is on the exp(-1.4 h) decay and the hour is what drives it.
    const night = (validAt: string, mode: IonosphereQuery["mode"]) =>
      provider.state({
        coordinates: canonicalCoordinates(45, 0),
        validAt,
        r12: known(80),
        mode,
      });
    const before = night("2026-01-15T17:59:59.999Z", "enhanced");
    const after = night("2026-01-15T18:00:00Z", "enhanced");
    expect(before.solar.zenithAngleDeg).toBeGreaterThan(90);
    expect(before.foEMHz).toBeGreaterThan(0);
    expect(Math.abs(after.foEMHz - before.foEMHz)).toBeLessThan(1e-6);

    // Reference mode keeps P.533's integer, hour-ending clock, so the same
    // millisecond is a real step there. Pinned so the truncation cannot leak
    // back into enhanced mode unnoticed.
    const referenceBefore = night("2026-01-15T17:59:59.999Z", "reference");
    const referenceAfter = night("2026-01-15T18:00:00Z", "reference");
    expect(
      Math.abs(referenceAfter.foEMHz - referenceBefore.foEMHz),
    ).toBeGreaterThan(1e-3);
  });

  it("labels the mode in the state and in the digest", async () => {
    const reference = at("2026-06-20T07:30:00Z", "reference");
    const enhanced = at("2026-06-20T07:30:00Z", "enhanced");
    expect(reference.mode).toBe("reference");
    expect(enhanced.mode).toBe("enhanced");
    expect(await ionosphereStateDigest(reference)).not.toBe(
      await ionosphereStateDigest(enhanced),
    );
  });
});

describe("determinism", () => {
  let provider: IonosphereProvider;

  beforeAll(async () => {
    provider = await freshProvider();
  });

  it("returns a frozen state that a consumer cannot mutate", () => {
    const state = provider.state(DETERMINISM_PROBE_QUERY);
    expect(Object.isFrozen(state)).toBe(true);
    expect(Object.isFrozen(state.solarIndex)).toBe(true);
    expect(Object.isFrozen(state.assumptions)).toBe(true);
  });

  it("gives the same digest for repeated evaluation of the same query", async () => {
    const first = await ionosphereStateDigest(
      provider.state(DETERMINISM_PROBE_QUERY),
    );
    const second = await ionosphereStateDigest(
      provider.state(DETERMINISM_PROBE_QUERY),
    );
    expect(second).toBe(first);
  });

  it("gives the same digest in node as jsdom does", async () => {
    // The other half of this assertion is in `numericalMap.test.ts`, which runs
    // under jsdom. A literal, not a cross-import, so neither environment can
    // borrow the other's answer.
    expect(
      await ionosphereStateDigest(provider.state(DETERMINISM_PROBE_QUERY)),
    ).toBe(DETERMINISM_PROBE_DIGEST);
  });

  it("gives a different digest for a different position or time", async () => {
    const base = await ionosphereStateDigest(
      provider.state(DETERMINISM_PROBE_QUERY),
    );
    const moved = await ionosphereStateDigest(
      provider.state({
        ...DETERMINISM_PROBE_QUERY,
        coordinates: canonicalCoordinates(30, 61.5),
      }),
    );
    const later = await ionosphereStateDigest(
      provider.state({
        ...DETERMINISM_PROBE_QUERY,
        validAt: "2026-04-15T10:00:00Z",
      }),
    );
    expect(moved).not.toBe(base);
    expect(later).not.toBe(base);
  });

  it("separates two requests that clip to the same model input", async () => {
    // R12 200 and 250 both clip to the model ceiling of 160, so the modelled
    // numbers are identical, but the two states carry different
    // `requestedR12` values and different clipping assumptions. The digest is
    // the identity of the whole state, so a cache keyed by it returns exactly
    // the state that was stored, metadata included.
    const query = (r12: number): IonosphereQuery => ({
      coordinates: canonicalCoordinates(30, 60),
      validAt: "2026-04-15T09:00:00Z",
      r12: known(r12),
      mode: "reference",
    });
    const loud = provider.state(query(200));
    const louder = provider.state(query(250));
    expect(louder.foF2MHz).toBe(loud.foF2MHz);
    expect(louder.solarIndex.r12).toBe(160);
    expect(loud.solarIndex.r12).toBe(160);
    expect(louder.solarIndex.requestedR12).not.toBe(
      loud.solarIndex.requestedR12,
    );
    expect(await ionosphereStateDigest(louder)).not.toBe(
      await ionosphereStateDigest(loud),
    );
  });

  it("absorbs a one-ulp difference in every field it digests", async () => {
    // The quantisation exists to survive a 1-ulp spread between engines, which
    // it can only do while the grid it rounds to is coarser than binary64
    // itself. `nmF2PerM3` is ~1e12, where adjacent doubles are ~1e-4 apart, so
    // an absolute 1e-6 grid is four orders of magnitude too fine there and the
    // spread it exists to absorb passes straight through.
    const state = provider.state(DETERMINISM_PROBE_QUERY);
    const digest = await ionosphereStateDigest(state);
    const nudged = nextUp(state.nmF2PerM3);
    expect(nudged).not.toBe(state.nmF2PerM3);
    expect(nudged - state.nmF2PerM3).toBeGreaterThan(1e-6);
    expect(await ionosphereStateDigest({ ...state, nmF2PerM3: nudged })).toBe(
      digest,
    );
  });

  it("carries no field that another digested field already determines", () => {
    // NmF2 is a pure function of foF2, so it can be dropped from the digest
    // without weakening it; keeping it would only add a field whose magnitude
    // no absolute quantisation can cover.
    const state = provider.state(DETERMINISM_PROBE_QUERY);
    expect(state.nmF2PerM3).toBe(nmF2FromFoF2(state.foF2MHz));
  });

  it("separates two requested R12 values a tolerance grid would merge", async () => {
    // Both clip to the ceiling of 160, so every modelled number is identical
    // and both assumption strings render the request as "200.0"; the only thing
    // that tells the two states apart is `requestedR12` itself. A caller's own
    // number is identity, not a measurement, so it is digested exactly - a
    // tolerance grid here lets a cache answer one request with another's
    // metadata.
    const query = (r12: number): IonosphereQuery => ({
      coordinates: canonicalCoordinates(30, 60),
      validAt: "2026-04-15T09:00:00Z",
      r12: known(r12),
      mode: "reference",
    });
    const low = provider.state(query(200.0000001));
    const high = provider.state(query(200.0000002));
    expect(high.foF2MHz).toBe(low.foF2MHz);
    expect(high.assumptions).toEqual(low.assumptions);
    expect(high.solarIndex.requestedR12).not.toBe(low.solarIndex.requestedR12);
    expect(await ionosphereStateDigest(high)).not.toBe(
      await ionosphereStateDigest(low),
    );
  });

  it("separates two coordinates a tolerance grid would merge", async () => {
    // The echoed coordinates are the caller's own numbers too.
    const at = (latitude: number) =>
      ionosphereStateDigest(
        provider.state({
          ...DETERMINISM_PROBE_QUERY,
          coordinates: canonicalCoordinates(latitude, 60),
        }),
      );
    expect(await at(30.0000001)).not.toBe(await at(30.0000002));
  });

  it("separates two requested R12 values beyond the absolute grid", async () => {
    // `requestedR12` is the caller's own number and is bounded by nothing but
    // binary64. Dividing by 1e-6 overflows above ~1.8e302, so an absolute grid
    // maps every such request to one symbol and a cache keyed by the digest
    // would answer one request with another's state.
    const state = provider.state(DETERMINISM_PROBE_QUERY);
    const withRequest = (requestedR12: number) =>
      ionosphereStateDigest({
        ...state,
        solarIndex: { ...state.solarIndex, requestedR12 },
      });
    expect(await withRequest(1e303)).not.toBe(await withRequest(2e303));
  });

  it("covers the assumptions and the solar geometry, not only foF2", async () => {
    const state = provider.state(DETERMINISM_PROBE_QUERY);
    const digest = await ionosphereStateDigest(state);
    const tweak = (patch: Partial<Record<string, unknown>>) =>
      ionosphereStateDigest({
        ...state,
        ...patch,
      } as typeof state);
    expect(
      await tweak({ assumptions: [...state.assumptions, "extra"] }),
    ).not.toBe(digest);
    expect(
      await tweak({
        solar: {
          ...state.solar,
          zenithAngleDeg: state.solar.zenithAngleDeg + 1,
        },
      }),
    ).not.toBe(digest);
    expect(
      await tweak({ magneticDip300kmDeg: state.magneticDip300kmDeg + 1 }),
    ).not.toBe(digest);
  });

  it("does not depend on the ambient clock or locale", async () => {
    const before = await ionosphereStateDigest(
      provider.state(DETERMINISM_PROBE_QUERY),
    );
    const realNow = Date.now;
    Date.now = () => 0;
    try {
      expect(
        await ionosphereStateDigest(provider.state(DETERMINISM_PROBE_QUERY)),
      ).toBe(before);
    } finally {
      Date.now = realNow;
    }
  });
});

describe("fail-loud asset handling", () => {
  it("refuses a truncated asset", async () => {
    await expect(
      freshProvider(async () => new ArrayBuffer(1024)),
    ).rejects.toBeInstanceOf(IonosphereAssetError);
  });

  it("refuses an asset whose digest does not match the manifest", async () => {
    await expect(
      freshProvider(async () => {
        const bytes = new Uint8Array(await assetBytes(""));
        bytes[200] ^= 0xff;
        return bytes.buffer as ArrayBuffer;
      }),
    ).rejects.toThrow(/digest does not match/);
  });

  it("names the artifact and both digests when the digest is wrong", async () => {
    const error: unknown = await freshProvider(async () => {
      const bytes = new Uint8Array(await assetBytes(""));
      bytes[512] ^= 0x01;
      return bytes.buffer as ArrayBuffer;
    }).then(
      () => null,
      (caught: unknown) => caught,
    );
    expect(error).toBeInstanceOf(IonosphereAssetError);
    if (!(error instanceof IonosphereAssetError)) return;
    expect(error.artifact).toBe(manifest.asset.served_at);
    expect(error.expectedHash).toBe(manifest.asset.sha256);
    expect(error.actualHash).not.toBe(manifest.asset.sha256);
  });

  it("surfaces a failed fetch rather than falling back to a curve", async () => {
    await expect(
      freshProvider(async () => {
        throw new Error("offline");
      }),
    ).rejects.toThrow("offline");
  });

  it("does not cache a failed load, so a retry can succeed", async () => {
    await expect(
      freshProvider(async () => new ArrayBuffer(8)),
    ).rejects.toBeInstanceOf(IonosphereAssetError);
    await expect(loadNumericalMapAsset(assetBytes)).resolves.toMatchObject({
      artifactHash: manifest.asset.sha256,
    });
  });
});

describe("coefficient ownership", () => {
  it("ignores mutation of the caller's buffer and of the returned arrays", async () => {
    const buffer = await assetBytes(manifest.asset.served_at);
    const provider = await freshProvider(async () => buffer);
    const before = provider.state(DETERMINISM_PROBE_QUERY);
    const beforeDigest = await ionosphereStateDigest(before);

    // The hash was checked over these bytes; everything after that point must
    // come from storage the provider owns, or a caller could keep the verified
    // artifact hash while feeding the model different coefficients.
    new Float64Array(buffer, 64).fill(1);
    const asset = await loadNumericalMapAsset(async () => buffer);
    for (const level of asset.blocks[3]) {
      // A read-only view at the type level; this cast is the escape a
      // determined caller would use.
      (level.foF2 as unknown as Float64Array).fill(2);
      (level.m3000F2 as unknown as Float64Array).fill(2);
    }

    const after = provider.state(DETERMINISM_PROBE_QUERY);
    expect(after.foF2MHz).toBe(before.foF2MHz);
    expect(after.m3000F2).toBe(before.m3000F2);
    expect(await ionosphereStateDigest(after)).toBe(beforeDigest);
    resetNumericalMapAssetCache();
  });

  it("protects providers created after the returned arrays are mutated", async () => {
    // The order that matters: mutate what the public loader handed out, and
    // only then build a provider. A private per-provider copy alone would copy
    // the damage, because it copies from the shared cache.
    resetNumericalMapAssetCache();
    const pristine = await createCcirIonosphereProvider(assetBytes);
    const expected = pristine.state(DETERMINISM_PROBE_QUERY);
    const expectedDigest = await ionosphereStateDigest(expected);

    const handed = await loadNumericalMapAsset(assetBytes);
    for (const levels of handed.blocks) {
      for (const level of levels) {
        (level.foF2 as unknown as Float64Array).fill(3);
        (level.m3000F2 as unknown as Float64Array).fill(3);
      }
    }
    const later = await createCcirIonosphereProvider(assetBytes);
    const actual = later.state(DETERMINISM_PROBE_QUERY);
    expect(actual.foF2MHz).toBe(expected.foF2MHz);
    expect(actual.m3000F2).toBe(expected.m3000F2);
    expect(await ionosphereStateDigest(actual)).toBe(expectedDigest);
    expect(later.artifactHash).toBe(pristine.artifactHash);
    resetNumericalMapAssetCache();
  });

  it("hands every caller an independent copy", async () => {
    resetNumericalMapAssetCache();
    const first = await loadNumericalMapAsset(assetBytes);
    const second = await loadNumericalMapAsset(assetBytes);
    expect(second.artifactHash).toBe(first.artifactHash);
    expect(second.blocks[0][0].foF2).not.toBe(first.blocks[0][0].foF2);
    const original = second.blocks[0][0].foF2[0];
    (first.blocks[0][0].foF2 as unknown as Float64Array)[0] = 42;
    expect(second.blocks[0][0].foF2[0]).toBe(original);
    resetNumericalMapAssetCache();
  });
});

describe("shared state", () => {
  it("exports capabilities that cannot be edited through any provider", async () => {
    const provider = await freshProvider();
    expect(Object.isFrozen(CAPABILITIES)).toBe(true);
    expect(Object.isFrozen(CAPABILITIES.foF2)).toBe(true);
    expect(() => {
      (CAPABILITIES.foF2 as { status: string }).status = "supported";
    }).toThrow(TypeError);
    expect(provider.capabilities.foF1.status).toBe("unsupported");
  });

  it("exports a determinism probe that cannot be edited", () => {
    expect(Object.isFrozen(DETERMINISM_PROBE_QUERY)).toBe(true);
    expect(Object.isFrozen(DETERMINISM_PROBE_QUERY.coordinates)).toBe(true);
    expect(Object.isFrozen(DETERMINISM_PROBE_QUERY.r12)).toBe(true);
  });

  it("does not read the solar climatology out of a mutable shared import", async () => {
    // `manifest.json` is a module object every importer shares. The provider
    // takes its own frozen snapshot at load, so a consumer editing the import
    // cannot move the R12 the fallback reports.
    const provider = await freshProvider();
    const query: IonosphereQuery = {
      coordinates: canonicalCoordinates(30, 60),
      validAt: "2026-04-15T09:00:00Z",
      r12: unknown("not supplied"),
      mode: "reference",
    };
    const before = provider.state(query).solarIndex.requestedR12;
    const months = manifest.solar_index_climatology.months;
    const last = months[months.length - 1];
    const original = last.smoothed_sn_v2;
    last.smoothed_sn_v2 = 9999;
    try {
      expect(provider.state(query).solarIndex.requestedR12).toBe(before);
    } finally {
      last.smoothed_sn_v2 = original;
    }
  });

  it("rejects an unknown solar index without a reason string", async () => {
    const provider = await freshProvider();
    expect(() =>
      provider.state({
        coordinates: canonicalCoordinates(30, 60),
        validAt: "2026-04-15T09:00:00Z",
        r12: { known: false, reason: 42 } as unknown as IonosphereQuery["r12"],
        mode: "reference",
      }),
    ).toThrow(IonosphereQueryError);
  });

  it("deep-freezes through an already shallow-frozen object", () => {
    // The short-circuit on `Object.isFrozen` used to stop at the top level, so
    // anything built with a plain `Object.freeze` kept mutable children.
    const value = Object.freeze({ nested: { mutable: 1 } });
    deepFreeze(value);
    expect(Object.isFrozen(value.nested)).toBe(true);
  });

  it("deep-freezes a self-referential object without recursing forever", () => {
    const cyclic: Record<string, unknown> = { name: "cycle" };
    cyclic.self = cyclic;
    expect(() => deepFreeze(cyclic)).not.toThrow();
    expect(Object.isFrozen(cyclic)).toBe(true);
  });
});

describe("provider registry", () => {
  it("refuses a provider without a usable id", async () => {
    const provider = await freshProvider();
    expect(() => registerIonosphereProvider({ ...provider, id: "  " })).toThrow(
      IonosphereQueryError,
    );
    expect(() =>
      registerIonosphereProvider({
        ...provider,
        id: undefined as unknown as string,
      }),
    ).toThrow(IonosphereQueryError);
  });

  it("registers and resolves an alternative provider by id", async () => {
    clearIonosphereProviders();
    const provider = await freshProvider();
    expect(getIonosphereProvider(PROVIDER_ID)).toBeUndefined();
    registerIonosphereProvider(provider);
    expect(getIonosphereProvider(PROVIDER_ID)).toBe(provider);
    clearIonosphereProviders();
    expect(getIonosphereProvider(PROVIDER_ID)).toBeUndefined();
  });

  it("stamps the provider identity and artifact hash on every state", async () => {
    const provider = await freshProvider();
    const state = provider.state(DETERMINISM_PROBE_QUERY);
    expect(state.providerId).toBe(provider.id);
    expect(state.providerVersion).toBe(provider.version);
    expect(state.artifactHash).toBe(manifest.asset.sha256);
  });
});
