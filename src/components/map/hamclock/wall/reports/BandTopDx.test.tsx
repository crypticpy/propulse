import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useLayoutEffect } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ViewProvider } from "@/components/views/ViewProvider";
import { useViewRuntime } from "@/components/views/ViewRuntimeContext";
import { createMemoryWorkingStorage, type ScopedViewRuntime } from "@/lib/views/runtime";
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

  it("narrows to the bound view runtime's band filter, not mapStore.spotFilters (SP-09 round 3 B1)", () => {
    const spot20: DXSpot = {
      id: "spot-20", spotter: "K1ABC", dx: "TWENTY", frequency: 14074,
      band: "20m", mode: "FT8", comment: "", time: new Date(Date.now() - 60_000),
      dxGrid: "GG87",
    };
    const spot40: DXSpot = {
      id: "spot-40", spotter: "K1ABC", dx: "FORTY", frequency: 7074,
      band: "40m", mode: "FT8", comment: "", time: new Date(Date.now() - 60_000),
      dxGrid: "GG87",
    };
    useDXStore.setState({ spots: [spot20, spot40], spotSource: "rest" });

    let runtime: ScopedViewRuntime | null = null;
    function Capture() {
      runtime = useViewRuntime();
      return null;
    }

    render(
      <ViewProvider ownerId="owner-b" slot="hamclock" storage={createMemoryWorkingStorage()}>
        <Capture />
        <BandTopDx />
      </ViewProvider>,
    );

    expect(screen.getByRole("button", { name: /TWENTY/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /FORTY/ })).toBeTruthy();

    act(() => {
      const snapshot = runtime!.getSnapshot();
      runtime!.updateWorkingView({
        spots: {
          ...snapshot.config.spots,
          filters: { ...snapshot.config.spots.filters, bands: ["20m"] },
        },
      });
    });

    expect(screen.getByRole("button", { name: /TWENTY/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /FORTY/ })).toBeNull();
  });
});
