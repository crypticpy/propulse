/**
 * Binding test for the azimuthal disc's three hazard-layer call sites
 * (#1091 PR 4, closing the F4 gap the #1137 review found: PR 3 shipped a
 * FlatMapView binding test for earthquakes but no AzimuthalView equivalent).
 *
 * `earthquakesLayer.test.ts`, `firesLayer.test.ts` and
 * `weatherAlertsLayer.test.ts` drive their draw functions directly with a
 * fake `Projection` and an explicit `MapLayerProfile`, so none of them can
 * see which profile `AzimuthalView` actually passes at its three
 * `draw*Layer` call sites. This mounts the real component (same
 * canvas-recorder technique as `FlatMapView.earthquakes.test.tsx`, plus the
 * `useUserStore` station setup `MapSurface.focusHome.test.tsx` uses to give
 * `AzimuthalView` a non-null `center`) with one fire hotspot, one M6
 * earthquake and one weather alert, and pins:
 *  - the fire hotspot's core arc radius to AZIMUTHAL_LAYER_PROFILE's value
 *  - the quake's core arc radius to 12.5 = (6 - 1) * 2.5 (AZIMUTHAL's
 *    pxPerMagnitude), not FLAT's (6 - 1) * 3 = 15
 *  - the weather alert's event-type label being drawn at zoomScale 1 — the
 *    azimuthal-only always-on behaviour (labelMinZoomScale: 0), which FLAT's
 *    threshold of 1.5 would suppress
 * so a profile swap at any of the three call sites fails this test.
 */
import { render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ViewProvider } from "@/components/views/ViewProvider";
import { createMemoryWorkingStorage } from "@/lib/views/runtime";
import { useMapStore } from "@/stores/mapStore";
import { useUserStore } from "@/stores/userStore";
import { azimuthalProject } from "@/lib/utils/azimuthal";
import { CANVAS_SIZE } from "@/lib/webgl/AzimuthalRenderer";
import type { EarthquakeEvent } from "@/lib/api/earthquakes";
import type { FireHotspot } from "@/lib/api/fires";
import type { WeatherAlert } from "@/lib/api/weather";
import type { ReactNode } from "react";

// AzimuthalView's own internal constants (`CENTER`/`RADIUS` are not
// exported); this mirrors them exactly, matching the comment at their
// declaration site ("Leave margin for labels").
const CENTER = CANVAS_SIZE / 2;
const RADIUS = CANVAS_SIZE / 2 - 40;

const STATION = { lat: 0, lon: 0 };

function toCanvas(lat: number, lon: number) {
  const p = azimuthalProject(lat, lon, STATION.lat, STATION.lon);
  return { x: CENTER + p.x * RADIUS, y: CENTER + p.y * RADIUS };
}

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

// (magnitude 6 - baseline 1) * AZIMUTHAL_LAYER_PROFILE.quakes.pxPerMagnitude
// (2.5) = 12.5, within [3, 15]. Under FLAT_LAYER_PROFILE (pxPerMagnitude 3)
// the same quake would draw a 15px core instead.
const QUAKE: EarthquakeEvent = {
  id: "test-quake",
  lat: 10,
  lon: 20,
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

// 250 / AZIMUTHAL_LAYER_PROFILE.fires.frpPerRadiusPx (100) = 2.5, within
// [1.5, 5]. Under FLAT_LAYER_PROFILE (frpPerRadiusPx 80) the same hotspot
// would draw a 3.125px core instead.
const HOTSPOT: FireHotspot = {
  lat: -10,
  lon: -20,
  brightness: 300,
  confidence: "nominal",
  frp: 250,
};
vi.mock("@/hooks/useFires", () => ({
  useFires: () => ({ hotspots: [HOTSPOT], isLoading: false, error: null }),
}));

// AZIMUTHAL_LAYER_PROFILE.weatherAlerts.labelMinZoomScale is 0, so the label
// draws at every zoom, including the view's default zoomScale of 1. Under
// FLAT_LAYER_PROFILE (labelMinZoomScale 1.5) it would not draw at zoom 1.
const ALERT: WeatherAlert = {
  id: "test-alert",
  event: "Flash Flood", // <= 16 chars: no truncation, so the test can assert on the exact label text
  headline: "Test headline",
  severity: "Moderate",
  lat: 5,
  lon: 15,
  areaDesc: "Test area",
  urgency: "Immediate",
  certainty: "Observed",
  response: "Shelter",
  instruction: "Seek shelter immediately",
  polygon: null,
};
vi.mock("@/hooks/useWeatherAlerts", () => ({
  useWeatherAlerts: () => ({
    alerts: [ALERT],
    isLoading: false,
    error: null,
  }),
}));

interface CanvasOp {
  name: string;
  args: number[];
  strArgs: unknown[];
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

/**
 * Same recorder technique as `FlatMapView.earthquakes.test.tsx`. AzimuthalView
 * also owns a WebGL globe canvas (`AzimuthalRenderer`); this proxy answers
 * every `getContext()` call the same way regardless of context id, so the
 * WebGL init path resolves harmlessly (`initialize()` awaits an image load
 * and never throws synchronously) while the 2D overlay canvas we care about
 * records its real draw calls.
 */
function installCanvasRecorder() {
  ops.length = 0;
  const context = new Proxy(
    {},
    {
      get: (_target, prop: string) => {
        if (prop === "canvas") return { width: 600, height: 600 };
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
          return undefined;
        };
      },
      set: () => true,
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
          ownerId="azimuthal-hazards-test"
          slot="normal"
          storage={createMemoryWorkingStorage()}
        >
          {children}
        </ViewProvider>
      </QueryClientProvider>
    </MemoryRouter>
  );
}

async function mount() {
  installCanvasRecorder();
  const { AzimuthalView } = await import("@/components/map/AzimuthalView");
  return render(
    <Wrap>
      <AzimuthalView displayTime={new Date("2026-09-09T12:00:00Z")} />
    </Wrap>,
  );
}

describe("AzimuthalView hazard layers binding", () => {
  const originalLayers = useMapStore.getState().layers;

  beforeEach(() => {
    expandGroup.mockClear();
    (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver =
      StubResizeObserver;
    Element.prototype.getBoundingClientRect = () => STUB_RECT;
    useMapStore.setState({
      layers: {
        ...originalLayers,
        earthquakes: true,
        fires: true,
        weather: true,
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
  });

  it("draws the fire hotspot's core arc at the AZIMUTHAL profile's radius", async () => {
    await mount();

    const point = toCanvas(HOTSPOT.lat, HOTSPOT.lon);
    const arcsAtPoint = ops.filter(
      (op) =>
        op.name === "arc" &&
        Math.hypot(op.args[0] - point.x, op.args[1] - point.y) < 1,
    );
    expect(arcsAtPoint.length).toBeGreaterThan(0);

    const coreRadius = Math.min(...arcsAtPoint.map((op) => op.args[2]));
    expect(coreRadius).toBeCloseTo(2.5, 5);
  });

  it("draws the quake's core arc at 12.5px, not FLAT's 15px", async () => {
    await mount();

    const point = toCanvas(QUAKE.lat, QUAKE.lon);
    const arcsAtPoint = ops.filter(
      (op) =>
        op.name === "arc" &&
        Math.hypot(op.args[0] - point.x, op.args[1] - point.y) < 1,
    );
    expect(arcsAtPoint.length).toBeGreaterThan(0);

    const coreRadius = Math.min(...arcsAtPoint.map((op) => op.args[2]));
    expect(coreRadius).toBeCloseTo(12.5, 5);
  });

  it("draws the weather alert's event label at zoomScale 1 (azimuthal-only always-on behaviour)", async () => {
    await mount();

    const point = toCanvas(ALERT.lat, ALERT.lon);
    const label = ops.find(
      (op) =>
        op.name === "fillText" &&
        op.strArgs[0] === ALERT.event &&
        Math.abs((op.args[1] as number) - point.x) < 1,
    );
    expect(label).toBeDefined();
  });
});
