/**
 * Binding test for the flat map's shared terminator layer call site (#1091
 * PR 8). `terminatorLayer.test.ts` drives `drawTerminatorLayer` directly
 * with a fake `Projection`, so it cannot see which `Projection` instance
 * `FlatMapView` actually builds at its terminator call site, nor that the
 * `labelOptions.terminatorDashed` store flag actually reaches the layer.
 * Modeled on `FlatMapView.borders.test.tsx`'s canvas recorder, using the
 * shared `canvasRecorder.test-helper`.
 *
 * Forces `mapStyle: "standard"` (the terminator pass draws unconditionally
 * once `layers.terminator` is on, but "standard" keeps the rest of the
 * science-effect deterministic in this jsdom harness, matching the borders
 * binding test) and `layers.terminator: true`.
 */
import { render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ViewProvider } from "@/components/views/ViewProvider";
import { createMemoryWorkingStorage } from "@/lib/views/runtime";
import { useMapStore } from "@/stores/mapStore";
import {
  TERMINATOR_COLOR,
  TERMINATOR_OUTLINE_COLOR,
} from "@/components/map/layers/terminatorLayer";
import {
  createCanvasRecorder,
  makeStubRect,
  StubResizeObserver,
} from "./layers/canvasRecorder.test-helper";

const { ops, installCanvasRecorder } = createCanvasRecorder({
  width: 1024,
  height: 512,
  trackedProps: new Set(["lineWidth", "strokeStyle"]),
});

const STUB_RECT = makeStubRect(1024, 512);

// The spots pipeline is unrelated to this test and pulls in a real fetch
// chain (`layers.spots` defaults on) -- stub it the same way
// `FlatMapView.borders.test.tsx` does, with an empty feed.
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

async function mount() {
  installCanvasRecorder();
  const { FlatMapView } = await import("@/components/map/FlatMapView");
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <ViewProvider
        ownerId="flat-terminator-test"
        slot="normal"
        storage={createMemoryWorkingStorage()}
      >
        <FlatMapView displayTime={new Date("2026-09-09T12:00:00Z")} />
      </ViewProvider>
    </QueryClientProvider>,
  );
}

/** Finds the index of the colour-pass stroke (`strokeStyle ===
 * TERMINATOR_COLOR`) and asserts it is preceded, at some point, by a stroke
 * with the outline colour -- the two-pass order `drawTerminatorLayer`
 * draws in. */
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

/** The dash pattern in effect (most recent `setLineDash` call) at the
 * moment the terminator's outline-colour stroke fires -- the first of
 * `drawTerminatorLayer`'s two strokes, immediately preceded by its own
 * `setLineDash` call in the same invocation. */
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

describe("FlatMapView shared terminator layer binding", () => {
  const originalLabelOptions = useMapStore.getState().labelOptions;
  const originalLayers = useMapStore.getState().layers;
  const originalMapStyle = useMapStore.getState().mapStyle;

  beforeEach(() => {
    expandGroup.mockClear();
    (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver =
      StubResizeObserver;
    Element.prototype.getBoundingClientRect = () => STUB_RECT;
    useMapStore.setState({
      mapStyle: "standard",
      layers: { ...originalLayers, terminator: true },
    });
  });

  afterEach(() => {
    useMapStore.setState({
      mapStyle: originalMapStyle,
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
