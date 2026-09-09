import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useLayoutEffect } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ViewProvider } from "@/components/views/ViewProvider";
import { useViewRuntime } from "@/components/views/ViewRuntimeContext";
import { createMemoryWorkingStorage } from "@/lib/views/runtime";
import { useBoundSelectedReportId } from "@/hooks/useBoundMapSelection";
import { useDXStore } from "@/stores/dxStore";
import { useMapStore } from "@/stores/mapStore";
import type { DXSpot } from "@/types/dxcluster";
import { BandTopDx } from "./BandTopDx";

vi.mock("@/hooks/useActiveLocation", () => ({
  useActiveLocation: () => ({ lat: 41.7, lon: -72.7, grid: "FN31pr" }),
}));

function IdProbe() {
  return (
    <span data-testid="bound-id">{useBoundSelectedReportId() ?? "none"}</span>
  );
}

/** Simulates a prior globe click: this runtime already holds a selection. */
function PresetSelection({ id }: { id: string }) {
  const runtime = useViewRuntime();
  useLayoutEffect(() => {
    runtime.selectSpot(id, { lat: 1, lon: 2 });
  }, [runtime, id]);
  return null;
}

const originalSpots = useDXStore.getState().spots;
const originalSource = useDXStore.getState().spotSource;
const originalSelected = useDXStore.getState().selectedSpot;
const originalFilters = useMapStore.getState().spotFilters;
const originalTarget = useMapStore.getState().target;
const originalCenterLocation = useMapStore.getState().centerLocation;

describe("BandTopDx", () => {
  afterEach(() => {
    useDXStore.setState({
      spots: originalSpots,
      spotSource: originalSource,
      selectedSpot: originalSelected,
    });
    useMapStore.setState({
      spotFilters: originalFilters,
      target: originalTarget,
      centerLocation: originalCenterLocation,
    });
  });

  it("routes the wall row click through the runtime, so a later selection overrides an earlier one (PR #603 B1)", async () => {
    const spot: DXSpot = {
      id: "wall-spot-1",
      spotter: "K1ABC",
      dx: "JA1XYZ",
      frequency: 14074,
      band: "20m",
      mode: "FT8",
      comment: "",
      time: new Date(Date.now() - 60_000),
      dxGrid: "GG87",
    };
    useDXStore.setState({ spots: [spot], spotSource: "rest" });
    useMapStore.setState({ spotFilters: { bands: [], modes: [] } });

    const user = userEvent.setup();
    render(
      <ViewProvider ownerId="owner-a" slot="hamclock" storage={createMemoryWorkingStorage()}>
        <PresetSelection id="spot-a" />
        <IdProbe />
        <BandTopDx />
      </ViewProvider>,
    );

    // Before the click, this runtime holds an unrelated prior selection.
    expect(screen.getByTestId("bound-id").textContent).toBe("spot-a");

    await user.click(screen.getByRole("button", { name: /JA1XYZ/ }));

    // The legacy dxStore write still happens...
    expect(useDXStore.getState().selectedSpot?.id).toBe("wall-spot-1");
    // ...and the runtime-bound reader must follow it, not the stale preset.
    expect(screen.getByTestId("bound-id").textContent).toBe("wall-spot-1");
  });
});
