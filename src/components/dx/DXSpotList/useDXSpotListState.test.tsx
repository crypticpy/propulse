import { act, renderHook } from "@testing-library/react";
import { useLayoutEffect, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ViewProvider } from "@/components/views/ViewProvider";
import { useViewRuntime } from "@/components/views/ViewRuntimeContext";
import {
  createMemoryWorkingStorage,
  type ScopedViewRuntime,
  type WorkingSlotStorage,
} from "@/lib/views/runtime";
import { useDXStore } from "@/stores/dxStore";
import type { DXSpot } from "@/types/dxcluster";
import { useDXSpotListState } from "./useDXSpotListState";

vi.mock("@/hooks/useDXCluster", () => ({
  useDXCluster: () => ({
    spots: [],
    isLoading: false,
    isFetching: false,
    refetch: vi.fn(),
    lastUpdated: null,
    feedState: "idle",
  }),
  useDXSpotStats: () => ({}),
}));

vi.mock("@/hooks/useLogbook", () => ({
  useLogbook: () => ({
    isWorked: () => false,
    getWorkedBands: () => [],
  }),
}));

function dxSpot(overrides: Partial<DXSpot> = {}): DXSpot {
  return {
    id: "grid-1",
    spotter: "K1ABC",
    dx: "JA1XYZ",
    frequency: 14074,
    comment: "",
    time: new Date("2026-08-31T12:00:00Z"),
    dxGrid: "GG87",
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

describe("useDXSpotListState deselect contract (PR #603 round 5)", () => {
  afterEach(() => {
    useDXStore.setState({ selectedSpot: originalSelected, spots: originalSpots });
    capturedRuntime = null;
  });

  it("toggling the already-selected row off drives runtime interaction.selectedReportId to null", () => {
    const spot = dxSpot();
    useDXStore.setState({ spots: [spot], selectedSpot: spot });

    const storage = createMemoryWorkingStorage();
    const { result } = renderHook(() => useDXSpotListState(), {
      wrapper: makeWrapper(storage),
    });

    // Simulate the prior globe/list click that already wrote this selection
    // into the runtime -- the deselect path is only meaningful starting from
    // a runtime that already holds it.
    act(() => {
      capturedRuntime?.selectSpot(spot.id, null);
    });
    expect(capturedRuntime?.getSnapshot().interaction.selectedReportId).toBe(
      spot.id,
    );

    // Exercise the real handler under test -- not a re-implementation of it.
    act(() => {
      result.current.handleSelectSpot(spot);
    });

    expect(
      capturedRuntime?.getSnapshot().interaction.selectedReportId,
    ).toBeNull();
    // Legacy store write still happens alongside the runtime write.
    expect(useDXStore.getState().selectedSpot).toBeNull();
  });
});
