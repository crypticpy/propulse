/**
 * Binding test for the flat map's weather alerts call site (#1091 PR 4).
 *
 * `weatherAlertsLayer.test.ts` drives `drawWeatherAlertsLayer` directly with
 * a fake `Projection` and an explicit `MapLayerProfile`, so it cannot see
 * which profile `FlatMapView` actually passes at its
 * `drawWeatherAlertsLayer` call site, nor whether the flat map still passes
 * its own live `zoom.scale` through. This test mounts the real component
 * (same jsdom canvas-recorder harness as `FlatMapView.earthquakes.test.tsx`)
 * with one weather alert, and pins the triangle vertices at the alert's
 * projected position, the "!" glyph draw, and that no event-type label is
 * drawn at the map's default zoomScale of 1 -- `labelMinZoomScale` is the
 * only profile-dependent value this layer reads, and the flat map's own
 * threshold (1.5) suppresses the label there while `AZIMUTHAL_LAYER_PROFILE`
 * (0, always-on) would draw it. Swapping `AZIMUTHAL_LAYER_PROFILE` in at
 * that call site, or dropping the call entirely, fails this test.
 */
import { render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ViewProvider } from "@/components/views/ViewProvider";
import { createMemoryWorkingStorage } from "@/lib/views/runtime";
import { useMapStore } from "@/stores/mapStore";
import type { WeatherAlert } from "@/lib/api/weather";

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

const ALERT: WeatherAlert = {
  id: "test-alert",
  event: "Tornado Warning",
  headline: "Test headline",
  severity: "Extreme",
  lat: -15,
  lon: 100,
  areaDesc: "Test area",
  urgency: "Immediate",
  certainty: "Observed",
  response: "Shelter",
  instruction: "Seek shelter immediately",
  polygon: null,
};
vi.mock("@/hooks/useWeatherAlerts", () => ({
  useWeatherAlerts: () => ({ alerts: [ALERT], isLoading: false, error: null }),
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
        ownerId="flat-weather-alerts-test"
        slot="normal"
        storage={createMemoryWorkingStorage()}
      >
        <FlatMapView displayTime={new Date("2026-09-09T12:00:00Z")} />
      </ViewProvider>
    </QueryClientProvider>,
  );
}

describe("FlatMapView weather alerts layer binding", () => {
  const originalLayers = useMapStore.getState().layers;

  beforeEach(() => {
    expandGroup.mockClear();
    (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver =
      StubResizeObserver;
    Element.prototype.getBoundingClientRect = () => STUB_RECT;
    useMapStore.setState({ layers: { ...originalLayers, weather: true } });
  });

  it("draws the alert's warning triangle and '!' glyph at the projected position", async () => {
    await mount();

    const point = toCanvas(ALERT.lat, ALERT.lon);

    // The triangle's apex (moveTo) sits at (x, y - size); at zoom 1 the flat
    // map's zoomDamp floor of 1 makes size exactly 8.
    const apex = ops.find(
      (op) =>
        op.name === "moveTo" &&
        Math.abs(op.args[0] - point.x) < 1 &&
        Math.abs(op.args[1] - (point.y - 8)) < 1,
    );
    expect(apex).toBeDefined();

    const glyph = ops.find(
      (op) =>
        op.name === "fillText" &&
        Math.abs(op.args[1] - point.x) < 1 &&
        Math.abs(op.args[2] - point.y) < 1,
    );
    expect(glyph).toBeDefined();

    // At the flat map's default zoomScale of 1, FLAT_LAYER_PROFILE's
    // labelMinZoomScale (1.5) suppresses the event-type label. Binding this
    // call site to AZIMUTHAL_LAYER_PROFILE (labelMinZoomScale 0, always-on)
    // would draw it here instead, so this pins the profile actually passed.
    const label = ops.find(
      (op) => op.name === "fillText" && op.strArgs[0] === ALERT.event,
    );
    expect(label).toBeUndefined();
  });
});
