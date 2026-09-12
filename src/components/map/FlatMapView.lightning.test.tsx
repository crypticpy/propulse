/**
 * Binding test for the flat map's lightning call site (#1091 PR 5).
 *
 * `lightningLayer.test.ts` drives `drawLightningLayer` directly with a fake
 * `Projection`, so it cannot see which `Projection` instance `FlatMapView`
 * actually passes at its `drawLightningLayer` call site, nor whether the
 * `layers.lightning` toggle still gates the draw. This test mounts the real
 * component (same jsdom canvas-recorder harness as
 * `FlatMapView.earthquakes.test.tsx`) with one 100 kA strike, and pins the
 * resulting core-arc radius to 1.5px (intensity 0.5 * core scale 3, run
 * through the flat map's live zoom -- at the default zoomScale of 1 the
 * zoomDamp floor of 1 makes `screenPx` identity). It also asserts the draw
 * is skipped entirely when `layers.lightning` is false.
 */
import { render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ViewProvider } from "@/components/views/ViewProvider";
import { createMemoryWorkingStorage } from "@/lib/views/runtime";
import { useMapStore } from "@/stores/mapStore";
import {
  createCanvasRecorder,
  makeStubRect,
  StubResizeObserver,
} from "@/components/map/layers/canvasRecorder.test-helper";
import type { LightningStrike } from "@/lib/api/lightning";

// The spots pipeline is unrelated to this test and pulls in a real fetch
// chain (`layers.spots` defaults on) -- stub it the same way
// `FlatMapView.earthquakes.test.tsx` does, but with an empty feed.
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

// The map shell also reads logbook data; keep that unrelated async read
// inside this fixture's lifetime instead of starting real IndexedDB work.
vi.mock("@/lib/db/logStore", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/db/logStore")>()),
  getAllLogEntries: vi.fn(async () => []),
}));

// intensity = max(0.3, min(1, 100/200)) = 0.5; core radius = 3 * 0.5 = 1.5.
const STRIKE: LightningStrike = {
  lat: -15,
  lon: 100,
  time: Date.now(),
  currentKA: 100,
};
vi.mock("@/hooks/useLightning", () => ({
  useLightning: () => ({ strikes: [STRIKE], isLoading: false, error: null }),
}));

const STUB_RECT = makeStubRect(1024, 512);
const { ops, installCanvasRecorder } = createCanvasRecorder({
  width: 1024,
  height: 512,
});

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
        ownerId="flat-lightning-test"
        slot="normal"
        storage={createMemoryWorkingStorage()}
      >
        <FlatMapView displayTime={new Date("2026-09-09T12:00:00Z")} />
      </ViewProvider>
    </QueryClientProvider>,
  );
}

describe("FlatMapView lightning layer binding", () => {
  const originalLayers = useMapStore.getState().layers;

  beforeEach(() => {
    expandGroup.mockClear();
    (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver =
      StubResizeObserver;
    Element.prototype.getBoundingClientRect = () => STUB_RECT;
  });

  it("draws the strike's core arc at radius 1.5 when layers.lightning is true", async () => {
    useMapStore.setState({ layers: { ...originalLayers, lightning: true } });
    await mount();

    const point = toCanvas(STRIKE.lat, STRIKE.lon);
    const arcsAtPoint = ops.filter(
      (op) =>
        op.name === "arc" &&
        Math.hypot(op.args[0] - point.x, op.args[1] - point.y) < 1,
    );
    expect(arcsAtPoint.length).toBeGreaterThan(0);

    // The core arc is the smaller of the glow/core pair (glow radius 3,
    // core radius 1.5).
    const coreRadius = Math.min(...arcsAtPoint.map((op) => op.args[2]));
    expect(coreRadius).toBe(1.5);
  });

  it("draws nothing at the strike's position when layers.lightning is false", async () => {
    useMapStore.setState({ layers: { ...originalLayers, lightning: false } });
    await mount();

    const point = toCanvas(STRIKE.lat, STRIKE.lon);
    const arcsAtPoint = ops.filter(
      (op) =>
        op.name === "arc" &&
        Math.hypot(op.args[0] - point.x, op.args[1] - point.y) < 1,
    );
    expect(arcsAtPoint).toHaveLength(0);
  });
});
