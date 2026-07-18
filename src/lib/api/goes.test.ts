import { describe, expect, it } from "vitest";
import {
  getGIBSTileUrl,
  getLatestGIBSDate,
  GOES_EAST_Z2_TILE_LIMITS,
} from "./goes";

describe("NASA GIBS GOES tile contract", () => {
  it("uses the supported Level6 matrix and latest subdaily slot", () => {
    expect(getGIBSTileUrl()).toBe(
      "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/GOES-East_ABI_Band13_Clean_Infrared/default/default/GoogleMapsCompatible_Level6/{z}/{y}/{x}.png",
    );
    expect(getLatestGIBSDate()).toBe("default");
  });

  it("honors the GOES-East matrix coverage instead of requesting 404 tiles", () => {
    const width =
      GOES_EAST_Z2_TILE_LIMITS.maxX -
      GOES_EAST_Z2_TILE_LIMITS.minX +
      1;
    const height =
      GOES_EAST_Z2_TILE_LIMITS.maxY -
      GOES_EAST_Z2_TILE_LIMITS.minY +
      1;
    expect(width * height).toBe(12);
  });

  it("accepts an exact GIBS timestamp for historical rendering", () => {
    expect(getGIBSTileUrl(undefined, "2026-07-18T21:20:00Z")).toContain(
      "/2026-07-18T21:20:00Z/GoogleMapsCompatible_Level6/",
    );
  });
});
