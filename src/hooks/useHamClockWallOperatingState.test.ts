import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { OPERATING_PROTOCOL_VERSION } from "@/lib/workspace/operatingChannel";
import { useMapStore } from "@/stores/mapStore";
import { useOperatingStateStore } from "@/stores/operatingStateStore";
import {
  HAMCLOCK_WALL_WORKSPACE_ID,
  useHamClockWallOperatingState,
} from "./useHamClockWallOperatingState";

function inboundTarget(
  senderId: string,
  callsign: string,
  grid: string | null,
  lat: number | null = null,
  lon: number | null = null,
) {
  return {
    v: OPERATING_PROTOCOL_VERSION,
    senderId,
    sentAt: Date.now(),
    kind: "state" as const,
    patch: {
      target: {
        value: { callsign, grid, lat, lon, spotId: null },
        at: Date.now(),
      },
    },
  };
}

beforeEach(() => {
  localStorage.clear();
  useOperatingStateStore.setState({ followScreens: true });
  useOperatingStateStore.getState().reset();
  useMapStore.setState({ target: null });
});

describe("useHamClockWallOperatingState", () => {
  it("registers the wall on the roster as unable to act, and withdraws on unmount", () => {
    const { unmount } = renderHook(() => useHamClockWallOperatingState());
    const deviceId = useOperatingStateStore.getState().deviceId;
    const key = `${deviceId}::${HAMCLOCK_WALL_WORKSPACE_ID}`;

    expect(useOperatingStateStore.getState().registrations[key]).toMatchObject({
      canvasType: "wall",
      capabilities: { canTune: false, canCommand: false },
    });

    unmount();
    expect(useOperatingStateStore.getState().registrations[key]).toBeUndefined();
  });

  it("moves the wall's map target when another screen's cursor changes, resolving a grid to a lat/lon", () => {
    renderHook(() => useHamClockWallOperatingState());

    act(() => {
      useOperatingStateStore.getState().applyMessage(inboundTarget("phone-device", "K1ABC", "EM10"));
    });

    const target = useMapStore.getState().target;
    expect(target).toMatchObject({ name: "K1ABC", grid: "EM10" });
    expect(target?.lat).toBeCloseTo(30.5, 1);
    expect(target?.lon).toBeCloseTo(-97, 1);
  });

  it("prefers lat/lon over the grid when both are present", () => {
    renderHook(() => useHamClockWallOperatingState());

    act(() => {
      useOperatingStateStore
        .getState()
        .applyMessage(inboundTarget("phone-device", "K1ABC", "EM10", 40.1, -74.2));
    });

    expect(useMapStore.getState().target).toMatchObject({ lat: 40.1, lon: -74.2 });
  });

  it("stops applying the inbound cursor once follow is switched off", () => {
    renderHook(() => useHamClockWallOperatingState());

    act(() => {
      useOperatingStateStore.getState().applyMessage(inboundTarget("phone-device", "K1ABC", "EM10"));
    });
    expect(useMapStore.getState().target?.name).toBe("K1ABC");

    act(() => {
      useOperatingStateStore.getState().setFollowScreens(false);
      useOperatingStateStore.getState().applyMessage(inboundTarget("phone-device", "W2XYZ", "FN20"));
    });

    expect(useMapStore.getState().target?.name).toBe("K1ABC");
  });
});
