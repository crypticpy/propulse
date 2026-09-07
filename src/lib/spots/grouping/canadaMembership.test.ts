import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { CANADA_PROVINCES, CANADA_SOURCE_COMMIT as GENERATED_COMMIT } from "@/lib/data/canadaProvinces.generated";
import { CANADA_SOURCE_COMMIT, SPOT_GEOGRAPHY_VERSION } from "./version";
import { lookupCaSubdivision, lookupCountry, lookupUsSubdivision } from "./lookup";
import { pointInPolygonWithHoles } from "./pointInPolygon";

describe("Canadian provincial membership", () => {
  it("keeps populated coastlines and islands in the correct subdivision", () => {
    expect(lookupCaSubdivision(49.2827, -123.1207)?.region.id).toBe("subdivision:CA-BC");
    expect(lookupCaSubdivision(48.4284, -123.3656)?.region.id).toBe("subdivision:CA-BC");
    expect(lookupCaSubdivision(44.6488, -63.5752)?.region.id).toBe("subdivision:CA-NS");
    expect(lookupCaSubdivision(47.5615, -52.7126)?.region.id).toBe("subdivision:CA-NL");
    expect(lookupCaSubdivision(46.2382, -63.1311)?.region.id).toBe("subdivision:CA-PE");
    expect(lookupCaSubdivision(43.7, -79.4)?.region.id).toBe("subdivision:CA-ON");
  });

  it("does not invent a Nova Scotia placement for Atlantic ocean", () => {
    expect(lookupCaSubdivision(44.65, -60)).toBeNull();
    expect(lookupCountry(44.65, -60)?.region.countryCode).not.toBe("CA");
  });

  it("does not treat a US coastal city as a Canadian subdivision", () => {
    expect(lookupUsSubdivision(44.389, -68.204)?.region.id).toBe("subdivision:US-ME");
    expect(lookupCaSubdivision(44.389, -68.204)).toBeNull();
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
  });

  it("pins an immutable Click That Hood revision and geography v2", () => {
    const generator = readFileSync("scripts/generate-canada-data.mjs", "utf8");
    const artifact = readFileSync("src/lib/data/canadaProvinces.generated.ts", "utf8");
    expect(CANADA_SOURCE_COMMIT).toBe("fb1c363b3624a256d42f00788fca96d9faf43a45");
    expect(GENERATED_COMMIT).toBe(CANADA_SOURCE_COMMIT);
    expect(generator).toContain(CANADA_SOURCE_COMMIT);
    expect(generator).not.toMatch(/click_that_hood\/master/);
    expect(generator).not.toMatch(/index % stride/);
    expect(generator).toContain("simplifyRingRdp");
    expect(artifact).toContain(CANADA_SOURCE_COMMIT);
    expect(artifact).toMatch(/Ramer–Douglas–Peucker/);
    expect(SPOT_GEOGRAPHY_VERSION).toBe("sp05-ne110-us10m-ca-v2");
    expect(CANADA_PROVINCES).toHaveLength(13);
  });
});
