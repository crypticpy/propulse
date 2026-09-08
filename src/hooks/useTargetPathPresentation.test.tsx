import { renderHook } from "@testing-library/react";
import { useLayoutEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { ViewProvider } from "@/components/views/ViewProvider";
import { createMemoryWorkingStorage } from "@/lib/views/runtime";
import { useViewRuntime } from "@/components/views/ViewRuntimeContext";
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
  useActiveFrequency: () => 7_074_000,
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
  });

  it("traces the bound report instead of a leftover global pin", () => {
    renderHook(() => usePathWithSelection(true), { wrapper: wrapper() });
    expect(traces.at(-1)).toMatchObject({
      endLat: 35,
      endLon: 139,
      frequencyMHz: 14.074,
    });
    expect(useMapStore.getState().target).toMatchObject({ lat: 51.5, lon: -0.1 });
    expect(useDXStore.getState().selectedSpot).toBeNull();
  });

  it("traces a bound selection when the global target is empty", () => {
    useMapStore.setState({ target: null });
    const rendered = renderHook(() => usePathWithSelection(true), {
      wrapper: wrapper(),
    });
    expect(rendered.result.current.showRayPath).toBe(true);
    expect(traces.at(-1)).toMatchObject({ endLat: 35, endLon: 139 });
  });
});
