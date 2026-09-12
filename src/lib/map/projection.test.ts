import { describe, expect, it } from "vitest";
import {
  createAzimuthalProjection,
  createEquirectangularProjection,
  screenPxToCanvas,
} from "./projection";

describe("screenPxToCanvas", () => {
  it("matches createEquirectangularProjection().screenPx when zoomScale >= 1", () => {
    const projection = createEquirectangularProjection({
      width: 1024,
      height: 512,
      zoomScale: 8,
    });
    expect(screenPxToCanvas(12, 8)).toBe(projection.screenPx(12));
  });
});

describe("createEquirectangularProjection", () => {
  const projection = createEquirectangularProjection({
    width: 1024,
    height: 512,
    zoomScale: 1,
  });

  it("projects the four corners and the center like the flat map's latLonToCanvas", () => {
    expect(projection.project(0, 0)).toEqual({
      x: 512,
      y: 256,
      visible: true,
    });
    expect(projection.project(45, -90)).toEqual({
      x: 256,
      y: 128,
      visible: true,
    });
    expect(projection.project(90, -180)).toEqual({
      x: 0,
      y: 0,
      visible: true,
    });
    expect(projection.project(-90, 180)).toEqual({
      x: 1024,
      y: 512,
      visible: true,
    });
  });

  it("reports its kind and wrapWidth", () => {
    expect(projection.kind).toBe("equirectangular");
    expect(projection.wrapWidth).toBe(1024);
  });

  it("reports wrapHeight and an undefined discRadiusPx", () => {
    expect(projection.wrapHeight).toBe(512);
    expect(projection.discRadiusPx).toBeUndefined();
  });

  it("damps screenPx by max(1, zoomScale)", () => {
    const zoomedIn = createEquirectangularProjection({
      width: 1024,
      height: 512,
      zoomScale: 4,
    });
    expect(zoomedIn.screenPx(8)).toBe(2);

    const zoomedOut = createEquirectangularProjection({
      width: 1024,
      height: 512,
      zoomScale: 0.5,
    });
    expect(zoomedOut.screenPx(8)).toBe(8);
  });

  it("keeps pxPerKm constant across latitude and stretch isotropic at the equator", () => {
    const at0 = projection.scaleAt(0, 0);
    const at45 = projection.scaleAt(45, 0);
    const at80 = projection.scaleAt(80, 0);
    expect(at0.pxPerKm).toBeCloseTo(0.0255807, 6);
    expect(at45.pxPerKm).toBeCloseTo(at0.pxPerKm, 10);
    expect(at80.pxPerKm).toBeCloseTo(at0.pxPerKm, 10);
    expect(at0.stretch).toBeCloseTo(1, 6);
  });

  it("stretches by 1/cos(lat) away from the equator", () => {
    expect(projection.scaleAt(60, 0).stretch).toBeCloseTo(2, 6);
  });

  it("carries the aspect ratio into stretch at the equator for non-2:1 canvases", () => {
    const wide = createEquirectangularProjection({
      width: 900,
      height: 300,
      zoomScale: 1,
    });
    expect(wide.scaleAt(0, 0).stretch).toBeCloseTo(1.5, 6);
  });
});

describe("createAzimuthalProjection", () => {
  const opts = {
    centerLat: 0,
    centerLon: 0,
    centerX: 300,
    centerY: 300,
    radius: 260,
    zoomScale: 1,
    zoomDamp: 1,
  };
  const projection = createAzimuthalProjection(opts);

  it("projects the center point onto the canvas center", () => {
    expect(projection.project(0, 0)).toEqual({
      x: 300,
      y: 300,
      visible: true,
      rim: 0,
    });
  });

  it("projects a quarter-turn point like the azimuthal disc's projToCanvas", () => {
    const point = projection.project(0, 90);
    expect(point.x).toBeCloseTo(430, 9);
    expect(point.y).toBeCloseTo(300, 9);
    expect(point.visible).toBe(true);
  });

  it("places the antipode on the disc edge and marks it visible", () => {
    const point = projection.project(0, 180);
    expect(point.x).toBeCloseTo(300, 9);
    expect(point.y).toBeCloseTo(560, 9);
    expect(point.visible).toBe(true);
  });

  it("keeps a coarse lat/lon grid within the disc radius (plus float epsilon)", () => {
    for (let lat = -80; lat <= 80; lat += 20) {
      for (let lon = -180; lon <= 180; lon += 30) {
        const point = projection.project(lat, lon);
        const distFromCenter = Math.hypot(
          point.x - opts.centerX,
          point.y - opts.centerY,
        );
        expect(distFromCenter).toBeLessThanOrEqual(opts.radius + 1e-6);
        expect(point.visible).toBe(true);
      }
    }
  });

  it("reports its kind and an undefined wrapWidth", () => {
    expect(projection.kind).toBe("azimuthal");
    expect(projection.wrapWidth).toBeUndefined();
  });

  it("reports discRadiusPx and an undefined wrapHeight", () => {
    expect(projection.discRadiusPx).toBe(260);
    expect(projection.wrapHeight).toBeUndefined();
  });

  it("reports rim as the normalised centre distance, 0.5 for the quarter-turn point and 1 at the antipode", () => {
    expect(projection.project(0, 0).rim).toBe(0);
    expect(projection.project(0, 90).rim).toBeCloseTo(0.5, 9);
    expect(projection.project(0, 180).rim).toBeCloseTo(1, 9);
  });

  it("scaleAt returns the constant radial pxPerKm and isotropic stretch at the center", () => {
    const at0 = projection.scaleAt(0, 0);
    expect(at0.pxPerKm).toBeCloseTo(0.01299, 5);
    expect(at0.stretch).toBeCloseTo(1, 5);
  });

  it("scaleAt returns the same pxPerKm and the k = c/sin(c) stretch off-center", () => {
    const at120 = projection.scaleAt(0, 120);
    expect(at120.pxPerKm).toBeCloseTo(0.01299, 5);
    expect(at120.stretch).toBeCloseTo(2.4184, 4);
  });

  it("stretch stays finite and > 1 at the antipode", () => {
    const antipode = projection.scaleAt(0, 180);
    expect(Number.isFinite(antipode.stretch)).toBe(true);
    expect(antipode.stretch).toBeGreaterThan(1);
  });

  it("damps screenPx by the explicit zoomDamp, independent of zoomScale", () => {
    const noDamp = createAzimuthalProjection({ ...opts, zoomDamp: 1 });
    const halfDamp = createAzimuthalProjection({ ...opts, zoomDamp: 2 });
    expect(noDamp.screenPx(8)).toBe(8);
    expect(halfDamp.screenPx(8)).toBe(4);
  });
});
