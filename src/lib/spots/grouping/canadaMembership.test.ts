import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { CANADA_PROVINCES, CANADA_SOURCE_COMMIT as GENERATED_COMMIT } from "@/lib/data/canadaProvinces.generated";
import { US_STATES } from "@/lib/data/usStates.generated";
import { WORLD_COUNTRIES } from "@/lib/data/worldCountries.generated";
import { ATLAS_GAP_COUNTRIES } from "./atlasGaps";
import { CANADA_SOURCE_COMMIT, SPOT_GEOGRAPHY_VERSION } from "./version";
import {
  countryMatchFromCode,
  lookupCaSubdivision,
  lookupCountry,
  lookupUsSubdivision,
} from "./lookup";
import { pointInPolygonWithHoles } from "./pointInPolygon";
import { representativePoint, representativePointFromRings } from "./representativePoint";

const PROVINCE_SAMPLES: Record<string, { lat: number; lon: number }> = {
  AB: { lat: 53.55, lon: -113.49 },
  BC: { lat: 49.28, lon: -123.12 },
  MB: { lat: 49.9, lon: -97.14 },
  NB: { lat: 45.96, lon: -66.64 },
  NL: { lat: 47.56, lon: -52.71 },
  NT: { lat: 62.45, lon: -114.37 },
  NS: { lat: 44.65, lon: -63.58 },
  NU: { lat: 63.75, lon: -68.52 },
  ON: { lat: 43.7, lon: -79.4 },
  PE: { lat: 46.24, lon: -63.13 },
  QC: { lat: 46.81, lon: -71.21 },
  SK: { lat: 52.13, lon: -106.67 },
  YT: { lat: 60.72, lon: -135.05 },
};

describe("Canadian provincial membership", () => {
  it("keeps populated coastlines and islands in the correct subdivision", () => {
    expect(lookupCaSubdivision(49.2827, -123.1207)?.region.id).toBe("subdivision:CA-BC");
    expect(lookupCaSubdivision(48.4284, -123.3656)?.region.id).toBe("subdivision:CA-BC");
    expect(lookupCaSubdivision(44.6488, -63.5752)?.region.id).toBe("subdivision:CA-NS");
    expect(lookupCaSubdivision(47.5615, -52.7126)?.region.id).toBe("subdivision:CA-NL");
    expect(lookupCaSubdivision(46.2382, -63.1311)?.region.id).toBe("subdivision:CA-PE");
    expect(lookupCaSubdivision(43.7, -79.4)?.region.id).toBe("subdivision:CA-ON");
  });

  it("does not expand internal borders into the adjacent province", () => {
    expect(lookupCaSubdivision(54, -109.99)?.region.id).toBe("subdivision:CA-SK");
    expect(lookupCaSubdivision(54, -110.01)?.region.id).toBe("subdivision:CA-AB");
    expect(lookupCaSubdivision(53, -101.5)?.region.id).toBe("subdivision:CA-MB");
    expect(lookupCaSubdivision(53, -102.05)?.region.id).toBe("subdivision:CA-SK");
  });

  it("does not invent a Nova Scotia placement for Atlantic ocean", () => {
    expect(lookupCaSubdivision(44.65, -60)).toBeNull();
    expect(lookupCountry(44.65, -60)?.region.countryCode).not.toBe("CA");
  });

  it("does not treat a US coastal city as a Canadian subdivision", () => {
    expect(lookupUsSubdivision(44.389, -68.204)?.region.id).toBe("subdivision:US-ME");
    expect(lookupCaSubdivision(44.389, -68.204)).toBeNull();
    expect(lookupCaSubdivision(48.99, -100)).toBeNull();
    expect(lookupUsSubdivision(48.99, -100)?.region.id).toBe("subdivision:US-ND");
  });

  it("excludes points inside a hole from the parent polygon", () => {
    const exterior: [number, number][] = [
      [0, 0], [0, 10], [10, 10], [10, 0], [0, 0],
    ];
    const hole: [number, number][] = [
      [3, 3], [3, 6], [6, 6], [6, 3], [3, 3],
    ];
    expect(pointInPolygonWithHoles(5, 5, exterior, [hole])).toBe(false);
    expect(pointInPolygonWithHoles(1, 1, exterior, [hole])).toBe(true);
    expect(pointInPolygonWithHoles(20, 20, exterior, [hole])).toBe(false);
    const inside = representativePoint([{ exterior, holes: [hole] }]);
    expect(inside).not.toBeNull();
    expect(pointInPolygonWithHoles(inside!.lat, inside!.lon, exterior, [hole])).toBe(true);
  });

  it("places every Canadian subdivision sample and group anchor in that subdivision", () => {
    expect(CANADA_PROVINCES.map((province) => province.iso).sort()).toEqual(Object.keys(PROVINCE_SAMPLES).sort());
    for (const province of CANADA_PROVINCES) {
      const sample = PROVINCE_SAMPLES[province.iso]!;
      const match = lookupCaSubdivision(sample.lat, sample.lon);
      expect(match?.region.id, province.iso).toBe(`subdivision:CA-${province.iso}`);
      expect(
        lookupCaSubdivision(match!.anchor.lat, match!.anchor.lon)?.region.id,
        `${province.iso} anchor`,
      ).toBe(`subdivision:CA-${province.iso}`);
    }
  });

  it("pins an immutable Click That Hood revision and geography v3", () => {
    const generator = readFileSync("scripts/generate-canada-data.mjs", "utf8");
    const artifact = readFileSync("src/lib/data/canadaProvinces.generated.ts", "utf8");
    expect(CANADA_SOURCE_COMMIT).toBe("fb1c363b3624a256d42f00788fca96d9faf43a45");
    expect(GENERATED_COMMIT).toBe(CANADA_SOURCE_COMMIT);
    expect(generator).toContain(CANADA_SOURCE_COMMIT);
    expect(generator).not.toMatch(/click_that_hood\/master/);
    expect(generator).not.toMatch(/index % stride/);
    expect(generator).not.toMatch(/bufferRingOutward/);
    expect(generator).toContain("simplifyRingRdp");
    expect(artifact).toContain(CANADA_SOURCE_COMMIT);
    expect(artifact).toMatch(/Ramer–Douglas–Peucker/);
    expect(artifact).not.toMatch(/outward coast buffer/);
    expect(SPOT_GEOGRAPHY_VERSION).toBe("sp05-ne110-us10m-ca-v3");
    expect(CANADA_PROVINCES).toHaveLength(13);
  });
});

describe("region anchors stay inside their region", () => {
  it("validates every US state atlas anchor", () => {
    for (const state of US_STATES) {
      const anchor = representativePointFromRings(state.borders);
      expect(anchor, state.name).not.toBeNull();
      expect(lookupUsSubdivision(anchor!.lat, anchor!.lon)?.region.name, state.name).toBe(state.name);
    }
  });

  it("validates every country atlas anchor", () => {
    for (const country of WORLD_COUNTRIES) {
      const match = countryMatchFromCode(country.iso);
      expect(match?.anchor, country.iso).toBeDefined();
      expect(lookupCountry(match!.anchor.lat, match!.anchor.lon)?.region.countryCode, country.iso).toBe(country.iso);
    }
  });

  it("keeps atlas-gap anchors documented and approximate-only", () => {
    expect(countryMatchFromCode("SG")?.anchor).toEqual(ATLAS_GAP_COUNTRIES.SG.anchor);
    expect(countryMatchFromCode("SG")?.provenance).toBe("atlas-gap-prefix");
    expect(countryMatchFromCode("SG")?.region.kind).toBe("country");
    expect(countryMatchFromCode("GU")?.provenance).toBe("atlas-gap-prefix");
    expect(countryMatchFromCode("VI")?.provenance).toBe("atlas-gap-prefix");
  });
});
