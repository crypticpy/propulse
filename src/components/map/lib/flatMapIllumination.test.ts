import { describe, expect, it } from "vitest";
import {
  nightLightIntensity,
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
