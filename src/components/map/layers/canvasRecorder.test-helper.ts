/**
 * canvasRecorder.test-helper -- shared jsdom canvas-recording harness for
 * component-mount tests that assert on the sequence of 2D canvas draw
 * calls (path ops, arcs, text, and tracked property sets).
 *
 * Extracted from the near-identical `installCanvasRecorder`/`STUB_RECT`/
 * `StubResizeObserver` trio duplicated across
 * `AzimuthalView.hazards.test.tsx`, `AzimuthalView.borders.test.tsx` and
 * the flat map's binding tests (#1091 PR 6). No `src/components/map` test
 * helper module existed before this one, so it lives alongside the layer
 * modules it verifies rather than under a generic `src/test/` path.
 *
 * Every recorded op is `{ name, args, strArgs }` for a method call (`args`
 * is `Number(arg)` for each argument, `strArgs` the raw arguments, matching
 * `AzimuthalView.hazards.test.tsx`'s recorder), or `{ name: "set:<prop>",
 * value }` for a property SET on a name in `trackedProps` (matching
 * `AzimuthalView.borders.test.tsx`'s recorder, used to key stroked segments
 * by the `lineWidth`/`strokeStyle` set immediately before each pass).
 *
 * This file is only imported by the tests this PR touches
 * (`FlatMapView.borders.test.tsx`); the three duplicated copies above are
 * left as-is rather than migrated, since none of them needed a code change
 * for this PR.
 */
import { vi } from "vitest";

export interface CanvasOp {
  name: string;
  args: number[];
  strArgs: unknown[];
  value?: number | string;
}

export function createCanvasRecorder(options: {
  width: number;
  height: number;
  trackedProps?: Set<string>;
}) {
  const { width, height, trackedProps = new Set<string>() } = options;
  const ops: CanvasOp[] = [];

  function installCanvasRecorder() {
    ops.length = 0;
    const context = new Proxy(
      {},
      {
        get: (_target, prop: string) => {
          if (prop === "canvas") return { width, height };
          return (...args: unknown[]) => {
            ops.push({ name: prop, args: args.map(Number), strArgs: args });
            if (prop === "measureText") return { width: 10 };
            if (
              prop === "createLinearGradient" ||
              prop === "createRadialGradient"
            ) {
              return { addColorStop: () => {} };
            }
            if (prop === "getImageData")
              return { data: new Uint8ClampedArray(4) };
            if (prop === "createImageData") {
              const [w, h] = args as number[];
              return {
                data: new Uint8ClampedArray(Math.max(0, w * h * 4)),
                width: w,
                height: h,
              };
            }
            return undefined;
          };
        },
        set: (_target, prop: string, value: unknown) => {
          if (trackedProps.has(prop)) {
            ops.push({
              name: `set:${prop}`,
              args: [],
              strArgs: [],
              value: value as number | string,
            });
          }
          return true;
        },
      },
    );
    HTMLCanvasElement.prototype.getContext = vi.fn(() => context) as never;
  }

  return { ops, installCanvasRecorder };
}

export function makeStubRect(width: number, height: number): DOMRect {
  return {
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    right: width,
    bottom: height,
    width,
    height,
    toJSON: () => ({}),
  };
}

export class StubResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

export interface StrokeSegment {
  lineWidth: number | undefined;
  strokeStyle: string | undefined;
  beginPathCount: number;
  moveLineCount: number;
}

/**
 * For every `stroke` op, group the `beginPath`/`moveTo`/`lineTo` ops since
 * the previous `stroke` and tag the group with whatever `lineWidth`/
 * `strokeStyle` were last set. A `beginPath` that is consumed by a `clip()`
 * before any `stroke()` belongs to a clip polygon (never stroked), so it
 * (and its move/line ops) is discarded rather than carried into the next
 * stroked segment's counts. Requires `lineWidth`/`strokeStyle` in the
 * recorder's `trackedProps`. Verbatim from `AzimuthalView.borders.test.tsx`
 * (#1150), generalized to take the ops array as a parameter.
 */
export function groupStrokeSegments(ops: CanvasOp[]): StrokeSegment[] {
  const segments: StrokeSegment[] = [];
  let beginPathCount = 0;
  let moveLineCount = 0;
  let lineWidth: number | undefined;
  let strokeStyle: string | undefined;
  for (const op of ops) {
    if (op.name === "set:lineWidth") {
      lineWidth = op.value as number;
    } else if (op.name === "set:strokeStyle") {
      strokeStyle = op.value as string;
    } else if (op.name === "beginPath") {
      beginPathCount++;
      moveLineCount = 0;
    } else if (op.name === "moveTo" || op.name === "lineTo") {
      moveLineCount++;
    } else if (op.name === "clip") {
      beginPathCount = 0;
      moveLineCount = 0;
    } else if (op.name === "stroke") {
      segments.push({ lineWidth, strokeStyle, beginPathCount, moveLineCount });
      beginPathCount = 0;
    }
  }
  return segments;
}
