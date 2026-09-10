import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useLayoutEffect, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ViewProvider } from "@/components/views/ViewProvider";
import { useViewRuntime } from "@/components/views/ViewRuntimeContext";
import {
  createMemoryWorkingStorage,
  type ScopedViewRuntime,
  type WorkingSlotStorage,
} from "@/lib/views/runtime";
import {
  ingestOperatingMonitorReportForTests,
  resetOperatingMonitorForTests,
} from "@/hooks/useOperatingMonitor";
import { getLocationFromPrefix } from "@/lib/data/prefixLocations";
import { useDXStore } from "@/stores/dxStore";
import { useKioskStore } from "@/stores/kioskStore";
import { useMapStore } from "@/stores/mapStore";
import type { DXSpot } from "@/types/dxcluster";
import { DXSpotList } from "./DXSpotList";

// The list's spots come from useDXCluster (network/query layer), not directly
// from useDXStore -- mock it so DXSpotList renders a real row for the L
// (Work) quick-action button without a live query.
let mockClusterSpots: DXSpot[] = [];

vi.mock("@/hooks/useDXCluster", () => ({
  useDXCluster: () => ({
    spots: mockClusterSpots,
    isLoading: false,
    isFetching: false,
    refetch: vi.fn(),
    lastUpdated: null,
    feedState: "idle",
  }),
  useDXSpotStats: () => ({
    total: mockClusterSpots.length,
    byBand: {},
    byMode: {},
    topEntity: undefined,
  }),
}));

// jsdom has no layout engine; the highlight-scroll effect calls this on
// select. Only its existence matters here, not what it does.
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = vi.fn();
}

vi.mock("@/hooks/useLogbook", () => ({
  useLogbook: () => ({
    isWorked: () => false,
    getWorkedBands: () => [],
  }),
}));

function dxSpot(overrides: Partial<DXSpot> = {}): DXSpot {
  return {
    id: "work-spot-1",
    spotter: "K1ABC",
    dx: "JA1XYZ",
    frequency: 14074,
    comment: "",
    time: new Date("2026-08-31T12:00:00Z"),
    dxLat: 35.6,
    dxLon: 139.7,
    ...overrides,
  };
}

let capturedRuntime: ScopedViewRuntime | null = null;

function RuntimeCapture() {
  const runtime = useViewRuntime();
  useLayoutEffect(() => {
    capturedRuntime = runtime;
  }, [runtime]);
  return null;
}

function makeWrapper(storage: WorkingSlotStorage) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <ViewProvider ownerId="owner-test" slot="normal" storage={storage}>
        <RuntimeCapture />
        {children}
      </ViewProvider>
    );
  };
}

const originalSelected = useDXStore.getState().selectedSpot;
const originalSpots = useDXStore.getState().spots;
const originalKiosk = useKioskStore.getState().active;

describe("DXSpotList Work quick-action (PR #603 round 7, F-1/F-2)", () => {
  afterEach(() => {
    useDXStore.setState({ selectedSpot: originalSelected, spots: originalSpots });
    useKioskStore.setState({ active: originalKiosk });
    mockClusterSpots = [];
    capturedRuntime = null;
  });

  it("clicking the L (Work) button routes selection through the runtime AND keeps the frame (target non-null)", async () => {
    const spot = dxSpot();
    mockClusterSpots = [spot];
    useDXStore.setState({ spots: [spot], selectedSpot: null });

    const storage = createMemoryWorkingStorage();
    render(<DXSpotList />, { wrapper: makeWrapper(storage) });

    const user = userEvent.setup();
    const workButton = await screen.findByRole("button", { name: `Work ${spot.dx}` });
    await user.click(workButton);

    // Routing: the runtime learns which report was worked.
    expect(capturedRuntime?.getSnapshot().interaction.selectedReportId).toBe(
      spot.id,
    );
    // Framing: Work must still move the camera/arc -- target must not be null.
    expect(capturedRuntime?.getSnapshot().interaction.target).not.toBeNull();
  });

  it("kiosk mode: Work is refused and neither runtime field moves (F-2)", async () => {
    const spot = dxSpot({ id: "work-spot-kiosk" });
    mockClusterSpots = [spot];
    useDXStore.setState({ spots: [spot], selectedSpot: null });
    useKioskStore.setState({ active: true });

    const storage = createMemoryWorkingStorage();
    render(<DXSpotList />, { wrapper: makeWrapper(storage) });

    const user = userEvent.setup();
    const workButton = await screen.findByRole("button", { name: `Work ${spot.dx}` });
    await user.click(workButton);

    expect(capturedRuntime?.getSnapshot().interaction.selectedReportId).toBeNull();
    expect(capturedRuntime?.getSnapshot().interaction.target).toBeNull();
  });
});

describe("DXSpotList band filter (SP-09 round 3 B1)", () => {
  afterEach(() => {
    useDXStore.setState({ spots: originalSpots });
    mockClusterSpots = [];
    capturedRuntime = null;
  });

  it("narrows to the bound view runtime's band filter, not mapStore.spotFilters", () => {
    const spot20 = dxSpot({ id: "spot-20", dx: "TWENTY", band: "20m" });
    const spot40 = dxSpot({ id: "spot-40", dx: "FORTY", band: "40m" });
    mockClusterSpots = [spot20, spot40];
    useDXStore.setState({ spots: [spot20, spot40] });

    const storage = createMemoryWorkingStorage();
    render(<DXSpotList />, { wrapper: makeWrapper(storage) });

    expect(screen.getByText("TWENTY")).toBeTruthy();
    expect(screen.getByText("FORTY")).toBeTruthy();

    act(() => {
      const snapshot = capturedRuntime!.getSnapshot();
      capturedRuntime!.updateWorkingView({
        spots: {
          ...snapshot.config.spots,
          filters: { ...snapshot.config.spots.filters, bands: ["20m"] },
        },
      });
    });

    expect(screen.getByText("TWENTY")).toBeTruthy();
    expect(screen.queryByText("FORTY")).toBeNull();
  });

  it("renders without a ViewProvider, since it also mounts bare on the /map/ops popout window", () => {
    // `DXSpotList` is reachable from `PropSphereOpsWindow` -> `OpsConsole`
    // with no `ViewProvider` above it. `useOptionalViewEffectiveSpots` must
    // fall back to unfiltered spots instead of throwing `useViewRuntime
    // requires ViewProvider`.
    const spot = dxSpot({ id: "bare-spot", dx: "BARE", band: "20m" });
    mockClusterSpots = [spot];
    useDXStore.setState({ spots: [spot] });

    render(<DXSpotList />);

    expect(screen.getByText("BARE")).toBeTruthy();
  });

  // #756 group 2: the three `modes: []` half-bindings dropped a REAL, live
  // mode restriction whenever follow-radio is active (`followSpotsFromRadio`
  // overlays a real mode selection derived from the radio, not just bands).
  it("narrows to the bound view runtime's mode filter", () => {
    const spotCW = dxSpot({ id: "spot-cw", dx: "CWCALL", band: "20m", mode: "CW" });
    const spotFT8 = dxSpot({ id: "spot-ft8", dx: "FT8CALL", band: "20m", mode: "FT8" });
    mockClusterSpots = [spotCW, spotFT8];
    useDXStore.setState({ spots: [spotCW, spotFT8] });

    const storage = createMemoryWorkingStorage();
    render(<DXSpotList />, { wrapper: makeWrapper(storage) });

    expect(screen.getByText("CWCALL")).toBeTruthy();
    expect(screen.getByText("FT8CALL")).toBeTruthy();

    act(() => {
      const snapshot = capturedRuntime!.getSnapshot();
      capturedRuntime!.updateWorkingView({
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

    expect(screen.getByText("CWCALL")).toBeTruthy();
    expect(screen.queryByText("FT8CALL")).toBeNull();
  });

  // Review finding on #756: `all: true` alone was treated as "no restriction",
  // so `{ all: true, includeUnknown: false }` (reachable from the always-on
  // "Include unknown modes" toggle in ActivitySection) let unknown-mode spots
  // through instead of dropping them.
  it("still drops unknown-mode spots when all is true but includeUnknown is false", () => {
    const spotCW = dxSpot({ id: "spot-cw", dx: "CWCALL", band: "20m", mode: "CW" });
    const spotUnknown = dxSpot({ id: "spot-unknown", dx: "UNKCALL", band: "20m", mode: undefined });
    mockClusterSpots = [spotCW, spotUnknown];
    useDXStore.setState({ spots: [spotCW, spotUnknown] });

    const storage = createMemoryWorkingStorage();
    render(<DXSpotList />, { wrapper: makeWrapper(storage) });

    expect(screen.getByText("CWCALL")).toBeTruthy();
    expect(screen.getByText("UNKCALL")).toBeTruthy();

    act(() => {
      const snapshot = capturedRuntime!.getSnapshot();
      capturedRuntime!.updateWorkingView({
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

    expect(screen.getByText("CWCALL")).toBeTruthy();
    expect(screen.queryByText("UNKCALL")).toBeNull();
  });
});

describe("DXSpotList follow-radio mode filter and clear (#756 groups 2 & 3)", () => {
  afterEach(() => {
    useDXStore.setState({ spots: originalSpots });
    mockClusterSpots = [];
    capturedRuntime = null;
    resetOperatingMonitorForTests();
  });

  it("drops off-mode spots while following the radio, not just off-band ones", () => {
    const spotCW20 = dxSpot({ id: "spot-cw-20", dx: "CWCALL", band: "20m", mode: "CW" });
    const spotFT820 = dxSpot({ id: "spot-ft8-20", dx: "FT8CALL", band: "20m", mode: "FT8" });
    mockClusterSpots = [spotCW20, spotFT820];
    useDXStore.setState({ spots: [spotCW20, spotFT820] });

    const storage = createMemoryWorkingStorage();
    render(<DXSpotList />, { wrapper: makeWrapper(storage) });

    act(() => {
      ingestOperatingMonitorReportForTests({
        sender: "radio-1",
        band: "20m",
        mode: "CW",
        frequency: 14_000,
      });
      const snapshot = capturedRuntime!.getSnapshot();
      capturedRuntime!.updateWorkingView({
        context: { ...snapshot.config.context, followRadio: true },
      });
    });

    // Both spots are on the followed band (20m); only the followed mode (CW)
    // should survive. Before the fix, the hard-coded `modes: []` let the
    // off-mode FT8 spot through.
    expect(screen.getByText("CWCALL")).toBeTruthy();
    expect(screen.queryByText("FT8CALL")).toBeNull();
  });

  it("clearing the filter also turns off follow-radio, instead of no-oping", async () => {
    const spotCW20 = dxSpot({ id: "spot-cw-20", dx: "CWCALL", band: "20m", mode: "CW" });
    const spotFT840 = dxSpot({ id: "spot-ft8-40", dx: "FT8CALL", band: "40m", mode: "FT8" });
    mockClusterSpots = [spotCW20, spotFT840];
    useDXStore.setState({ spots: [spotCW20, spotFT840] });

    const storage = createMemoryWorkingStorage();
    render(<DXSpotList />, { wrapper: makeWrapper(storage) });

    act(() => {
      ingestOperatingMonitorReportForTests({
        sender: "radio-1",
        band: "20m",
        mode: "CW",
        frequency: 14_000,
      });
      const snapshot = capturedRuntime!.getSnapshot();
      capturedRuntime!.updateWorkingView({
        context: { ...snapshot.config.context, followRadio: true },
      });
    });

    // Follow-radio is active: only the 20m/CW spot is visible.
    expect(screen.getByText("CWCALL")).toBeTruthy();
    expect(screen.queryByText("FT8CALL")).toBeNull();

    const user = userEvent.setup();
    await user.click(screen.getByTitle("Clear filter"));

    // The bug: `config.spots.filters` was already `{bands: [], modes: all}`
    // (follow never wrote to it), so patching it back to the same value was
    // a no-op, and follow-radio stayed on -- the click did nothing. The fix
    // must turn follow-radio off directly.
    expect(capturedRuntime!.getSnapshot().config.context.followRadio).toBe(false);
    expect(screen.getByText("CWCALL")).toBeTruthy();
    expect(screen.getByText("FT8CALL")).toBeTruthy();
  });
});

describe("DXSpotList set-target quick action (#845)", () => {
  const originalMapTarget = useMapStore.getState().target;

  afterEach(() => {
    useDXStore.setState({ spots: originalSpots, selectedSpot: originalSelected });
    useMapStore.setState({ target: originalMapTarget });
    mockClusterSpots = [];
    capturedRuntime = null;
  });

  // Positive control: with spots that resolve directly from dxLat/dxLon
  // (no grid-fallback involved), a second "Set as map target" click for a
  // different spot has always worked -- `mapStore.setTarget` is an
  // unconditional write (mapStore.ts:1537) and nothing clobbers it in this
  // harness. This guards against a future regression in that write path,
  // not the #845 bug itself (see the grid-fallback repro below for that).
  it("moves the map target to the second spot after a first target is already set", async () => {
    const spot1 = dxSpot({ id: "target-spot-1", dx: "JA1XYZ", dxLat: 35.6, dxLon: 139.7 });
    const spot2 = dxSpot({ id: "target-spot-2", dx: "VK2ABC", dxLat: -33.9, dxLon: 151.2 });
    mockClusterSpots = [spot1, spot2];
    useDXStore.setState({ spots: [spot1, spot2], selectedSpot: null });

    const storage = createMemoryWorkingStorage();
    render(<DXSpotList />, { wrapper: makeWrapper(storage) });

    const user = userEvent.setup();
    const setTargetButtons = await screen.findAllByRole("button", { name: "Set as map target" });
    expect(setTargetButtons).toHaveLength(2);

    // First click: sets the target to spot1. This is the "first target sets
    // fine" half of the owner's report -- a positive control.
    await user.click(setTargetButtons[0]);
    expect(useMapStore.getState().target).toMatchObject({ name: spot1.dx });

    // Second click: a *different* spot's row. The owner reports this does
    // nothing when a target is already set.
    await user.click(setTargetButtons[1]);
    expect(useMapStore.getState().target).toMatchObject({ name: spot2.dx });
  });

  // Real #845 repro (Opus review S5): a spot with neither dxLat/dxLon nor a
  // *valid* Maidenhead grid -- a malformed dxGrid like "JN4" from a cluster
  // feed. `gridToLatLon` (src/lib/utils/grid.ts:25) throws on a malformed
  // grid, it never returns null, so the old `if (coords)` guard around it
  // was dead code: the click handler threw inside `onClick` and the button
  // visibly did nothing, matching the owner's report with no wall/cursor
  // involvement at all.
  it("falls back to the callsign-prefix location instead of throwing when the grid is malformed", async () => {
    const spot = dxSpot({
      id: "bad-grid-spot",
      dx: "JA1XYZ",
      dxLat: undefined,
      dxLon: undefined,
      dxGrid: "JN4",
    });
    mockClusterSpots = [spot];
    useDXStore.setState({ spots: [spot], selectedSpot: null });

    const storage = createMemoryWorkingStorage();
    render(<DXSpotList />, { wrapper: makeWrapper(storage) });

    const user = userEvent.setup();
    const setTargetButton = await screen.findByRole("button", { name: "Set as map target" });

    await user.click(setTargetButton);

    // Callsign-prefix fallback for "JA1XYZ" resolves to Japan, not (0, 0)
    // and not left null by a swallowed throw.
    const target = useMapStore.getState().target;
    expect(target).not.toBeNull();
    expect(target?.name).toBe(spot.dx);
    expect(target?.lat).not.toBe(0);
    expect(target?.lon).not.toBe(0);
  });

  // The real production shape (Opus second-pass review S1/S2): the DX
  // cluster REST feed (api/_lib/handlers/spots.ts:36-47) maps rows without
  // ever setting dxGrid or dxLat/dxLon at all -- unlike the malformed-grid
  // case above, this is not a throw, it is both `if` branches of the old
  // chain being false, so the button was a silent no-op for every ordinary
  // DXCluster row on main, not just a junk-grid edge case.
  it("falls back to the callsign-prefix location for a grid-less, coordinate-less cluster spot", async () => {
    const spot = dxSpot({
      id: "cluster-no-location-spot",
      dx: "DL1ABC",
      dxLat: undefined,
      dxLon: undefined,
      dxGrid: undefined,
    });
    mockClusterSpots = [spot];
    useDXStore.setState({ spots: [spot], selectedSpot: null });

    // Derive the expected centroid from the same data source the fix reads,
    // rather than hardcoding coordinates from memory.
    const expectedLocation = getLocationFromPrefix("DL");
    expect(expectedLocation).not.toBeNull();

    const storage = createMemoryWorkingStorage();
    render(<DXSpotList />, { wrapper: makeWrapper(storage) });

    const user = userEvent.setup();
    const setTargetButton = await screen.findByRole("button", { name: "Set as map target" });

    await user.click(setTargetButton);

    const target = useMapStore.getState().target;
    expect(target).not.toBeNull();
    expect(target?.name).toBe(spot.dx);
    expect(target?.lat).toBe(expectedLocation?.lat);
    expect(target?.lon).toBe(expectedLocation?.lon);
  });
});
