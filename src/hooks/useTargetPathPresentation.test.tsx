import { renderHook } from "@testing-library/react";
import { useLayoutEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { ViewProvider } from "@/components/views/ViewProvider";
import { createMemoryWorkingStorage } from "@/lib/views/runtime";
import { useViewRuntime } from "@/components/views/ViewRuntimeContext";
import { useActiveFrequency } from "@/hooks/useActiveBandMode";
import { useDXStore } from "@/stores/dxStore";
import { useMapStore } from "@/stores/mapStore";
import { useUserStore } from "@/stores/userStore";
import { useTargetPathPresentation } from "./useTargetPathPresentation";

const traces: Array<{ endLat: number; endLon: number; frequencyMHz: number }> =
  [];

vi.mock("@/hooks/useMapOperationalContext", () => ({
  useScopedMapLayers: () => ({ rayPath: true }),
}));
vi.mock("@/hooks/useMUFData", () => ({ useCurrentSFI: () => 100 }));
vi.mock("@/hooks/useSolarData", () => ({
  useKIndex: () => ({ data: [{ kp_index: 2 }] }),
}));
vi.mock("@/hooks/useActiveBandMode", () => ({
  useActiveFrequency: vi.fn(() => 7_074_000),
}));
vi.mock("@/lib/utils/rayTrace", () => ({
  traceRayPath: (args: {
    endLat: number;
    endLon: number;
    frequencyMHz: number;
  }) => {
    traces.push({
      endLat: args.endLat,
      endLon: args.endLon,
      frequencyMHz: args.frequencyMHz,
    });
    return { hops: [] };
  },
}));

const originalDx = useDXStore.getState();
const originalMap = useMapStore.getState();

function wrapper(storage = createMemoryWorkingStorage()) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <ViewProvider ownerId="owner-a" slot="normal" storage={storage}>
        {children}
      </ViewProvider>
    );
  };
}

function usePathWithSelection(selectJapan: boolean) {
  const runtime = useViewRuntime();
  useLayoutEffect(() => {
    if (selectJapan) runtime.selectSpot("grid-1", { lat: 35, lon: 139 });
  }, [runtime, selectJapan]);
  return useTargetPathPresentation(new Date("2026-09-07T12:00:00Z"));
}

describe("useTargetPathPresentation", () => {
  beforeEach(() => {
    traces.length = 0;
    useUserStore.getState().setStation({
      callsign: "N0CALL",
      homeLocationId: "home",
      activeLocationId: "home",
      savedLocations: [],
      grid: "EM10",
      lat: 30,
      lon: -97,
    });
    useMapStore.setState({
      target: { lat: 51.5, lon: -0.1, grid: "IO91", name: "London" },
      pathMode: "short",
      isolateTargetPath: false,
    });
    useDXStore.setState({
      ...originalDx,
      spots: [
        {
          id: "grid-1",
          spotter: "K1ABC",
          dx: "JA1XYZ",
          frequency: 14074,
          comment: "",
          time: new Date("2026-09-07T12:00:00Z"),
          dxLat: 35,
          dxLon: 139,
        },
      ],
      selectedSpot: null,
    });
  });

  afterEach(() => {
    useDXStore.setState(originalDx);
    useMapStore.setState(originalMap);
    useUserStore.getState().setStation(null);
    vi.mocked(useActiveFrequency).mockReturnValue(7_074_000);
  });

  it("traces the map store target, not a stale runtime-bound selection (#707)", () => {
    // mapStore remains the single visual target for now — see
    // useBoundVisualTarget in useBoundMapSelection.ts. A runtime-only bound
    // selection (simulated here without the additive mapStore write that
    // commitViewSpotSelection now performs) must not shadow the London pin
    // already on mapStore, or PathAnalysis would draw to the wrong place.
    renderHook(() => usePathWithSelection(true), { wrapper: wrapper() });
    expect(traces.at(-1)).toMatchObject({
      endLat: 51.5,
      endLon: -0.1,
    });
    expect(useMapStore.getState().target).toMatchObject({ lat: 51.5, lon: -0.1 });
    expect(useDXStore.getState().selectedSpot).toBeNull();
  });

  it("does not trace when the global target is empty, even with a bound selection (#707)", () => {
    useMapStore.setState({ target: null });
    const rendered = renderHook(() => usePathWithSelection(true), {
      wrapper: wrapper(),
    });
    expect(rendered.result.current.showRayPath).toBe(false);
    expect(traces.length).toBe(0);
  });

  it("traces the clicked spot's own band, not the rig's dial frequency (NEW-1 regression)", () => {
    // Every clickable spot on the globe/flat/azimuthal comes from
    // useLiveSpots (PSKReporter/RBN/WSJT-X), not dxStore.spots (DX-cluster
    // only). Resolving the selected spot by id from dxStore.spots silently
    // misses those spots and falls through to the rig's dial frequency —
    // wrong hops, wrong MUF verdict, wrong label. The selected spot must be
    // read from dxStore.selectedSpot (already resolved by the click
    // handler), not re-resolved by id.
    vi.mocked(useActiveFrequency).mockReturnValue(14_074_000);
    useDXStore.setState({
      ...useDXStore.getState(),
      selectedSpot: {
        id: "live-1",
        spotter: "K1ABC",
        dx: "JA1XYZ",
        frequency: 7074,
        comment: "",
        time: new Date("2026-09-07T12:00:00Z"),
        dxLat: 51.5,
        dxLon: -0.1,
      },
    });
    const rendered = renderHook(
      () => useTargetPathPresentation(new Date("2026-09-07T12:00:00Z")),
      { wrapper: wrapper() },
    );
    expect(rendered.result.current.showRayPath).toBe(true);
    expect(traces.at(-1)).toMatchObject({ frequencyMHz: 7.074 });
  });
});
