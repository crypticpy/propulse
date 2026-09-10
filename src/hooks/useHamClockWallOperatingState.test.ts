import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OPERATING_PROTOCOL_VERSION } from "@/lib/workspace/operatingChannel";
import { useMapStore } from "@/stores/mapStore";
import { useOperatingStateStore } from "@/stores/operatingStateStore";
import { useOperationalWorkspaceSync } from "./useMapOperationalContext";
import {
  HAMCLOCK_WALL_WORKSPACE_ID,
  useHamClockWallOperatingState,
} from "./useHamClockWallOperatingState";

vi.mock("@/lib/supabase", () => ({
  getSupabase: vi.fn(),
  isSupabaseConfigured: false,
}));

/** Enough of `BroadcastChannel` to hand the sync hook a message. */
class TestChannel {
  static instances: TestChannel[] = [];
  onmessage: ((event: MessageEvent) => void) | null = null;
  postMessage = vi.fn();
  constructor() {
    TestChannel.instances.push(this);
  }
  close() {}
}

function inboundTarget(
  senderId: string,
  callsign: string,
  grid: string | null,
  lat: number | null = null,
  lon: number | null = null,
  /**
   * The *sending* device's clock. Defaults to this one's, i.e. no skew; the
   * skew tests pass a value hours away from it to model a phone whose clock
   * is wrong.
   */
  at: number = Date.now(),
) {
  return {
    v: OPERATING_PROTOCOL_VERSION,
    senderId,
    sentAt: Date.now(),
    kind: "state" as const,
    patch: {
      target: {
        value: { callsign, grid, lat, lon, spotId: null },
        at,
      },
    },
  };
}

/** A phone whose clock is a full day away from this browser's. */
const SKEW_MS = 24 * 60 * 60 * 1000;

beforeEach(() => {
  localStorage.clear();
  useOperatingStateStore.setState({ followScreens: true });
  useOperatingStateStore.getState().reset();
  useMapStore.setState({ target: null, targetSetAt: 0, isolateTargetPath: false });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  TestChannel.instances = [];
});

describe("useHamClockWallOperatingState", () => {
  it("does not overwrite a locally set map target with a stale cursor on mount", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-10T00:00:00Z"));

    // Cursor first, then a *later* local target write: the wall must keep
    // the local one when it (re)mounts.
    useOperatingStateStore
      .getState()
      .applyMessage(inboundTarget("phone-device", "K1ABC", "EM10"));
    vi.advanceTimersByTime(60_000);
    useMapStore.getState().setTarget({ lat: 40, lon: -80, name: "W3ABC" });
    useMapStore.setState({ isolateTargetPath: true });

    renderHook(() => useHamClockWallOperatingState());

    expect(useMapStore.getState().target).toMatchObject({ name: "W3ABC", lat: 40, lon: -80 });
    expect(useMapStore.getState().isolateTargetPath).toBe(true);
  });

  it("applies a cursor that advanced while the wall was unmounted", () => {
    // The app-level `OperatingTransportHost` keeps running while HamClock is
    // off screen (layout-mode toggle, navigate away from `/map`), so another
    // screen can move the cursor with no subscription here to hear it. On
    // remount the newer cursor must win, or the map disagrees with
    // `HamClockWallCursorChip` for the rest of the session (#859).
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-10T00:00:00Z"));

    useOperatingStateStore
      .getState()
      .applyMessage(inboundTarget("phone-device", "K1ABC", "EM10"));

    const first = renderHook(() => useHamClockWallOperatingState());
    expect(useMapStore.getState().target?.name).toBe("K1ABC");

    first.unmount();

    vi.advanceTimersByTime(60_000);
    act(() => {
      useOperatingStateStore
        .getState()
        .applyMessage(inboundTarget("phone-device", "W2XYZ", "FN20"));
    });
    // No subscription while unmounted: the map is still on the old target.
    expect(useMapStore.getState().target?.name).toBe("K1ABC");

    renderHook(() => useHamClockWallOperatingState());

    const target = useMapStore.getState().target;
    expect(target).toMatchObject({ name: "W2XYZ", grid: "FN20" });
    expect(target?.lat).toBeCloseTo(40.5, 1);
    expect(target?.lon).toBeCloseTo(-75, 1);
  });

  it("applies a cursor stamped by a device whose clock runs behind", () => {
    // The wire `at` is the *sending* device's `Date.now()`. A phone a day
    // behind stamps a cursor it sent seconds ago with yesterday's time, so a
    // reconcile against `at` would call the freshest cursor in the session
    // older than a map target picked minutes ago and ignore it forever
    // (#859 round 3). What matters here is when the cursor arrived on *this*
    // screen, which is what `appliedAt` records.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-10T00:00:00Z"));

    useMapStore.getState().setTarget({ lat: 40, lon: -80, name: "W3ABC" });

    vi.advanceTimersByTime(5_000);
    useOperatingStateStore
      .getState()
      .applyMessage(
        inboundTarget("slow-phone", "K1ABC", "EM10", null, null, Date.now() - SKEW_MS),
      );

    renderHook(() => useHamClockWallOperatingState());

    expect(useMapStore.getState().target).toMatchObject({ name: "K1ABC", grid: "EM10" });
  });

  it("keeps a newer local target over a cursor from a device whose clock runs ahead", () => {
    // The mirror image: a phone a day ahead stamps every cursor with a time
    // no local write can beat, so a reconcile against `at` would let a cursor
    // this screen took minutes ago clobber the target the operator just
    // picked here.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-10T00:00:00Z"));

    useOperatingStateStore
      .getState()
      .applyMessage(
        inboundTarget("fast-phone", "K1ABC", "EM10", null, null, Date.now() + SKEW_MS),
      );

    vi.advanceTimersByTime(5_000);
    useMapStore.getState().setTarget({ lat: 40, lon: -80, name: "W3ABC" });

    renderHook(() => useHamClockWallOperatingState());

    expect(useMapStore.getState().target).toMatchObject({ name: "W3ABC", lat: 40, lon: -80 });
  });

  it("keeps a target synced from a pop-out window over an older cursor", async () => {
    // The three-step race (#859 round 2): the wall unmounts, the cursor
    // advances on a phone, and *then* a target is picked in the synchronized
    // pop-out window. The pop-out's target arrives through
    // `useOperationalWorkspaceSync`, which applies it with `setState` rather
    // than `setTarget` — so it has to carry its own `targetSetAt`, or the
    // wall's remount reconcile reads the previous target's stamp and lets
    // the older cursor win.
    vi.stubGlobal("BroadcastChannel", TestChannel);
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-10T00:00:00Z"));

    const sync = renderHook(() => useOperationalWorkspaceSync());
    await act(async () => {
      await Promise.resolve();
    });
    const [channel] = TestChannel.instances;

    useOperatingStateStore
      .getState()
      .applyMessage(inboundTarget("phone-device", "K1ABC", "EM10"));
    const wall = renderHook(() => useHamClockWallOperatingState());
    expect(useMapStore.getState().target?.name).toBe("K1ABC");
    const wallTarget = useMapStore.getState().target;
    const wallStamp = useMapStore.getState().targetSetAt;

    wall.unmount();

    // 1. cursor advances while the wall is unmounted
    vi.advanceTimersByTime(60_000);
    act(() => {
      useOperatingStateStore
        .getState()
        .applyMessage(inboundTarget("phone-device", "W2XYZ", "FN20"));
    });

    // 2. the pop-out picks a target *after* that. Its snapshot is produced by
    // the real publisher rather than hand-written, so this test fails if the
    // stamp stops travelling with the target.
    vi.advanceTimersByTime(60_000);
    act(() => {
      useMapStore.getState().setTarget({ lat: -20, lon: -45, name: "PY5DX" });
    });
    await act(async () => {
      await Promise.resolve();
    });
    const mapSnapshots = channel.postMessage.mock.calls
      .map(([message]) => message as { domain: string; sender: string })
      .filter((message) => message.domain === "map");
    const published = mapSnapshots[mapSnapshots.length - 1];
    expect(published).toBeDefined();

    // Rewind this window to where it stood before that write, so the snapshot
    // arrives the way the wall's window would actually receive it.
    useMapStore.setState({ target: wallTarget, targetSetAt: wallStamp });
    act(() => {
      channel.onmessage?.({
        data: { ...published, sender: "pop-out-window" },
      } as MessageEvent);
    });
    expect(useMapStore.getState().target?.name).toBe("PY5DX");

    // 3. the wall remounts and must keep the pop-out's newer pick
    renderHook(() => useHamClockWallOperatingState());

    expect(useMapStore.getState().target).toMatchObject({ name: "PY5DX" });
    sync.unmount();
  });

  it("does not clear the map target when a newer cursor carries no location", () => {
    // A callsign-only pick from a screen with no location data yet resolves
    // to no map location; that is not an instruction to clear the map (and
    // `setTarget(null)` would reset `isolateTargetPath`).
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-10T00:00:00Z"));

    useMapStore.getState().setTarget({ lat: 40, lon: -80, name: "W3ABC" });
    useMapStore.setState({ isolateTargetPath: true });
    vi.advanceTimersByTime(60_000);
    useOperatingStateStore.getState().applyMessage(inboundTarget("phone-device", "K1ABC", null));

    renderHook(() => useHamClockWallOperatingState());

    expect(useMapStore.getState().target).toMatchObject({ name: "W3ABC" });
    expect(useMapStore.getState().isolateTargetPath).toBe(true);
  });

  it("applies a non-null cursor on mount when the map has no target yet", () => {
    useOperatingStateStore
      .getState()
      .applyMessage(inboundTarget("phone-device", "K1ABC", "EM10"));

    renderHook(() => useHamClockWallOperatingState());

    const target = useMapStore.getState().target;
    expect(target).toMatchObject({ name: "K1ABC", grid: "EM10" });
    expect(target?.lat).toBeCloseTo(30.5, 1);
    expect(target?.lon).toBeCloseTo(-97, 1);
  });

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
