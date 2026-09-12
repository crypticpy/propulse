/**
 * Binding test for the disc's shared terminator layer call site (#1091 PR
 * 8). `terminatorLayer.test.ts` drives `drawTerminatorLayer` directly with
 * a fake `Projection`, so it cannot see which `Projection` instance
 * `AzimuthalView` actually builds at its terminator call site (a dedicated
 * `zoomDamp: zoom` instance, diverging from the disc's other layers'
 * `zoomDamp: 1`), nor that the `labelOptions.terminatorDashed` store flag
 * actually reaches the layer. Modeled on `AzimuthalView.borders.test.tsx`'s
 * canvas recorder and station setup, using the shared
 * `canvasRecorder.test-helper`.
 */
import { render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ViewProvider } from "@/components/views/ViewProvider";
import { createMemoryWorkingStorage } from "@/lib/views/runtime";
import { useMapStore } from "@/stores/mapStore";
import { useUserStore } from "@/stores/userStore";
import {
  TERMINATOR_COLOR,
  TERMINATOR_OUTLINE_COLOR,
} from "@/components/map/layers/terminatorLayer";
import {
  createCanvasRecorder,
  makeStubRect,
  StubResizeObserver,
} from "@/components/map/layers/canvasRecorder.test-helper";
import type { ReactNode } from "react";

const STATION = { lat: 0, lon: 0 };

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

const STUB_RECT = makeStubRect(600, 600);

const { ops, installCanvasRecorder } = createCanvasRecorder({
  width: 600,
  height: 600,
  trackedProps: new Set(["lineWidth", "strokeStyle"]),
});

function Wrap({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return (
    <MemoryRouter>
      <QueryClientProvider client={client}>
        <ViewProvider
          ownerId="azimuthal-terminator-test"
          slot="normal"
          storage={createMemoryWorkingStorage()}
        >
          {children}
        </ViewProvider>
      </QueryClientProvider>
    </MemoryRouter>
  );
}

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

/** Finds the colour-pass stroke and confirms an outline-colour stroke
 * preceded it -- the two-pass order `drawTerminatorLayer` draws in. */
function outlineStrokePrecedesColourStroke(): boolean {
  let sawOutline = false;
  let strokeStyle: string | undefined;
  for (const op of ops) {
    if (op.name === "set:strokeStyle") {
      strokeStyle = op.value as string;
    } else if (op.name === "stroke") {
      if (strokeStyle === TERMINATOR_OUTLINE_COLOR) sawOutline = true;
      if (strokeStyle === TERMINATOR_COLOR && sawOutline) return true;
    }
  }
  return false;
}

/** The dash pattern in effect at the moment the terminator's outline-colour
 * stroke fires. */
function dashBeforeTerminatorOutlineStroke(): number[] | undefined {
  let dash: number[] | undefined;
  let strokeStyle: string | undefined;
  for (const op of ops) {
    if (op.name === "setLineDash") {
      dash = op.strArgs[0] as number[];
    } else if (op.name === "set:strokeStyle") {
      strokeStyle = op.value as string;
    } else if (
      op.name === "stroke" &&
      strokeStyle === TERMINATOR_OUTLINE_COLOR
    ) {
      return dash;
    }
  }
  return dash;
}

describe("AzimuthalView shared terminator layer binding", () => {
  const originalLayers = useMapStore.getState().layers;
  const originalLabelOptions = useMapStore.getState().labelOptions;

  beforeEach(() => {
    expandGroup.mockClear();
    (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver =
      StubResizeObserver;
    Element.prototype.getBoundingClientRect = () => STUB_RECT;
    useMapStore.setState({
      layers: { ...originalLayers, terminator: true },
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

  it("with layers.terminator on, strokes the colour pass preceded by the outline pass", async () => {
    useMapStore.setState({
      labelOptions: { ...originalLabelOptions, terminatorDashed: false },
    });
    await mount();

    expect(outlineStrokePrecedesColourStroke()).toBe(true);
  });

  it("sets a non-empty dash before the terminator strokes when terminatorDashed is true", async () => {
    useMapStore.setState({
      labelOptions: { ...originalLabelOptions, terminatorDashed: true },
    });
    await mount();

    const dash = dashBeforeTerminatorOutlineStroke();
    expect(dash).toBeDefined();
    expect(dash!.length).toBeGreaterThan(0);
  });

  it("clears the dash before the terminator strokes when terminatorDashed is false", async () => {
    useMapStore.setState({
      labelOptions: { ...originalLabelOptions, terminatorDashed: false },
    });
    await mount();

    const dash = dashBeforeTerminatorOutlineStroke();
    expect(dash).toEqual([]);
  });
});
