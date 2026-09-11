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
    expect(useMapStore.getState().target).toMatchObject({
      name: "JA1XYZ",
      grid: "GG87",
      approximate: false,
    });
  });

  it("writes the presentation label and a validated grid, matching the DX list (#861)", async () => {
    const spot: DXSpot = {
      id: "wall-spot-pota",
      spotter: "K1ABC",
      dx: "K5ABC",
      frequency: 14074,
      band: "20m",
      mode: "FT8",
      comment: "POTA US-1234 · Test Park",
      time: new Date(Date.now() - 60_000),
      dxGrid: "EM10",
    };
    useDXStore.setState({ spots: [spot], spotSource: "rest" });

    const user = userEvent.setup();
    render(
      <ViewProvider ownerId="owner-parity" slot="hamclock" storage={createMemoryWorkingStorage()}>
        <BandTopDx />
      </ViewProvider>,
    );

    await user.click(screen.getByRole("button", { name: /K5ABC/ }));

    expect(useMapStore.getState().target).toMatchObject({
      name: "K5ABC · POTA US-1234",
      grid: "EM10",
      approximate: false,
    });
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

  // #756 group 2: this site hard-coded `modes: []`, silently dropping the
  // bound view's mode selection (including the real one follow-radio
  // overlays from the operating radio).
  it("narrows to the bound view runtime's mode filter (#756 group 2)", () => {
    const spotCW: DXSpot = {
      id: "spot-cw", spotter: "K1ABC", dx: "CWCALL", frequency: 14000,
      band: "20m", mode: "CW", comment: "", time: new Date(Date.now() - 60_000),
      dxGrid: "GG87",
    };
    const spotFT8: DXSpot = {
      id: "spot-ft8", spotter: "K1ABC", dx: "FT8CALL", frequency: 14074,
      band: "20m", mode: "FT8", comment: "", time: new Date(Date.now() - 60_000),
      dxGrid: "GG87",
    };
    useDXStore.setState({ spots: [spotCW, spotFT8], spotSource: "rest" });

    let runtime: ScopedViewRuntime | null = null;
    function Capture() {
      runtime = useViewRuntime();
      return null;
    }

    render(
      <ViewProvider ownerId="owner-c" slot="hamclock" storage={createMemoryWorkingStorage()}>
        <Capture />
        <BandTopDx />
      </ViewProvider>,
    );

    expect(screen.getByRole("button", { name: /CWCALL/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /FT8CALL/ })).toBeTruthy();

    act(() => {
      const snapshot = runtime!.getSnapshot();
      runtime!.updateWorkingView({
        spots: {
          ...snapshot.config.spots,
          filters: {
            ...snapshot.config.spots.filters,
            modes: {
              all: false,
              categories: [],
              modes: ["CW"],
              includeUnknown: true,
              includeInferred: true,
            },
          },
        },
      });
    });

    expect(screen.getByRole("button", { name: /CWCALL/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /FT8CALL/ })).toBeNull();
  });

  // Review finding on #756: `all: true` alone was treated as "no restriction",
  // so `{ all: true, includeUnknown: false }` (reachable from the always-on
  // "Include unknown modes" toggle in ActivitySection) let unknown-mode spots
  // through instead of dropping them.
  it("still drops unknown-mode spots when all is true but includeUnknown is false", () => {
    const spotCW: DXSpot = {
      id: "spot-cw", spotter: "K1ABC", dx: "CWCALL", frequency: 14000,
      band: "20m", mode: "CW", comment: "", time: new Date(Date.now() - 60_000),
      dxGrid: "GG87",
    };
    const spotUnknown: DXSpot = {
      id: "spot-unknown", spotter: "K1ABC", dx: "UNKCALL", frequency: 14001,
      band: "20m", comment: "", time: new Date(Date.now() - 60_000),
      dxGrid: "GG87",
    };
    useDXStore.setState({ spots: [spotCW, spotUnknown], spotSource: "rest" });

    let runtime: ScopedViewRuntime | null = null;
    function Capture() {
      runtime = useViewRuntime();
      return null;
    }

    render(
      <ViewProvider ownerId="owner-d" slot="hamclock" storage={createMemoryWorkingStorage()}>
        <Capture />
        <BandTopDx />
      </ViewProvider>,
    );

    expect(screen.getByRole("button", { name: /CWCALL/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /UNKCALL/ })).toBeTruthy();

    act(() => {
      const snapshot = runtime!.getSnapshot();
      runtime!.updateWorkingView({
        spots: {
          ...snapshot.config.spots,
          filters: {
            ...snapshot.config.spots.filters,
            modes: {
              all: true,
              categories: [],
              modes: [],
              includeUnknown: false,
              includeInferred: true,
            },
          },
        },
      });
    });

    expect(screen.getByRole("button", { name: /CWCALL/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /UNKCALL/ })).toBeNull();
  });
});
