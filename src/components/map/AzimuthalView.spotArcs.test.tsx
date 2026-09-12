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
import {
  createCanvasRecorder,
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
    expect(ops.some((op) => op.name === "stroke")).toBe(true);
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
    const alphasOff = strokeAlphas();
    first.unmount();

    useMapStore.setState({
      labelOptions: { ...originalLabelOptions, spotPathAgeFade: true },
    });
    await mount();
    const alphasOn = strokeAlphas();

    expect(alphasOff).not.toEqual(alphasOn);
  });
});
