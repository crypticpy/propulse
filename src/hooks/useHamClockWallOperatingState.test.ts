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
  it("does not clear a locally set map target when nothing has been shared yet", () => {
    // The wall's own reports write `mapStore.target` (BandTopDx,
    // RecentContactsReport, QuickTargets). An empty shared cursor means
    // "nothing shared", not "clear the map" — and `setTarget(null)` would
    // also reset `isolateTargetPath`.
    useMapStore.setState({ target: { lat: 40, lon: -80, name: "W3ABC" }, isolateTargetPath: true });

    renderHook(() => useHamClockWallOperatingState());

    expect(useMapStore.getState().target).toMatchObject({ name: "W3ABC" });
    expect(useMapStore.getState().isolateTargetPath).toBe(true);
  });

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

  it("does not clobber a fresh DX-page target with the stale cursor on remount (#845)", () => {
    // Simulate: operator set a target on /map earlier (also recorded on the
    // shared cursor, e.g. via a spot pick that calls
    // `operatingStateStore.selectSpot`), then went to the DX panel and used
    // "Set as map target" there. `useDXSpotListState`'s
    // `handleContextAction("setTarget", ...)` now writes `mapStore.target`
    // AND the operating cursor together (#845 fix), so the cursor always
    // agrees with the most recent target regardless of who wrote it last.
    // Returning to /map remounts `HamClockView`, and with it this hook.
    act(() => {
      useOperatingStateStore.getState().setTarget({
        callsign: "W1OLD",
        grid: "FN20",
        lat: null,
        lon: null,
        spotId: null,
      });
    });
    useMapStore.setState({ target: { lat: 40.1, lon: -74.2, name: "W1OLD", grid: "FN20" } });

    // The DX page's writer: `mapStore.setTarget` AND the operating cursor,
    // for a different station.
    act(() => {
      useMapStore.getState().setTarget({ lat: -33.9, lon: 151.2, name: "VK2ABC", grid: "QF56" });
      useOperatingStateStore.getState().setTarget({
        callsign: "VK2ABC",
        grid: "QF56",
        lat: -33.9,
        lon: 151.2,
        spotId: "spot-2",
      });
    });
    expect(useMapStore.getState().target).toMatchObject({ name: "VK2ABC" });

    // Positive control: the first mount (nothing shared yet, matches the
    // "no target set yet" branch) must not disturb a locally-set target either.
    const first = renderHook(() => useHamClockWallOperatingState());
    expect(useMapStore.getState().target).toMatchObject({ name: "VK2ABC" });
    first.unmount();

    // Returning to /map: HamClockView (and this hook) remounts. The stale
    // cursor target (W1OLD) must not overwrite the DX page's fresh write.
    renderHook(() => useHamClockWallOperatingState());

    expect(useMapStore.getState().target).toMatchObject({ name: "VK2ABC" });
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
