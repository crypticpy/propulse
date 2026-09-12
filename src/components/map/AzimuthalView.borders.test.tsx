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
 * `labelOptions.stateBorders` enabled, and the terminator layer disabled so
 * the night-boosted border pass (which calls the same two draw functions a
 * second time under a clip) doesn't double the counts. For each `stroke` op
 * in the recorded frame, it counts the `beginPath` ops since the previous
 * `stroke` and asserts there is exactly one -- and that hundreds of
 * `moveTo`/`lineTo` ops were accumulated under it, not just the last ring's.
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
 * Same recorder technique as `AzimuthalView.hazards.test.tsx`. Answers every
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

async function mount() {
  installCanvasRecorder();
  const { AzimuthalView } = await import("@/components/map/AzimuthalView");
  return render(
    <Wrap>
      <AzimuthalView displayTime={new Date("2026-09-09T12:00:00Z")} />
    </Wrap>,
  );
}

/**
 * For every `stroke` op, count how many `moveTo`/`lineTo` ops were recorded
 * since the immediately preceding `beginPath`, and how many `beginPath` ops
 * occurred since the previous `stroke`. Border strokes should show exactly
 * one `beginPath` and hundreds of accumulated move/line ops; the pre-fix
 * bug produces one `beginPath` per ring, so only the last ring's handful of
 * points survive to the stroke.
 */
function strokeSegments() {
  const segments: { beginPathCount: number; moveLineCount: number }[] = [];
  let beginPathCount = 0;
  let moveLineCount = 0;
  for (const op of ops) {
    if (op.name === "beginPath") {
      beginPathCount++;
      moveLineCount = 0;
    } else if (op.name === "moveTo" || op.name === "lineTo") {
      moveLineCount++;
    } else if (op.name === "stroke") {
      segments.push({ beginPathCount, moveLineCount });
      beginPathCount = 0;
    }
  }
  return segments;
}

describe("AzimuthalView border batching (#1150)", () => {
  const originalLayers = useMapStore.getState().layers;
  const originalLabelOptions = useMapStore.getState().labelOptions;

  beforeEach(() => {
    expandGroup.mockClear();
    (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver =
      StubResizeObserver;
    Element.prototype.getBoundingClientRect = () => STUB_RECT;
    useMapStore.setState({
      // Disable the terminator so the night-boosted border pass (which
      // redraws country/state borders a second time under a clip) doesn't
      // add a second pair of beginPath/stroke segments to count.
      layers: { ...originalLayers, terminator: false },
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

  it("strokes every accumulated ring for both country and state borders", async () => {
    await mount();

    const segments = strokeSegments().filter(
      (segment) => segment.moveLineCount > 0,
    );

    // Both the country-border pass and the state-border pass should have
    // stroked exactly one accumulated path (one beginPath before the whole
    // batch of rings) with hundreds of move/line ops -- not one beginPath
    // per ring, which would leave only a handful of points (the last ring)
    // by the time stroke() runs.
    const borderSegments = segments.filter(
      (segment) => segment.moveLineCount > 50,
    );
    expect(borderSegments.length).toBeGreaterThanOrEqual(2);

    for (const segment of borderSegments) {
      expect(segment.beginPathCount).toBe(1);
    }
  });
});
