import { describe, expect, it } from "vitest";
import {
  getGlobeNavigationTuning,
  getMinimumGlobeDistance,
} from "@/lib/map/globeNavigation";

describe("globe navigation", () => {
  it("allows higher-resolution providers to move closer to the surface", () => {
    const streetDistance = getMinimumGlobeDistance({
      maxZoom: 19,
      tileSize: 256,
      viewportHeight: 1080,
      fieldOfView: 45,
    });
    const hdSatelliteDistance = getMinimumGlobeDistance({
      maxZoom: 22,
      tileSize: 512,
      viewportHeight: 1080,
      fieldOfView: 45,
    });

    expect(streetDistance).toBeGreaterThan(1);
    expect(hdSatelliteDistance).toBeGreaterThan(1);
    expect(hdSatelliteDistance - 1).toBeLessThan(
      (streetDistance - 1) / 10,
    );
  });

  it("reduces zoom and rotation sensitivity near the surface", () => {
    const minimumDistance = 1.00001;
    const orbital = getGlobeNavigationTuning(2.5, minimumDistance);
    const local = getGlobeNavigationTuning(1.0001, minimumDistance);

    expect(local.zoomSpeed).toBeLessThan(orbital.zoomSpeed / 100);
    expect(local.rotateSpeed).toBeLessThan(orbital.rotateSpeed / 100);
    expect(local.rotateSpeed).toBeCloseTo(0.000025, 7);
    expect(local.autoRotateScale).toBeLessThan(orbital.autoRotateScale / 100);
    expect(local.near).toBeLessThan(orbital.near);
  });

  it("keeps tuning finite at the provider limit", () => {
    const tuning = getGlobeNavigationTuning(1, 1.000001);

    expect(tuning.zoomSpeed).toBeGreaterThan(0);
    expect(tuning.rotateSpeed).toBeGreaterThan(0);
    expect(tuning.near).toBeGreaterThan(0);
  });
});
