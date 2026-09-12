import { render, screen } from "@testing-library/react";
import { useEffect, useLayoutEffect } from "react";
import { describe, expect, it } from "vitest";
import type { DXSpot } from "@/types/dxcluster";
import { ViewProvider } from "@/components/views/ViewProvider";
import { useViewRuntime } from "@/components/views/ViewRuntimeContext";
import { createMemoryWorkingStorage } from "@/lib/views/runtime";
import { EMPTY_VIEW_SPOTS } from "./useBoundMapSelection";
import { commitViewSpotSelection } from "./useMapSpotSelection";
import {
  hasValidSpotCoordinates,
  MANUAL_FOCUS_SPOT_ID,
  useViewSpotFocus,
} from "./useSpotFocus";

function dxSpot(overrides: Partial<DXSpot> = {}): DXSpot {
  return {
    id: "spot-1",
    spotter: "K1ABC",
    dx: "JA1XYZ",
    frequency: 14074,
    comment: "",
    time: new Date("2026-08-31T12:00:00Z"),
    ...overrides,
  };
}

function FocusProbe({ spots }: { spots: readonly DXSpot[] }) {
  const { focusedSpot } = useViewSpotFocus(spots);
  return (
    <span data-testid="focus">
      {focusedSpot
        ? `${focusedSpot.dxLat},${focusedSpot.dxLon},${String(focusedSpot.dxLocApprox === true)}`
        : "none"}
    </span>
  );
}

function FocusHost({
  spots,
  select,
}: {
  spots: readonly DXSpot[];
  select: DXSpot | "unresolved";
}) {
  const runtime = useViewRuntime();
  useLayoutEffect(() => {
    if (select === "unresolved") runtime.selectSpot("unresolved", null);
    else commitViewSpotSelection(runtime, select);
  }, [runtime, select]);
  return <FocusProbe spots={spots} />;
}

describe("hasValidSpotCoordinates", () => {
  it("accepts the geographic boundaries and zero coordinates", () => {
    expect(hasValidSpotCoordinates({ dxLat: 0, dxLon: 0 })).toBe(true);
    expect(hasValidSpotCoordinates({ dxLat: 90, dxLon: -180 })).toBe(true);
    expect(hasValidSpotCoordinates({ dxLat: -90, dxLon: 180 })).toBe(true);
  });

  it("rejects missing, non-finite, and out-of-range coordinates", () => {
    expect(hasValidSpotCoordinates({ dxLat: undefined, dxLon: 0 })).toBe(false);
    expect(hasValidSpotCoordinates({ dxLat: 40, dxLon: Number.NaN })).toBe(false);
    expect(hasValidSpotCoordinates({ dxLat: 120, dxLon: 0 })).toBe(false);
    expect(hasValidSpotCoordinates({ dxLat: 40, dxLon: 240 })).toBe(false);
  });
});

describe("useViewSpotFocus", () => {
  it("focuses grid-only reports from the resolved runtime target", () => {
    const grid = dxSpot({ id: "grid-1", dxGrid: "GG87" });
    render(
      <ViewProvider ownerId="owner-a" slot="normal" storage={createMemoryWorkingStorage()}>
        <FocusHost spots={[grid]} select={grid} />
      </ViewProvider>,
    );
    expect(screen.getByTestId("focus").textContent).toBe("-22.5,-43,false");
  });

  it("focuses prefix-only reports as approximate", () => {
    const prefix = dxSpot({ id: "prefix-1", dx: "PY2ABC" });
    render(
      <ViewProvider ownerId="owner-a" slot="pro" storage={createMemoryWorkingStorage()}>
        <FocusHost spots={[prefix]} select={prefix} />
      </ViewProvider>,
    );
    const text = screen.getByTestId("focus").textContent ?? "";
    expect(text.endsWith(",true")).toBe(true);
    expect(text.startsWith("none")).toBe(false);
  });

  it("clears stale focus when switching to an unresolved selection", () => {
    const grid = dxSpot({ id: "grid-1", dxGrid: "GG87" });
    const { rerender } = render(
      <ViewProvider ownerId="owner-a" slot="lite" storage={createMemoryWorkingStorage()}>
        <FocusHost spots={[grid]} select={grid} />
      </ViewProvider>,
    );
    expect(screen.getByTestId("focus").textContent).not.toBe("none");
    rerender(
      <ViewProvider ownerId="owner-a" slot="lite" storage={createMemoryWorkingStorage()}>
        <FocusHost spots={[grid]} select="unresolved" />
      </ViewProvider>,
    );
    expect(screen.getByTestId("focus").textContent).toBe("none");
  });
});

describe("useViewSpotFocus with a stable spots reference", () => {
  it("does not refire the focus effect on unrelated re-renders (regression: inline [] retriggered focus every render)", () => {
    const grid = dxSpot({ id: "grid-1", dxGrid: "GG87" });
    const storage = createMemoryWorkingStorage();
    let effectRuns = 0;

    function FocusEffectProbe() {
      // Passing the module-level stable EMPTY_VIEW_SPOTS constant, exactly
      // like every production renderer, instead of an inline `[]` literal.
      const { focusedSpot } = useViewSpotFocus(EMPTY_VIEW_SPOTS);
      useEffect(() => {
        effectRuns += 1;
      }, [focusedSpot]);
      return (
        <span data-testid="focus">{focusedSpot ? focusedSpot.id : "none"}</span>
      );
    }

    function Host() {
      const runtime = useViewRuntime();
      useLayoutEffect(() => {
        commitViewSpotSelection(runtime, grid);
      }, [runtime]);
      return <FocusEffectProbe />;
    }

    const tree = (
      <ViewProvider ownerId="owner-a" slot="normal" storage={storage}>
        <Host />
      </ViewProvider>
    );
    const { rerender } = render(tree);
    expect(screen.getByTestId("focus").textContent).toBe("grid-1");

    // Force five unrelated parent re-renders. With a stable spots reference
    // the focused-spot identity must not change, so the effect keyed on it
    // must not run again.
    for (let i = 0; i < 5; i++) {
      rerender(tree);
    }

    expect(screen.getByTestId("focus").textContent).toBe("grid-1");
    // One run for the initial null focus, one for the resolved selection.
    // Additional runs would mean the focus effect (and its 5s timer) is
    // re-firing on every render, reproducing the infinite-loop regression.
    expect(effectRuns).toBe(2);
  });

  it("does not refire the focus effect when the parent passes a fresh inline [] each render", () => {
    const grid = dxSpot({ id: "grid-1", dxGrid: "GG87" });
    const storage = createMemoryWorkingStorage();
    let effectRuns = 0;

    function FocusEffectProbe() {
      const { focusedSpot } = useViewSpotFocus([]);
      useEffect(() => {
        effectRuns += 1;
      }, [focusedSpot]);
      return (
        <span data-testid="focus">{focusedSpot ? focusedSpot.id : "none"}</span>
      );
    }

    function Host() {
      const runtime = useViewRuntime();
      useLayoutEffect(() => {
        commitViewSpotSelection(runtime, grid);
      }, [runtime]);
      return <FocusEffectProbe />;
    }

    const tree = (
      <ViewProvider ownerId="owner-a" slot="normal" storage={storage}>
        <Host />
      </ViewProvider>
    );
    const { rerender } = render(tree);
    expect(screen.getByTestId("focus").textContent).toBe("grid-1");
    for (let i = 0; i < 20; i++) {
      rerender(tree);
    }
    expect(screen.getByTestId("focus").textContent).toBe("grid-1");
    expect(effectRuns).toBe(2);
  });

  it("updates focus when the resolved target coordinates change", () => {
    const grid = dxSpot({ id: "grid-1", dxGrid: "GG87", dxLat: -22.5, dxLon: -43 });
    const storage = createMemoryWorkingStorage();

    function FocusProbeLive() {
      const { focusedSpot } = useViewSpotFocus([grid]);
      return (
        <span data-testid="focus">
          {focusedSpot ? `${focusedSpot.dxLat},${focusedSpot.dxLon}` : "none"}
        </span>
      );
    }

    function Host({ lat, lon }: { lat: number; lon: number }) {
      const runtime = useViewRuntime();
      useLayoutEffect(() => {
        runtime.selectSpot(grid.id, { lat, lon });
      }, [runtime, lat, lon]);
      return <FocusProbeLive />;
    }

    const { rerender } = render(
      <ViewProvider ownerId="owner-a" slot="normal" storage={storage}>
        <Host lat={-22.5} lon={-43} />
      </ViewProvider>,
    );
    expect(screen.getByTestId("focus").textContent).toBe("-22.5,-43");
    rerender(
      <ViewProvider ownerId="owner-a" slot="normal" storage={storage}>
        <Host lat={41.7} lon={-72.7} />
      </ViewProvider>,
    );
    expect(screen.getByTestId("focus").textContent).toBe("41.7,-72.7");
  });

  it("focuses a manual target when no report is selected", () => {
    function ManualHost() {
      const runtime = useViewRuntime();
      useLayoutEffect(() => {
        runtime.setManualTarget({ lat: 41.7, lon: -72.7 });
      }, [runtime]);
      const { focusedSpot } = useViewSpotFocus([]);
      return (
        <span data-testid="focus">
          {focusedSpot
            ? `${focusedSpot.id},${focusedSpot.dxLat},${focusedSpot.dxLon}`
            : "none"}
        </span>
      );
    }

    render(
      <ViewProvider ownerId="owner-a" slot="normal" storage={createMemoryWorkingStorage()}>
        <ManualHost />
      </ViewProvider>,
    );
    expect(screen.getByTestId("focus").textContent).toBe(
      `${MANUAL_FOCUS_SPOT_ID},41.7,-72.7`,
    );
  });

  it("updates focus when a spot's spotter fields change without a coordinate/id change (regression: stale spotsFocusKey cache)", () => {
    const grid = dxSpot({
      id: "grid-1",
      dxGrid: "GG87",
      dxLat: -22.5,
      dxLon: -43,
      spotter: "K1ABC",
      spotterLat: 41.7,
      spotterLon: -72.7,
      spotterGrid: "FN31",
    });
    const storage = createMemoryWorkingStorage();

    function FocusProbeSpotter({ spots }: { spots: readonly DXSpot[] }) {
      const { focusedSpot } = useViewSpotFocus(spots);
      return (
        <span data-testid="focus">
          {focusedSpot
            ? `${focusedSpot.spotter},${focusedSpot.spotterLat},${focusedSpot.spotterLon},${focusedSpot.spotterGrid}`
            : "none"}
        </span>
      );
    }

    function Host({ spots }: { spots: readonly DXSpot[] }) {
      const runtime = useViewRuntime();
      useLayoutEffect(() => {
        commitViewSpotSelection(runtime, spots[0]!);
      }, [runtime, spots]);
      return <FocusProbeSpotter spots={spots} />;
    }

    const { rerender } = render(
      <ViewProvider ownerId="owner-a" slot="normal" storage={storage}>
        <Host spots={[grid]} />
      </ViewProvider>,
    );
    expect(screen.getByTestId("focus").textContent).toBe(
      "K1ABC,41.7,-72.7,FN31",
    );

    // Same id/dxLat/dxLon/dxGrid, but the spotter refreshed to a new location.
    const refreshed = { ...grid, spotter: "W2XYZ", spotterLat: 34.0, spotterLon: -118.2, spotterGrid: "DM04" };
    rerender(
      <ViewProvider ownerId="owner-a" slot="normal" storage={storage}>
        <Host spots={[refreshed]} />
      </ViewProvider>,
    );
    expect(screen.getByTestId("focus").textContent).toBe(
      "W2XYZ,34,-118.2,DM04",
    );
  });
});
