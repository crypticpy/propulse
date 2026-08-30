import { describe, expect, it } from "vitest";

import { continentForLatLon } from "./continent";

describe("continentForLatLon", () => {
  it("classifies clear-cut locations", () => {
    expect(continentForLatLon(30.27, -97.74)).toBe("NA"); // Austin
    expect(continentForLatLon(64.2, -51.7)).toBe("NA"); // Nuuk, Greenland
    expect(continentForLatLon(-23.55, -46.63)).toBe("SA"); // São Paulo
    expect(continentForLatLon(10.65, -61.5)).toBe("SA"); // Trinidad
    expect(continentForLatLon(51.5, -0.13)).toBe("EU"); // London
    expect(continentForLatLon(55.75, 37.62)).toBe("EU"); // Moscow
    expect(continentForLatLon(-33.9, 18.42)).toBe("AF"); // Cape Town
    expect(continentForLatLon(35.68, 139.69)).toBe("AS"); // Tokyo
    expect(continentForLatLon(28.6, 77.2)).toBe("AS"); // Delhi
    expect(continentForLatLon(-33.87, 151.21)).toBe("OC"); // Sydney
    expect(continentForLatLon(-90, 0)).toBe("AN"); // South Pole
  });

  it("classifies Hawaii as OC before the Americas box (DXCC)", () => {
    expect(continentForLatLon(21.31, -157.86)).toBe("OC"); // Honolulu
  });

  it("splits Central America at 13°N / 82°W", () => {
    expect(continentForLatLon(9.93, -84.08)).toBe("NA"); // San José, CR
    // Documented miss: Panama sits east of the split and reads SA.
    expect(continentForLatLon(8.98, -79.52)).toBe("SA");
  });

  it("returns null for non-finite or out-of-range coordinates", () => {
    expect(continentForLatLon(Number.NaN, 0)).toBeNull();
    expect(continentForLatLon(0, Number.POSITIVE_INFINITY)).toBeNull();
    expect(continentForLatLon(91, 0)).toBeNull();
    expect(continentForLatLon(0, -181)).toBeNull();
  });
});
