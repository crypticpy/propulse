/**
 * Binding test for the flat map's shared country/state border layer call
 * sites (#1091 PR 6).
 *
 * `bordersLayer.test.ts` drives `drawCountryBordersLayer`/
 * `drawStateBordersLayer` directly with a fake `Projection`, so it cannot
 * see which `Projection` instance `FlatMapView` actually builds at its
 * border call sites, nor that the flat map's seam strategy still reaches
 * `addWrappedRingPath` (previously called with literal `renderWidth`/
 * `renderHeight`, now with `projection.wrapWidth`/`wrapHeight`). Modeled on
 * `FlatMapView.lightning.test.tsx`'s canvas recorder, using the shared
 * `canvasRecorder.test-helper` (#1091 PR 6, same recorder technique as
 * `AzimuthalView.borders.test.tsx`).
 *
 * Forces `mapStyle: "standard"` (the border pass on this view's "science"
 * effect early-returns when `!isStandard && !mapImage`, and `mapImage`
 * never resolves in this jsdom harness) and `themeId: "dark"` so the
 * standard-mode, non-light-theme colour strings apply deterministically.
 * Mounts with both `labelOptions.borders` and `labelOptions.stateBorders`
 * on and the terminator layer left at its store default (on), so the
 * night-boosted border pass is exercised too.
 */
import { render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ViewProvider } from "@/components/views/ViewProvider";
import { createMemoryWorkingStorage } from "@/lib/views/runtime";
import { useMapStore } from "@/stores/mapStore";
import { useThemeStore } from "@/stores/themeStore";
import * as standardMap from "@/lib/utils/standardMap";
import {
  createCanvasRecorder,
  groupStrokeSegments,
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
// `FlatMapView.lightning.test.tsx` does, with an empty feed.
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
        ownerId="flat-borders-test"
        slot="normal"
        storage={createMemoryWorkingStorage()}
      >
        <FlatMapView displayTime={new Date("2026-09-09T12:00:00Z")} />
      </ViewProvider>
    </QueryClientProvider>,
  );
}

describe("FlatMapView shared borders layer binding", () => {
  const originalLabelOptions = useMapStore.getState().labelOptions;
  const originalMapStyle = useMapStore.getState().mapStyle;
  const originalThemeId = useThemeStore.getState().themeId;

  beforeEach(() => {
    expandGroup.mockClear();
    (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver =
      StubResizeObserver;
    Element.prototype.getBoundingClientRect = () => STUB_RECT;
    useMapStore.setState({
      mapStyle: "standard",
      labelOptions: {
        ...originalLabelOptions,
        borders: true,
        stateBorders: true,
      },
    });
    useThemeStore.getState().setTheme("dark");
  });

  afterEach(() => {
    useMapStore.setState({
      mapStyle: originalMapStyle,
      labelOptions: originalLabelOptions,
    });
    useThemeStore.getState().setTheme(originalThemeId);
  });

  it("strokes the base-pass and night-boosted country/state passes with the standard, non-light-theme colours and widths", async () => {
    await mount();

    const segments = groupStrokeSegments(ops);
    const expected = [
      {
        label: "base-pass country",
        lineWidth: 1.0,
        strokeStyle: "rgba(255, 255, 255, 0.65)",
      },
      {
        label: "base-pass state",
        lineWidth: 0.7,
        strokeStyle: "rgba(255, 255, 255, 0.45)",
      },
      {
        label: "night-boosted country",
        lineWidth: 1,
        strokeStyle: "rgba(255, 255, 255, 0.55)",
      },
      {
        label: "night-boosted state",
        lineWidth: 0.7,
        strokeStyle: "rgba(255, 255, 255, 0.4)",
      },
    ];

    for (const exp of expected) {
      const matches = segments.filter(
        (s) =>
          s.lineWidth === exp.lineWidth && s.strokeStyle === exp.strokeStyle,
      );
      expect(
        matches.length,
        `expected to find ${exp.label}`,
      ).toBeGreaterThanOrEqual(1);
      for (const match of matches) {
        expect(match.beginPathCount, exp.label).toBe(1);
      }
    }
  });

  it("reaches addWrappedRingPath with the view's real render width/height (the seam primitive is still in play)", async () => {
    const spy = vi.spyOn(standardMap, "addWrappedRingPath");
    await mount();

    expect(spy.mock.calls.length).toBeGreaterThan(0);
    for (const call of spy.mock.calls) {
      expect(call[2]).toBe(1024);
      expect(call[3]).toBe(512);
    }
    spy.mockRestore();
  });

  // #1091 PR 6: unlike the disc (drift tracked in #1173), the flat map
  // actually reads the theme store for its border colour (`drawLabels`
  // passes `themeId === "light"` straight through as `lightTheme`) -- pin
  // the light-theme, standard-mode base-pass colours so a regression that
  // stopped reading the theme, or swapped the disc's hardcoded `false` in
  // here, would be caught.
  it("strokes the base-pass country/state passes with the standard, light-theme colours and widths", async () => {
    useThemeStore.getState().setTheme("light");

    await mount();

    const segments = groupStrokeSegments(ops);
    const expected = [
      {
        label: "base-pass country, light theme",
        lineWidth: 1.0,
        strokeStyle: "rgba(15, 23, 42, 0.6)",
      },
      {
        label: "base-pass state, light theme",
        lineWidth: 0.7,
        strokeStyle: "rgba(15, 23, 42, 0.5)",
      },
    ];

    for (const exp of expected) {
      const matches = segments.filter(
        (s) =>
          s.lineWidth === exp.lineWidth && s.strokeStyle === exp.strokeStyle,
      );
      expect(
        matches.length,
        `expected to find ${exp.label}`,
      ).toBeGreaterThanOrEqual(1);
      for (const match of matches) {
        expect(match.beginPathCount, exp.label).toBe(1);
      }
    }
  });
});
