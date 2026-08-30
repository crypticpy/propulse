import { describe, expect, it } from "vitest";
import * as THREE from "three";

import {
  latLonToVector3,
  qthCameraPosition,
} from "./globeCoords";

const EARTH_TILT_DEG = 23.5;

describe("qthCameraPosition", () => {
  it("matches latLonToVector3 when the tilt is zero", () => {
    const plain = latLonToVector3(39.7, -105.1, 2.5);
    const cam = qthCameraPosition(39.7, -105.1, 2.5, 0);
    expect(cam.distanceTo(plain)).toBeLessThan(1e-12);
  });

  it("preserves the requested camera distance under tilt", () => {
    const cam = qthCameraPosition(39.7, -105.1, 2.5, EARTH_TILT_DEG);
    expect(cam.length()).toBeCloseTo(2.5, 10);
  });

  it("centers the tilted surface point: camera direction equals the world-space QTH normal", () => {
    // The globe content lives in a group rotated by Euler(0, 0, tilt).
    // The camera looks at the origin, so the QTH is screen-centered iff
    // the camera position is colinear with the QTH's world-space position.
    const lat = 39.7;
    const lon = -105.1;
    const surfaceLocal = latLonToVector3(lat, lon, 1);
    const surfaceWorld = surfaceLocal
      .clone()
      .applyEuler(new THREE.Euler(0, 0, (EARTH_TILT_DEG * Math.PI) / 180));

    const cam = qthCameraPosition(lat, lon, 2.5, EARTH_TILT_DEG).normalize();
    expect(cam.distanceTo(surfaceWorld.normalize())).toBeLessThan(1e-12);
  });

  it("handles southern-hemisphere and antimeridian coordinates", () => {
    for (const [lat, lon] of [
      [-33.9, 151.2],
      [-17, 179.9],
      [51.5, -0.1],
      [0, 0],
    ]) {
      const cam = qthCameraPosition(lat, lon, 3, EARTH_TILT_DEG);
      expect(cam.length()).toBeCloseTo(3, 10);
      expect(Number.isFinite(cam.x + cam.y + cam.z)).toBe(true);
    }
  });
});
