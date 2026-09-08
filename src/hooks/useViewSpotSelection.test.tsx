import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ReactNode } from "react";
import { ViewProvider } from "@/components/views/ViewProvider";
import { createMemoryWorkingStorage } from "@/lib/views/runtime";
import { DEFAULT_UI_INTERACTION } from "@/types/user";
import { useDXStore } from "@/stores/dxStore";
import { useKioskStore } from "@/stores/kioskStore";
import { useMapStore } from "@/stores/mapStore";
import { useRigStore } from "@/stores/rigStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { useViewSpotSelection } from "./useMapSpotSelection";
import type { DXSpot } from "@/types/dxcluster";

function dxSpot(overrides: Partial<DXSpot> = {}): DXSpot {
  return {
    id: "spot-1",
    spotter: "K1ABC",
    dx: "JA1XYZ",
    frequency: 14074,
    mode: "FT8",
    comment: "",
    time: new Date("2026-08-31T12:00:00Z"),
    dxLat: 35,
    dxLon: 139,
    ...overrides,
  };
}

function wrapper({ children }: { children: ReactNode }) {
  return (
    <ViewProvider
      ownerId="owner-a"
      slot="normal"
      storage={createMemoryWorkingStorage()}
    >
      {children}
    </ViewProvider>
  );
}

describe("useViewSpotSelection", () => {
  const originalDx = useDXStore.getState().selectedSpot;
  const originalTarget = useMapStore.getState().target;

  beforeEach(() => {
    useKioskStore.setState({ active: false });
    useRigStore.setState({ pendingFrequency: null, pendingMode: null });
    useSettingsStore.setState({
      uiInteraction: { ...DEFAULT_UI_INTERACTION, spotClickTunesRadio: true },
    });
  });

  afterEach(() => {
    useSettingsStore.setState({
      uiInteraction: { ...DEFAULT_UI_INTERACTION, spotClickTunesRadio: false },
    });
    useRigStore.setState({ pendingFrequency: null, pendingMode: null });
  });

  it("keeps selection scoped and still honors Click to Tune", () => {
    const { result } = renderHook(() => useViewSpotSelection(), { wrapper });
    act(() => {
      result.current(dxSpot());
    });
    expect(useRigStore.getState().pendingFrequency).toBe(14_074_000);
    expect(useDXStore.getState().selectedSpot).toBe(originalDx);
    expect(useMapStore.getState().target).toBe(originalTarget);
  });
});
