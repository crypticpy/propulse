import { expect, it, vi } from "vitest";
import { flatSpotPath, traceFlatSpotPath, traceFlatSpotEndpoint } from "./flatSpotPath";
it("keeps equatorial paths straight and follows a spherical plane for ordinary paths", () => {
  const equator = flatSpotPath(0, -60, 0, 60, 360, 180);
  expect(equator).toHaveLength(1);
  for (const point of equator[0])
    expect(point.y).toBeCloseTo(90, 10);
  const path = flatSpotPath(40, -74, 51, 0, 360, 180)[0];
  expect(path[0]).toEqual({ x: 106, y: 50 });
  expect(path.at(-1)).toEqual({ x: 180, y: 39 });
  const vector = (lat: number, lon: number) => { const a = lat * Math.PI / 180, b = lon * Math.PI / 180; return [Math.cos(a) * Math.cos(b), Math.cos(a) * Math.sin(b), Math.sin(a)]; };
  const a = vector(40, -74), b = vector(51, 0);
  const normal = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  for (const point of path) {
    const v = vector(90 - point.y, point.x - 180);
    expect(v.reduce((sum, n, i) => sum + n * normal[i], 0)).toBeCloseTo(0, 10);
  }
  const south = flatSpotPath(-35, -50, -35, 50, 360, 180)[0];
  expect(Math.max(...south.map(p => p.y))).toBeGreaterThan(130);
});
it.each([[20, 170, 40, -170], [40, -170, 20, 170]])("splits date-line crossings at matching map edges (%s)", (a, b, c, d) => {
  const paths = flatSpotPath(a, b, c, d, 360, 180);
  expect(paths).toHaveLength(2);
  expect(Math.abs(paths[0].at(-1)!.x - paths[1][0].x)).toBe(360);
  expect(paths[0].at(-1)!.y).toBe(paths[1][0].y);
  for (const segment of paths)
    for (let i = 1; i < segment.length; i++)
      expect(Math.abs(segment[i].x - segment[i - 1].x)).toBeLessThanOrEqual(180);
});
it.each([[0, 180, 0, -180], [30, 10, 30, 10], [0, 0, 0, 180], [90, 0, -90, 180], [20, 180, 40, -180], [89.9, -90, 89.9, 90]])("keeps degenerate/polar paths finite and on canvas (%s)", (a, b, c, d) => {
  const path = flatSpotPath(a, b, c, d, 1920, 1080);
  expect(path.length).toBeGreaterThan(0);
  for (const point of path.flat()) {
    expect(Number.isFinite(point.x) && Number.isFinite(point.y)).toBe(true);
    expect(point.x).toBeGreaterThanOrEqual(-1e-8);
    expect(point.x).toBeLessThanOrEqual(1920 + 1e-8);
    expect(point.y).toBeGreaterThanOrEqual(-1e-8);
    expect(point.y).toBeLessThanOrEqual(1080 + 1e-8);
  }
});
it("rejects invalid coordinates and bounds its immutable geometry cache", () => {
  expect(flatSpotPath(NaN, 0, 0, 0, 360, 180)).toEqual([]);
  expect(flatSpotPath(91, 0, 0, 0, 360, 180)).toEqual([]);
  expect(flatSpotPath(0, 0, 0, 0, 0, 180)).toEqual([]);
  const initial = flatSpotPath(10, 12, 30, 40, 360, 180);
  expect(flatSpotPath(10, 12, 30, 40, 360, 180)).toBe(initial);
  expect(Object.isFrozen(initial[0][0])).toBe(true);
  for (let i = 0; i < 520; i++)
    flatSpotPath(20, -170 + i * 0.5, 30, 40, 360, 180);
  expect(flatSpotPath(10, 12, 30, 40, 360, 180)).not.toBe(initial);
});
it("traces separate geodesic segments and uses circle=TX, square=RX", () => {
  const ctx = { beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), arc: vi.fn(), rect: vi.fn() };
  const path = flatSpotPath(20, 170, 40, -170, 360, 180);
  traceFlatSpotPath(ctx, path);
  expect(ctx.moveTo).toHaveBeenCalledTimes(2);
  expect(ctx.lineTo).toHaveBeenCalledTimes(path.flat().length - 2);
  traceFlatSpotEndpoint(ctx, 20, 30, 4, "rx");
  expect(ctx.rect).toHaveBeenCalledWith(16, 26, 8, 8);
  expect(ctx.arc).not.toHaveBeenCalled();
  traceFlatSpotEndpoint(ctx, 20, 30, 4, "tx");
  expect(ctx.arc).toHaveBeenCalledWith(20, 30, 4, 0, Math.PI * 2);
});
