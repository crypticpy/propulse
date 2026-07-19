import { describe, expect, it } from "vitest";
import { azimuthalProject, azimuthalUnproject } from "./azimuthal";

describe("azimuthal projection roundtrip", () => {
  const centers: Array<[number, number]> = [
    [25, -80],
    [51.5, 0],
    [-33.9, 151.2],
  ];
  const points: Array<[number, number]> = [
    [30, -70],
    [50, 10],
    [0, 100],
    [-20.76, 109.99],
    [40, -100],
    [-60, -45],
  ];

  it("unprojects projected points back to their coordinates", () => {
    for (const [centerLat, centerLon] of centers) {
      for (const [lat, lon] of points) {
        const projected = azimuthalProject(lat, lon, centerLat, centerLon);
        const back = azimuthalUnproject(
          projected.x,
          projected.y,
          centerLat,
          centerLon,
        );
        expect(back.lat).toBeCloseTo(lat, 4);
        expect(back.lon).toBeCloseTo(lon, 4);
      }
    }
  });

  it("maps the disk center to the QTH", () => {
    const back = azimuthalUnproject(0, 0, 25, -80);
    expect(back.lat).toBe(25);
    expect(back.lon).toBe(-80);
  });
});
