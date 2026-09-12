/**
 * Regression test for #1150: `drawAzimuthalBorders` and
 * `drawAzimuthalStateBorders` used to call `ctx.beginPath()` inside the
 * per-ring loop (`for (const country of WORLD_COUNTRIES) { for (const ring
 * of country.borders) { ctx.beginPath(); ... } }`) while stroking only once
 * after both loops. Each `beginPath()` discards the previously accumulated
 * subpaths, so only the last ring of the last country/state was ever
 * stroked. The fix hoists the single `ctx.beginPath()` above the outer loop
 * to match the batching `drawStateBorders` already uses on the flat map.
 *
 * Mounts the real `AzimuthalView` (same canvas-recorder + station setup as
 * `AzimuthalView.hazards.test.tsx`) with both `labelOptions.borders` and
 * `labelOptions.stateBorders` enabled, and the terminator layer left at its
 * store default (on, see `mapStore.ts`'s `layers.terminator: true`), so the
 * night-boosted border pass (`drawAzimuthalNightBoostedBorders`, which
 * redraws country/state borders a second time inside a clipped path) is
 * exercised too -- not just the config with the terminator forced off.
 *
 * For each `stroke` op in the recorded frame, groups the
 * `beginPath`/`moveTo`/`lineTo` ops since the previous `stroke` (discounting
 * a `beginPath` that is consumed by a `clip()` first -- that's the
 * night-boosted pass's own clip polygon, never stroked, not a border path)
 * and keys the resulting segments by the `lineWidth`/`strokeStyle` the code
 * sets immediately before each pass, so the base-pass and
 * night-boosted country and state batches can each be asserted
 * individually against their own observed magnitude instead of one shared
 * arbitrary floor.
 */
import { render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ViewProvider } from "@/components/views/ViewProvider";
import { createMemoryWorkingStorage } from "@/lib/views/runtime";
import { useMapStore } from "@/stores/mapStore";
import { useUserStore } from "@/stores/userStore";
import type { ReactNode } from "react";

const STATION = { lat: 0, lon: 0 };

// The spots pipeline pulls in a real fetch chain (`layers.spots` defaults
// on) -- stub it the same way `AzimuthalView.hazards.test.tsx` does, with an
// empty feed, since this test is unrelated to spots.
const expandGroup = vi.fn();
const EMPTY_FEED = {
  spots: [],
  candidateSpots: [],
  resolvedSpots: [],
  resolvedSingles: [],
  allResolvedSpots: [],
  activationSpots: [],
  clusters: [],
  singles: [],
  groupingEnabled: true,
  expandGroup,
  isLoading: false,
  isFeedReady: true,
  feedScopeKey: "test",
  listTotal: 0,
  mapBudget: 500,
  matchingCount: 0,
  mappedCount: 0,
  unlocatedCount: 0,
  budgetOmittedCount: 0,
};
vi.mock("@/hooks/useViewMapSpots", () => ({
  useViewMapSpots: () => EMPTY_FEED,
}));

interface CanvasOp {
  name: string;
  value?: number | string;
}

const ops: CanvasOp[] = [];

const STUB_RECT: DOMRect = {
  x: 0,
  y: 0,
  top: 0,
  left: 0,
  right: 600,
  bottom: 600,
  width: 600,
  height: 600,
  toJSON: () => ({}),
};

class StubResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

// Property sets whose values distinguish one stroked border pass from
// another. The base-pass and night-boosted passes both reuse
// `drawAzimuthalBorders`/`drawAzimuthalStateBorders`, so only the
// lineWidth/strokeStyle set immediately before each call tells them apart.
const TRACKED_PROPS = new Set(["lineWidth", "strokeStyle", "globalAlpha"]);

/**
 * Same recorder technique as `AzimuthalView.hazards.test.tsx`, extended to
 * also record the property sets (`lineWidth`/`strokeStyle`/`globalAlpha`)
 * and `clip()` calls that the batching test needs. Answers every
 * `getContext()` call the same way regardless of context id, so the WebGL
 * globe init path resolves harmlessly while the 2D overlay canvas we care
 * about records its real draw calls.
 */
function installCanvasRecorder() {
  ops.length = 0;
  const context = new Proxy(
    {},
    {
      get: (_target, prop: string) => {
        if (prop === "canvas") return { width: 600, height: 600 };
        return (..._args: unknown[]) => {
          ops.push({ name: prop });
          if (prop === "measureText") return { width: 10 };
          if (
            prop === "createLinearGradient" ||
            prop === "createRadialGradient"
          ) {
            return { addColorStop: () => {} };
          }
          if (prop === "getImageData")
            return { data: new Uint8ClampedArray(4) };
          return undefined;
        };
      },
      set: (_target, prop: string, value: unknown) => {
        if (TRACKED_PROPS.has(prop)) {
          ops.push({ name: `set:${prop}`, value: value as number | string });
        }
        return true;
      },
    },
  );
  HTMLCanvasElement.prototype.getContext = vi.fn(() => context) as never;
}

function Wrap({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return (
    <MemoryRouter>
      <QueryClientProvider client={client}>
        <ViewProvider
          ownerId="azimuthal-borders-test"
          slot="normal"
          storage={createMemoryWorkingStorage()}
        >
          {children}
        </ViewProvider>
      </QueryClientProvider>
    </MemoryRouter>
  );
}

// Fixed so `getSubsolarPoint` (and therefore the night-boosted pass's clip
// polygon) is deterministic. Passed directly as the `displayTime` prop, so
// no `vi.setSystemTime` is needed -- the component never reads the real
// clock for this path.
const DISPLAY_TIME = new Date("2026-09-09T12:00:00Z");

async function mount() {
  installCanvasRecorder();
  const { AzimuthalView } = await import("@/components/map/AzimuthalView");
  return render(
    <Wrap>
      <AzimuthalView displayTime={DISPLAY_TIME} />
    </Wrap>,
  );
}

interface StrokeSegment {
  lineWidth: number | undefined;
  strokeStyle: string | undefined;
  beginPathCount: number;
  moveLineCount: number;
}

/**
 * For every `stroke` op, group the `beginPath`/`moveTo`/`lineTo` ops since
 * the previous `stroke` and tag the group with whatever `lineWidth`/
 * `strokeStyle` were last set. A `beginPath` that is consumed by a `clip()`
 * before any `stroke()` belongs to the night-boosted pass's clip polygon
 * (closed with `closePath()` + `clip()`, never stroked), not to a stroked
 * border path, so it (and its move/line ops) is discarded rather than
 * carried into the next stroked segment's counts.
 */
function strokeSegments(): StrokeSegment[] {
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

/**
 * Expected stroked border passes with the terminator at its store default
 * (on) and both border layers on, keyed by the `lineWidth`/`strokeStyle`
 * `drawAzimuthalBorders`/`drawAzimuthalStateBorders` set right before each
 * call (see `AzimuthalView.tsx`). `mapStyle` resolves to "satellite" here
 * (`loadMapStyle()`'s fallback -- no `propulse-map-style` key is present in
 * this test's fresh localStorage), which is why the base-pass
 * lineWidths are the satellite branch's 0.8/0.5 rather than standard's
 * 1.0/0.7.
 *
 * `minMoveLineCount` is pinned at more than half of the observed
 * move/line-op count for that pass (observed counts noted per entry, from
 * an instrumented run against this exact station/time/config) -- comfortably
 * above the ~20-country slice a truncated loop would produce, but below the
 * real total, so a regression that keeps single-beginPath batching but
 * drops most rings (e.g. a tightened rim-distance cutoff or an early
 * `break`) still fails the count check.
 */
const EXPECTED_SEGMENTS = [
  {
    label: "base-pass country borders",
    lineWidth: 0.8,
    strokeStyle: "rgba(255, 255, 255, 0.3)",
    observedMoveLineCount: 10575,
    minMoveLineCount: 5300,
  },
  {
    label: "base-pass state borders",
    lineWidth: 0.5,
    strokeStyle: "rgba(255, 255, 255, 0.2)",
    observedMoveLineCount: 14456,
    minMoveLineCount: 7300,
  },
  {
    label: "night-boosted country borders",
    lineWidth: 1,
    strokeStyle: "rgba(255, 255, 255, 0.55)",
    observedMoveLineCount: 10575,
    minMoveLineCount: 5300,
  },
  {
    label: "night-boosted state borders",
    lineWidth: 0.7,
    strokeStyle: "rgba(255, 255, 255, 0.4)",
    observedMoveLineCount: 14456,
    minMoveLineCount: 7300,
  },
] as const;

describe("AzimuthalView border batching (#1150)", () => {
  const originalLayers = useMapStore.getState().layers;
  const originalLabelOptions = useMapStore.getState().labelOptions;

  beforeEach(() => {
    expandGroup.mockClear();
    (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver =
      StubResizeObserver;
    Element.prototype.getBoundingClientRect = () => STUB_RECT;
    useMapStore.setState({
      // Terminator stays at the store default (on) so the night-boosted
      // border pass -- what a default user actually sees -- is covered,
      // not just the country/state passes alone.
      layers: originalLayers,
      labelOptions: {
        ...originalLabelOptions,
        borders: true,
        stateBorders: true,
      },
    });
    useUserStore.getState().setStation({
      callsign: "K1ABC",
      homeLocationId: "home",
      activeLocationId: "home",
      savedLocations: [],
      grid: "AA00",
      lat: STATION.lat,
      lon: STATION.lon,
    });
  });

  afterEach(() => {
    useUserStore.getState().setStation(null);
    useMapStore.setState({
      layers: originalLayers,
      labelOptions: originalLabelOptions,
    });
  });

  it("strokes every accumulated ring for the standard and night-boosted country/state passes", async () => {
    await mount();

    const segments = strokeSegments();

    for (const expected of EXPECTED_SEGMENTS) {
      const matches = segments.filter(
        (segment) =>
          segment.lineWidth === expected.lineWidth &&
          segment.strokeStyle === expected.strokeStyle,
      );

      expect(
        matches.length,
        `expected to find ${expected.label}`,
      ).toBeGreaterThanOrEqual(1);

      for (const match of matches) {
        // One beginPath per stroked batch -- not one per ring (the
        // pre-fix bug) and not inflated by the clip polygon's beginPath.
        expect(match.beginPathCount, expected.label).toBe(1);
        expect(
          match.moveLineCount,
          `${expected.label} should have accumulated most of its ~${expected.observedMoveLineCount} rings`,
        ).toBeGreaterThan(expected.minMoveLineCount);
      }
    }
  });
});
