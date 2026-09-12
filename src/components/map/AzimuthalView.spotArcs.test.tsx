/**
 * Binding test for the disc's shared `spotArcsLayer` call site (#1247).
 * `spotArcsLayer.test.ts` drives `drawSpotArcsLayer` directly with a fake
 * `Projection`, so it cannot see that `AzimuthalView` gained arc-drawing
 * for the "Spots" layer at all (previously only traces drew), nor that it
 * wires the real `useWatchStore` state and `labelOptions.spotPathAgeFade`
 * through to the layer. Modeled on `AzimuthalView.terminator.test.tsx`'s
 * station setup and the shared `canvasRecorder.test-helper`.
 */
import { render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ViewProvider } from "@/components/views/ViewProvider";
import { createMemoryWorkingStorage } from "@/lib/views/runtime";
import { useMapStore } from "@/stores/mapStore";
import { useUserStore } from "@/stores/userStore";
import { useWatchStore } from "@/stores/watchStore";
import type { ResolvedSpot } from "@/components/map/LiveSpotArcs";
import type { LiveSpot } from "@/types/livespot";
import { getModeColor } from "@/lib/utils/spotColors";
import { createAzimuthalProjection } from "@/lib/map/projection";
import { spotArcSegments } from "@/components/map/layers/spotArcsLayer";
import { CANVAS_SIZE } from "@/lib/webgl/AzimuthalRenderer";
import {
  createCanvasRecorder,
  groupStrokeSegments,
  makeStubRect,
  StubResizeObserver,
} from "@/components/map/layers/canvasRecorder.test-helper";
import type { ReactNode } from "react";

const STATION = { lat: 0, lon: 0 };

function liveSpot(id: string, dxLat: number, dxLon: number): LiveSpot {
  return {
    id,
    spotter: "K1ABC",
    spotterLat: 10,
    spotterLon: 10,
    dx: id.toUpperCase(),
    dxLat,
    dxLon,
    frequency: 14074,
    mode: "FT8",
    comment: "",
    time: new Date("2026-09-09T12:00:00Z"),
    source: "PSKReporter",
  } as LiveSpot;
}

function resolve(spot: LiveSpot): ResolvedSpot {
  return {
    id: spot.id,
    spotterLat: spot.spotterLat!,
    spotterLon: spot.spotterLon!,
    dxLat: spot.dxLat!,
    dxLon: spot.dxLon!,
    mode: spot.mode!,
    frequency: spot.frequency,
    time: spot.time as Date,
    callsign: spot.dx,
    spotter: spot.spotter,
    source: spot.source,
    spotterLocApprox: false,
    dxLocApprox: false,
    originalSpot: spot,
  };
}

const MATCHED_SPOT = liveSpot("watched-1", 51.5, -0.1);
const UNMATCHED_SPOT = liveSpot("unmatched-1", -33.9, 18.4);
const SPOTS = [MATCHED_SPOT, UNMATCHED_SPOT];
const RESOLVED_SPOTS = SPOTS.map(resolve);

const expandGroup = vi.fn();
const FEED = {
  spots: SPOTS,
  candidateSpots: SPOTS,
  resolvedSpots: RESOLVED_SPOTS,
  resolvedSingles: RESOLVED_SPOTS,
  allResolvedSpots: RESOLVED_SPOTS,
  activationSpots: [],
  clusters: [],
  singles: SPOTS,
  groupingEnabled: false,
  expandGroup,
  isLoading: false,
  isFeedReady: true,
  feedScopeKey: "test",
  listTotal: SPOTS.length,
  mapBudget: 500,
  matchingCount: SPOTS.length,
  mappedCount: SPOTS.length,
  unlocatedCount: 0,
  budgetOmittedCount: 0,
};
vi.mock("@/hooks/useViewMapSpots", () => ({
  useViewMapSpots: () => FEED,
}));

const STUB_RECT = makeStubRect(600, 600);

const { ops, installCanvasRecorder } = createCanvasRecorder({
  width: 600,
  height: 600,
  trackedProps: new Set(["lineWidth", "strokeStyle", "globalAlpha"]),
});

function Wrap({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return (
    <MemoryRouter>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </MemoryRouter>
  );
}

const DISPLAY_TIME = new Date("2026-09-09T12:00:00Z");

let mountCount = 0;

async function mount() {
  installCanvasRecorder();
  const { AzimuthalView } = await import("@/components/map/AzimuthalView");
  mountCount += 1;
  return render(
    <Wrap>
      <ViewProvider
        ownerId={`azimuthal-spot-arcs-test-${mountCount}`}
        slot="normal"
        storage={createMemoryWorkingStorage()}
      >
        <AzimuthalView displayTime={DISPLAY_TIME} />
      </ViewProvider>
    </Wrap>,
  );
}

/** The `globalAlpha` in effect (most recent `set:globalAlpha`) at each
 * `stroke()` call, in order. */
function strokeAlphas(): number[] {
  const alphas: number[] = [];
  let current = 1;
  for (const op of ops) {
    if (op.name === "set:globalAlpha") {
      current = op.value as number;
    } else if (op.name === "stroke") {
      alphas.push(current);
    }
  }
  return alphas;
}

/** Both seeded spots are FT8, so every spot-arc stroke uses this colour --
 * lets a test bind to strokes the spot layer actually drew instead of any
 * `stroke()` call at all (home marker and terminator stroke unconditionally,
 * #1247 review). */
const SPOT_COLOR = getModeColor("FT8");

/** The `globalAlpha` in effect at each `stroke()` call whose `strokeStyle`
 * was last set to `color`, in order. */
function strokeAlphasForColor(color: string): number[] {
  const alphas: number[] = [];
  let currentAlpha = 1;
  let currentStroke: string | undefined;
  for (const op of ops) {
    if (op.name === "set:globalAlpha") {
      currentAlpha = op.value as number;
    } else if (op.name === "set:strokeStyle") {
      currentStroke = op.value as string;
    } else if (op.name === "stroke" && currentStroke === color) {
      alphas.push(currentAlpha);
    }
  }
  return alphas;
}

/** Canvas centre/radius the disc actually renders at (`CANVAS_SIZE = 600`,
 * `RADIUS = CANVAS_SIZE / 2 - 40`, both module-private in
 * `AzimuthalView.tsx`) -- mirrored here so a test can independently compute
 * where a spot's endpoint projects without importing view internals. */
const DISC_CENTER = CANVAS_SIZE / 2;
const DISC_RADIUS = CANVAS_SIZE / 2 - 40;

/** The screen coords a spot's DX endpoint projects to on the disc, given
 * the test station sits at `STATION` (center = station, zoom = 1 on
 * mount). */
function dxScreenPoint(spot: LiveSpot) {
  const projection = createAzimuthalProjection({
    centerLat: STATION.lat,
    centerLon: STATION.lon,
    centerX: DISC_CENTER,
    centerY: DISC_CENTER,
    radius: DISC_RADIUS,
    zoomScale: 1,
    zoomDamp: 1,
  });
  return projection.project(spot.dxLat!, spot.dxLon!);
}

describe("AzimuthalView shared spotArcsLayer binding", () => {
  const originalLayers = useMapStore.getState().layers;
  const originalLabelOptions = useMapStore.getState().labelOptions;
  const originalWatch = {
    enabled: useWatchStore.getState().enabled,
    matchedSpotIds: useWatchStore.getState().matchedSpotIds,
  };

  beforeEach(() => {
    expandGroup.mockClear();
    (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver =
      StubResizeObserver;
    Element.prototype.getBoundingClientRect = () => STUB_RECT;
    useMapStore.setState({
      layers: { ...originalLayers, spots: true, spotTraces: false },
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
    useWatchStore.setState(originalWatch);
  });

  it("strokes an arc for a live spot under the Spots layer (new capability, #1247)", async () => {
    useWatchStore.setState({ enabled: false, matchedSpotIds: new Set() });
    await mount();
    // Bind to a stroke whose colour is the seeded (FT8) spot colour, unique
    // to this layer's arc/RX-square strokes -- unlike a bare `stroke()`
    // existence check, which can't fail (home marker and terminator stroke
    // unconditionally, #1247 review).
    const spotStrokes = groupStrokeSegments(ops).filter(
      (segment) => segment.strokeStyle === SPOT_COLOR,
    );
    expect(spotStrokes.length).toBeGreaterThan(0);
  });

  it("dims the unmatched spot's arc when a watch is active", async () => {
    useWatchStore.setState({
      enabled: true,
      matchedSpotIds: new Set([MATCHED_SPOT.id]),
    });
    await mount();
    const alphas = strokeAlphas();
    expect(alphas.some((a) => Math.abs(a - 1) < 1e-6)).toBe(true);
    expect(alphas.some((a) => Math.abs(a - 0.3) < 1e-6)).toBe(true);
  });

  it("does not dim any arc when no watch is active", async () => {
    useWatchStore.setState({ enabled: false, matchedSpotIds: new Set() });
    await mount();
    const alphas = strokeAlphas();
    expect(alphas.some((a) => Math.abs(a - 0.3) < 1e-6)).toBe(false);
  });

  it("changes stroke alpha with the spotPathAgeFade switch", async () => {
    useWatchStore.setState({ enabled: false, matchedSpotIds: new Set() });
    useMapStore.setState({
      labelOptions: { ...originalLabelOptions, spotPathAgeFade: false },
    });
    const first = await mount();
    const spotAlphasOff = strokeAlphasForColor(SPOT_COLOR);
    first.unmount();

    useMapStore.setState({
      labelOptions: { ...originalLabelOptions, spotPathAgeFade: true },
    });
    await mount();
    const spotAlphasOn = strokeAlphasForColor(SPOT_COLOR);

    // Both seeded spots are equally far past the 15-minute age-fade window
    // (fixed 2026-09-09 timestamp), so `getAgeOpacity` floors at 0.2 for
    // every spot-arc stroke when the switch is on, and stays unfaded (1)
    // when it is off -- pin the actual faded value, not just "these differ"
    // (#1247 review).
    expect(spotAlphasOff.length).toBeGreaterThan(0);
    expect(spotAlphasOn.length).toBeGreaterThan(0);
    expect(spotAlphasOff.every((a) => Math.abs(a - 1) < 1e-6)).toBe(true);
    expect(spotAlphasOn.every((a) => Math.abs(a - 0.2) < 1e-6)).toBe(true);
  });

  it("draws no TX arc glyph for a single unclustered spot (disc DOM endpoint button owns it, #1247 item 1)", async () => {
    useWatchStore.setState({ enabled: false, matchedSpotIds: new Set() });
    await mount();
    // The TX glyph is two concentric `arc()` calls (fill + white outline) at
    // the spot's projected DX screen point (`traceSpotArcEndpoint`, "tx").
    // Both seeded spots are far enough apart on the disc (London, Cape Town
    // from a station at 0,0) to each form their own single-member cluster,
    // so both get a DOM endpoint button and neither should get a canvas TX
    // circle at its DX point.
    for (const spot of SPOTS) {
      const { x, y } = dxScreenPoint(spot);
      const hasTxGlyphAtSpot = ops.some(
        (op) =>
          op.name === "arc" &&
          Math.abs(op.args[0] - x) < 0.5 &&
          Math.abs(op.args[1] - y) < 0.5,
      );
      expect(hasTxGlyphAtSpot).toBe(false);
    }
  });

  it("hits the azimuthal geometry cache across a redraw with the same scope, and misses when the scope changes (#1247 item 3)", () => {
    const projectionAt = (centerLat: number, centerLon: number) =>
      createAzimuthalProjection({
        centerLat,
        centerLon,
        centerX: DISC_CENTER,
        centerY: DISC_CENTER,
        radius: DISC_RADIUS,
        zoomScale: 1,
        zoomDamp: 1,
      });

    const from = { lat: 40, lon: -74 };
    const to = { lat: 51.5, lon: -0.1 };
    const scopeA = "10|20";
    const scopeB = "11|21";

    const first = spotArcSegments(
      from.lat,
      from.lon,
      to.lat,
      to.lon,
      projectionAt(10, 20),
      scopeA,
    );
    const second = spotArcSegments(
      from.lat,
      from.lon,
      to.lat,
      to.lon,
      projectionAt(10, 20),
      scopeA,
    );
    // Same scope -> same cached segments array instance (cache hit).
    expect(second).toBe(first);

    const third = spotArcSegments(
      from.lat,
      from.lon,
      to.lat,
      to.lon,
      projectionAt(11, 21),
      scopeB,
    );
    // Different scope -> recomputed, distinct array instance (cache miss).
    expect(third).not.toBe(first);
  });
});
