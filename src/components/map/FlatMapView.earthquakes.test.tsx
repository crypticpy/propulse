/**
 * Binding test for the flat map's earthquakes call site (#1091 PR 3).
 *
 * `earthquakesLayer.test.ts` drives `drawEarthquakesLayer` directly with a
 * fake `Projection` and an explicit `MapLayerProfile`, so it cannot see
 * which profile `FlatMapView` actually passes at its `drawEarthquakesLayer`
 * call site. This test mounts the real component (same jsdom canvas-recorder
 * harness as `FlatMapView.grouping.test.tsx` / `FlatMapView.fires.test.tsx`)
 * with one quake at a known magnitude, and pins the resulting core-arc
 * radius to the value `FLAT_LAYER_PROFILE` produces. Swapping in
 * `AZIMUTHAL_LAYER_PROFILE` at that call site (or changing its
 * `pxPerMagnitude`) changes the radius and fails this test.
 */
import { render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ViewProvider } from "@/components/views/ViewProvider";
import { createMemoryWorkingStorage } from "@/lib/views/runtime";
import { useMapStore } from "@/stores/mapStore";
import type { EarthquakeEvent } from "@/lib/api/earthquakes";

// The spots pipeline is unrelated to this test and pulls in a real fetch
// chain (`layers.spots` defaults on) -- stub it the same way
// `FlatMapView.grouping.test.tsx` does, but with an empty feed.
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

// (magnitude 6 - baseline 1) * FLAT_LAYER_PROFILE.quakes.pxPerMagnitude (3) =
// 15, within [3, 20]. Under AZIMUTHAL_LAYER_PROFILE (pxPerMagnitude 2.5) the
// same quake would draw a 12.5px core instead -- that divergence is exactly
// what this test binds against.
const QUAKE: EarthquakeEvent = {
  id: "test-quake",
  lat: -15,
  lon: 100,
  depth: 10,
  magnitude: 6,
  place: "Test Region",
  time: 0,
};
vi.mock("@/hooks/useEarthquakes", () => ({
  useEarthquakes: () => ({
    earthquakes: [QUAKE],
    isLoading: false,
    error: null,
  }),
}));

interface CanvasOp {
  name: string;
  args: number[];
}

const ops: CanvasOp[] = [];

const STUB_RECT: DOMRect = {
  x: 0,
  y: 0,
  top: 0,
  left: 0,
  right: 1024,
  bottom: 512,
  width: 1024,
  height: 512,
  toJSON: () => ({}),
};

class StubResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

function installCanvasRecorder() {
  ops.length = 0;
  const context = new Proxy(
    {},
    {
      get: (_target, prop: string) => {
        if (prop === "canvas") return { width: 1024, height: 512 };
        return (...args: unknown[]) => {
          ops.push({ name: prop, args: args.map(Number) });
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
      set: () => true,
    },
  );
  HTMLCanvasElement.prototype.getContext = vi.fn(() => context) as never;
}

/** Same equirectangular mapping `FlatMapView.latLonToCanvas` uses at the
 * default 1024x512 map box. */
function toCanvas(lat: number, lon: number) {
  return { x: ((lon + 180) / 360) * 1024, y: ((90 - lat) / 180) * 512 };
}

async function mount() {
  installCanvasRecorder();
  const { FlatMapView } = await import("@/components/map/FlatMapView");
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <ViewProvider
        ownerId="flat-earthquakes-test"
        slot="normal"
        storage={createMemoryWorkingStorage()}
      >
        <FlatMapView displayTime={new Date("2026-09-09T12:00:00Z")} />
      </ViewProvider>
    </QueryClientProvider>,
  );
}

describe("FlatMapView earthquakes layer binding", () => {
  const originalLayers = useMapStore.getState().layers;

  beforeEach(() => {
    expandGroup.mockClear();
    (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver =
      StubResizeObserver;
    Element.prototype.getBoundingClientRect = () => STUB_RECT;
    useMapStore.setState({ layers: { ...originalLayers, earthquakes: true } });
  });

  it("draws the quake's core arc at the FLAT profile's radius", async () => {
    await mount();

    const point = toCanvas(QUAKE.lat, QUAKE.lon);
    const arcsAtPoint = ops.filter(
      (op) =>
        op.name === "arc" &&
        Math.hypot(op.args[0] - point.x, op.args[1] - point.y) < 1,
    );
    expect(arcsAtPoint.length).toBeGreaterThan(0);

    // The core arc is the smaller of the glow/core pair (glow = core * 2);
    // FLAT_LAYER_PROFILE puts it at exactly 15px for this quake's magnitude.
    const coreRadius = Math.min(...arcsAtPoint.map((op) => op.args[2]));
    expect(coreRadius).toBe(15);
  });
});
