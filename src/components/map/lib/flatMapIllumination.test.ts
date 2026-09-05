import { describe, expect, it } from "vitest";
import {
  nightLightIntensity,
  flatIlluminationRasterSizes,
  terminatorCoordinates,
} from "./flatMapIllumination";

describe("night lights", () => {
  it("rejects the blue terrain and ocean instead of adding artificial city glow", () => {
    expect(nightLightIntensity(10, 35, 60)).toBe(0);
    expect(nightLightIntensity(0, 0, 0)).toBe(0);
    expect(nightLightIntensity(240, 200, 100)).toBeGreaterThan(0.4);
    expect(nightLightIntensity(200, 200, 200)).toBeGreaterThan(0);
  });
});

describe("terminator geometry", () => {
  it.each([0, 0.001, 23.44, -23.44])(
    "remains perpendicular to sunlight at declination %s",
    (latitude) => {
      const longitude = 179;
      const phi = (latitude * Math.PI) / 180;
      const points = terminatorCoordinates(latitude, longitude);
      for (const point of points) {
        const lat = (point.lat * Math.PI) / 180;
        const delta = ((point.lon - longitude) * Math.PI) / 180;
        expect(
          Math.sin(phi) * Math.sin(lat) +
            Math.cos(phi) * Math.cos(lat) * Math.cos(delta),
        ).toBeCloseTo(0, 7);
      }
      expect(Math.max(...points.map((p) => p.lat))).toBeCloseTo(
        90 - Math.abs(latitude),
        2,
      );
    },
  );
});

describe("illumination raster budgets", () => {
  it("keeps small/Data Saver views well below native UHD processing", () => {
    expect(flatIlluminationRasterSizes(390, "data-saver")).toEqual({
      lights: 512,
      mask: 256,
    });
    expect(flatIlluminationRasterSizes(8000, "data-saver")).toEqual({
      lights: 1024,
      mask: 512,
    });
    expect(flatIlluminationRasterSizes(8000, "balanced")).toEqual({
      lights: 2048,
      mask: 1024,
    });
  });
  it("preserves native night texture detail at 4K and bounds Extreme zoom", () => {
    expect(flatIlluminationRasterSizes(3840, "uhd")).toEqual({
      lights: 4096,
      mask: 2048,
    });
    expect(flatIlluminationRasterSizes(50000, "extreme")).toEqual({
      lights: 4096,
      mask: 2048,
    });
  });
  it("reuses the same bucket across small viewport changes", () => {
    expect(flatIlluminationRasterSizes(1200, "uhd")).toEqual(
      flatIlluminationRasterSizes(1250, "uhd"),
    );
  });
});
