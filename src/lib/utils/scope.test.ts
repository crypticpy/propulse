import { describe, expect, it } from "vitest";

import {
  greatCircleKm,
  initialBearingDeg,
  projectToScope,
} from "./scope";

// Austin, TX as the reference QTH
const QTH = { lat: 30.27, lon: -97.74 };

describe("greatCircleKm", () => {
  it("is zero for identical points", () => {
    expect(greatCircleKm(QTH.lat, QTH.lon, QTH.lat, QTH.lon)).toBe(0);
  });

  it("measures one degree of latitude as ~111 km", () => {
    const d = greatCircleKm(QTH.lat, QTH.lon, QTH.lat + 1, QTH.lon);
    expect(d).toBeGreaterThan(110);
    expect(d).toBeLessThan(112.5);
  });

  it("shrinks a degree of longitude by cos(latitude)", () => {
    const d = greatCircleKm(60, 0, 60, 1);
    expect(d).toBeGreaterThan(54);
    expect(d).toBeLessThan(57);
  });
});

describe("initialBearingDeg", () => {
  it("points north for a due-north target", () => {
    expect(
      initialBearingDeg(QTH.lat, QTH.lon, QTH.lat + 1, QTH.lon),
    ).toBeCloseTo(0, 5);
  });

  it("points south for a due-south target", () => {
    expect(
      initialBearingDeg(QTH.lat, QTH.lon, QTH.lat - 1, QTH.lon),
    ).toBeCloseTo(180, 5);
  });

  it("points roughly east and west along a parallel", () => {
    const east = initialBearingDeg(QTH.lat, QTH.lon, QTH.lat, QTH.lon + 1);
    const west = initialBearingDeg(QTH.lat, QTH.lon, QTH.lat, QTH.lon - 1);
    expect(east).toBeGreaterThan(89);
    expect(east).toBeLessThan(91);
    expect(west).toBeGreaterThan(269);
    expect(west).toBeLessThan(271);
  });
});

describe("projectToScope", () => {
  it("returns null beyond the scope range", () => {
    expect(
      projectToScope(QTH.lat, QTH.lon, QTH.lat + 3, QTH.lon, 100),
    ).toBeNull();
  });

  it("puts a northern point straight up at the right radius", () => {
    const blip = projectToScope(QTH.lat, QTH.lon, QTH.lat + 0.45, QTH.lon, 100);
    expect(blip).not.toBeNull();
    expect(blip!.x).toBeCloseTo(0, 5);
    expect(blip!.y).toBeCloseTo(-blip!.distanceKm / 100, 5);
    expect(blip!.distanceKm).toBeGreaterThan(49);
    expect(blip!.distanceKm).toBeLessThan(51);
  });

  it("puts an eastern point on the +x axis (canvas convention)", () => {
    const blip = projectToScope(QTH.lat, QTH.lon, QTH.lat, QTH.lon + 0.5, 100);
    expect(blip).not.toBeNull();
    expect(blip!.x).toBeGreaterThan(0);
    expect(Math.abs(blip!.y)).toBeLessThan(0.01);
  });

  it("keeps the QTH itself at the origin", () => {
    const blip = projectToScope(QTH.lat, QTH.lon, QTH.lat, QTH.lon, 100);
    expect(blip).toEqual({ x: 0, y: -0, distanceKm: 0, bearingDeg: 0 });
  });
});
