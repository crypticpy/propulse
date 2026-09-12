import { describe, expect, it, vi } from "vitest";

import { addWrappedRingPath, getStandardMapCanvas } from "./standardMap";

describe("getStandardMapCanvas cache", () => {
  it("does not invalidate a canvas still held by an active consumer", () => {
    const getContext = vi
      .spyOn(HTMLCanvasElement.prototype, "getContext")
      .mockReturnValue(null);
    const retained = getStandardMapCanvas(37, 19, "light");
    getStandardMapCanvas(38, 19, "dark");
    getStandardMapCanvas(39, 19, "midnight");

    expect(retained.width).toBe(37);
    expect(retained.height).toBe(19);
    getContext.mockRestore();
  });
});

// ─── addWrappedRingPath ─────────────────────────────────────────────────────

type RecordedCall =
  | { type: "moveTo"; x: number; y: number }
  | { type: "lineTo"; x: number; y: number }
  | { type: "closePath" };

/** A fake 2D context that just records the path calls the function makes. */
function createRecordingCtx() {
  const calls: RecordedCall[] = [];
  const ctx = {
    moveTo: vi.fn((x: number, y: number) => {
      calls.push({ type: "moveTo", x, y });
    }),
    lineTo: vi.fn((x: number, y: number) => {
      calls.push({ type: "lineTo", x, y });
    }),
    closePath: vi.fn(() => {
      calls.push({ type: "closePath" });
    }),
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls };
}

/** Split the flat call list into per-subpath x/y point lists (one per moveTo). */
function toSubpaths(
  calls: RecordedCall[],
): Array<Array<{ x: number; y: number }>> {
  const subpaths: Array<Array<{ x: number; y: number }>> = [];
  for (const call of calls) {
    if (call.type === "moveTo") {
      subpaths.push([{ x: call.x, y: call.y }]);
    } else if (call.type === "lineTo") {
      subpaths[subpaths.length - 1].push({ x: call.x, y: call.y });
    }
  }
  return subpaths;
}

describe("addWrappedRingPath", () => {
  const width = 360;
  const height = 180;

  it("draws a single copy, shifted by longitude, for a ring that does not cross the anti-meridian", () => {
    const { ctx, calls } = createRecordingCtx();
    // A small square: lon 10..20, lat 10..20 (nowhere near +/-180).
    const ring: [number, number][] = [
      [10, 10],
      [10, 20],
      [20, 20],
      [20, 10],
    ];

    addWrappedRingPath(ctx, ring, width, height);

    // Only the offset-0 copy overlaps the canvas, so exactly one subpath.
    expect(ctx.moveTo).toHaveBeenCalledTimes(1);
    expect(ctx.closePath).toHaveBeenCalledTimes(1);

    const [subpath] = toSubpaths(calls);
    // x = (lon + 180) / 360 * width, y = (90 - lat) / 180 * height.
    expect(subpath).toEqual([
      { x: 190, y: 80 },
      { x: 200, y: 80 },
      { x: 200, y: 70 },
      { x: 190, y: 70 },
    ]);
  });

  it("unwraps a ring crossing the anti-meridian and draws its wrapped copies", () => {
    const { ctx, calls } = createRecordingCtx();
    // A thin strip straddling the date line: lon 170 -> -170 -> -170 -> 170.
    const ring: [number, number][] = [
      [0, 170],
      [0, -170],
      [10, -170],
      [10, 170],
    ];

    addWrappedRingPath(ctx, ring, width, height);

    // Two of the three candidate offsets overlap the canvas for this ring;
    // reducing the offset list to just [0] would drop the wrapped copy and
    // leave only one moveTo/closePath pair.
    expect(ctx.moveTo).toHaveBeenCalledTimes(2);
    expect(ctx.closePath).toHaveBeenCalledTimes(2);

    const subpaths = toSubpaths(calls);
    expect(subpaths).toEqual([
      [
        { x: -10, y: 90 },
        { x: 10, y: 90 },
        { x: 10, y: 80 },
        { x: -10, y: 80 },
      ],
      [
        { x: 350, y: 90 },
        { x: 370, y: 90 },
        { x: 370, y: 80 },
        { x: 350, y: 80 },
      ],
    ]);

    // Unwrapping keeps consecutive points close together; without it the
    // raw longitudes (170, -170) would produce a ~340-unit jump across the
    // canvas instead of the ~20-unit steps below.
    for (const subpath of subpaths) {
      for (let i = 1; i < subpath.length; i++) {
        expect(Math.abs(subpath[i].x - subpath[i - 1].x)).toBeLessThan(
          width / 2,
        );
      }
    }
  });
});
