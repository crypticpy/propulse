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
  // No write sequence on the wire (#859 round 11): the sender may be another
  // device, whose counter orders nothing here. The receiving window numbers
  // the write when it applies it.
  return {
    v: OPERATING_PROTOCOL_VERSION,
    senderId,
    sentAt: Date.now(),
    kind: "state" as const,
    patch: {
      target: {
        value: { callsign, grid, lat, lon, spotId: null },
        at,
        by: senderId,
      },
    },
  };
}

/**
 * A `hello` reply: a peer re-announcing a write it heard from someone else.
 * `at` and `by` are the original author's; only the envelope's `senderId` is
 * the relaying peer's.
 */
function relayedTarget(
  relayId: string,
  author: string,
  callsign: string,
  grid: string | null,
  at: number,
) {
  return {
    v: OPERATING_PROTOCOL_VERSION,
    senderId: relayId,
    sentAt: Date.now(),
    kind: "state" as const,
    patch: {
      target: {
        value: { callsign, grid, lat: null, lon: null, spotId: null },
        at,
        by: author,
      },
    },
  };
}

/**
 * A `hello` reply from a tab on a bundle older than #859 round 5: the wire
 * had no way to name an author, so the entry carries only a value and a
 * stamp.
 */
function authorlessRelay(
  relayId: string,
  callsign: string,
  grid: string | null,
  at: number,
) {
  return {
    v: OPERATING_PROTOCOL_VERSION,
    senderId: relayId,
    sentAt: Date.now(),
    kind: "state" as const,
    patch: {
      target: {
        value: { callsign, grid, lat: null, lon: null, spotId: null },
        at,
      },
    },
  };
}

/**
 * The two messages one tap on a spot sends (#859 round 17): the cursor write
 * as a state patch, and the command for the screens that act on a selection.
 * Both describe the same write, so both carry the stamp `writeField` minted —
 * the envelope's `sentAt` is later on the command, and deliberately so here,
 * because that lateness is exactly what used to make it look like a second
 * write.
 */
function spotSelection(
  senderId: string,
  callsign: string,
  grid: string,
  spotId: string,
  at: number,
) {
  const spot = {
    id: spotId,
    callsign,
    band: null,
    frequency: null,
    mode: null,
    grid,
  };
  return {
    patch: {
      v: OPERATING_PROTOCOL_VERSION,
      senderId,
      sentAt: at,
      kind: "state" as const,
      patch: {
        target: {
          value: { callsign, grid, lat: null, lon: null, spotId },
          at,
          by: senderId,
        },
      },
    },
    command: {
      v: OPERATING_PROTOCOL_VERSION,
      senderId,
      // The other pipe, delivered later: the bug was reading this as the
      // write time.
      sentAt: at + 250,
      kind: "command" as const,
      command: { type: "selectSpot" as const, spot, at },
    },
  };
}

/**
 * A live selection broadcast from another window of this app — `trigger:
 * "update"`, which is what separates a real pick from the republish every
 * peer sends when a window joins (#859 round 15).
 */
function livePick(sender: string, at: number) {
  return {
    data: {
      kind: "snapshot",
      sender,
      revision: 1,
      triggers: { map: "update" },
      domains: {
        map: { target: { lat: -20, lon: -45, name: "PY5DX" }, targetSetAt: at },
      },
    },
  } as MessageEvent;
}

/** A phone whose clock is a full day away from this browser's. */
const SKEW_MS = 24 * 60 * 60 * 1000;

beforeEach(() => {
  localStorage.clear();
  useOperatingStateStore.setState({ followScreens: true });
  useOperatingStateStore.getState().reset();
  useMapStore.setState({
    target: null,
    targetSetAt: 0,
    targetSeq: undefined,
    isolateTargetPath: false,
  });
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

    expect(useMapStore.getState().target).toMatchObject({
      name: "W3ABC",
      lat: 40,
      lon: -80,
    });
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
        inboundTarget(
          "slow-phone",
          "K1ABC",
          "EM10",
          null,
          null,
          Date.now() - SKEW_MS,
        ),
      );

    renderHook(() => useHamClockWallOperatingState());

    expect(useMapStore.getState().target).toMatchObject({
      name: "K1ABC",
      grid: "EM10",
    });
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
        inboundTarget(
          "fast-phone",
          "K1ABC",
          "EM10",
          null,
          null,
          Date.now() + SKEW_MS,
        ),
      );

    vi.advanceTimersByTime(5_000);
    useMapStore.getState().setTarget({ lat: 40, lon: -80, name: "W3ABC" });

    renderHook(() => useHamClockWallOperatingState());

    expect(useMapStore.getState().target).toMatchObject({
      name: "W3ABC",
      lat: 40,
      lon: -80,
    });
  });

  it("applies a cursor that arrived after a local target write in the same millisecond", () => {
    // `Date.now()` is not fine enough to order these (#859 round 4): a local
    // pick and a cursor arriving over the transport can be processed in one
    // event-loop turn, and on equal stamps a strict `>` keeps the older map
    // target. The write sequence breaks the tie by what happened second.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-10T00:00:00Z"));

    useMapStore.getState().setTarget({ lat: 40, lon: -80, name: "W3ABC" });
    useOperatingStateStore
      .getState()
      .applyMessage(inboundTarget("phone-device", "K1ABC", "EM10"));

    // Same millisecond on both sides: only the sequence can order them.
    expect(useOperatingStateStore.getState().stamps.target.appliedAt).toBe(
      useMapStore.getState().targetSetAt,
    );

    renderHook(() => useHamClockWallOperatingState());

    expect(useMapStore.getState().target).toMatchObject({
      name: "K1ABC",
      grid: "EM10",
    });
  });

  it("keeps a local target written after a cursor arrival in the same millisecond", () => {
    // The mirror image, which a `>=` would get wrong: the operator's own
    // pick came second, so it must survive the remount.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-10T00:00:00Z"));

    useOperatingStateStore
      .getState()
      .applyMessage(inboundTarget("phone-device", "K1ABC", "EM10"));
    useMapStore.getState().setTarget({ lat: 40, lon: -80, name: "W3ABC" });

    expect(useOperatingStateStore.getState().stamps.target.appliedAt).toBe(
      useMapStore.getState().targetSetAt,
    );

    renderHook(() => useHamClockWallOperatingState());

    expect(useMapStore.getState().target).toMatchObject({
      name: "W3ABC",
      lat: 40,
      lon: -80,
    });
  });

  it("does not re-apply a cursor it already applied in the same millisecond", () => {
    // Applying the cursor goes through `setTarget`, which takes the next
    // sequence — so the map outranks the cursor it was just built from and a
    // remount inside the same millisecond writes nothing.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-10T00:00:00Z"));

    useOperatingStateStore
      .getState()
      .applyMessage(inboundTarget("phone-device", "K1ABC", "EM10"));

    const first = renderHook(() => useHamClockWallOperatingState());
    const appliedSeq = useMapStore.getState().targetSeq;
    expect(useMapStore.getState().target?.name).toBe("K1ABC");
    first.unmount();

    renderHook(() => useHamClockWallOperatingState());

    // No second write: the sequence would have advanced.
    expect(useMapStore.getState().targetSeq).toBe(appliedSeq);
  });

  it("keeps a local target when a peer relays the cursor it already applied", () => {
    // Every peer answers a `hello` with its view of the cursor. That reply is
    // a relay, not a write: if it were attributed to the relaying peer and
    // that peer's id sorted above the original author's, `beats()` would
    // accept the same logical write a second time and refresh its local
    // arrival stamp — making a cursor from before the operator's own pick
    // look newer than it on the next remount (#859 round 5).
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-10T00:00:00Z"));

    const cursorAt = Date.now();
    useOperatingStateStore
      .getState()
      .applyMessage(inboundTarget("aaa-phone", "K1ABC", "EM10"));

    // The operator then picks a target on the wall itself.
    vi.advanceTimersByTime(5_000);
    useMapStore.getState().setTarget({ lat: 40, lon: -80, name: "W3ABC" });

    // A peer whose id sorts *above* the phone's replies to a `hello`.
    vi.advanceTimersByTime(5_000);
    act(() => {
      useOperatingStateStore
        .getState()
        .applyMessage(
          relayedTarget("zzz-peer", "aaa-phone", "K1ABC", "EM10", cursorAt),
        );
    });

    // The relay changed nothing: same author, same arrival stamp as the
    // original application.
    expect(useOperatingStateStore.getState().stamps.target.by).toBe(
      "aaa-phone",
    );
    expect(useOperatingStateStore.getState().stamps.target.appliedAt).toBe(
      cursorAt,
    );

    renderHook(() => useHamClockWallOperatingState());

    expect(useMapStore.getState().target).toMatchObject({
      name: "W3ABC",
      lat: 40,
      lon: -80,
    });
  });

  it("still applies a genuinely newer cursor from the relaying peer", () => {
    // The guard above must reject a re-delivery, not the peer: a write that
    // peer makes itself, after the local pick, still wins.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-10T00:00:00Z"));

    useMapStore.getState().setTarget({ lat: 40, lon: -80, name: "W3ABC" });

    vi.advanceTimersByTime(5_000);
    useOperatingStateStore
      .getState()
      .applyMessage(inboundTarget("zzz-peer", "W2XYZ", "FN20"));

    renderHook(() => useHamClockWallOperatingState());

    expect(useMapStore.getState().target).toMatchObject({
      name: "W2XYZ",
      grid: "FN20",
    });
  });

  it("keeps a local target when an old tab relays the cursor without an author", () => {
    // A tab left open across a deploy still runs the old bundle and answers
    // `hello` with a patch that cannot say who wrote it. Credited to the
    // sender, a relay from a peer whose id sorts above the real author's
    // would win the equal-`at` tie-break with a write it never made, re-stamp
    // its local arrival time, and overwrite the target the operator picked in
    // between (#859 round 6).
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-10T00:00:00Z"));

    const cursorAt = Date.now();
    useOperatingStateStore
      .getState()
      .applyMessage(inboundTarget("aaa-phone", "K1ABC", "EM10"));

    vi.advanceTimersByTime(5_000);
    useMapStore.getState().setTarget({ lat: 40, lon: -80, name: "W3ABC" });

    vi.advanceTimersByTime(5_000);
    act(() => {
      useOperatingStateStore
        .getState()
        .applyMessage(authorlessRelay("zzz-peer", "K1ABC", "EM10", cursorAt));
    });

    // Nothing moved: same author, same arrival stamp as the first application.
    expect(useOperatingStateStore.getState().stamps.target.by).toBe(
      "aaa-phone",
    );
    expect(useOperatingStateStore.getState().stamps.target.appliedAt).toBe(
      cursorAt,
    );

    renderHook(() => useHamClockWallOperatingState());

    expect(useMapStore.getState().target).toMatchObject({
      name: "W3ABC",
      lat: 40,
      lon: -80,
    });
  });

  it("still applies an authorless cursor that arrived after the local pick", () => {
    // A tab on a bundle older than #859 round 5 cannot name an author, and
    // no bundle names a write sequence any more — so there is nothing on the
    // wire to order this write by. There does not need to be: it was applied
    // here, after the local pick, and *that* is the order the wall compares
    // (round 11).
    //
    // Round 10 got this wrong in the other direction. It ordered by the
    // number the writer minted, so a peer that sent none lost the reconcile
    // to a local target however new its write really was.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-10T00:00:00Z"));

    useMapStore.getState().setTarget({ lat: 40, lon: -80, name: "W3ABC" });

    vi.advanceTimersByTime(5_000);
    act(() => {
      useOperatingStateStore
        .getState()
        .applyMessage(authorlessRelay("zzz-peer", "W2XYZ", "FN20", Date.now()));
    });
    expect(useOperatingStateStore.getState().cursor.target?.callsign).toBe(
      "W2XYZ",
    );

    renderHook(() => useHamClockWallOperatingState());

    expect(useMapStore.getState().target).toMatchObject({ name: "W2XYZ" });
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
      .map(
        ([message]) =>
          message as { domains?: Record<string, unknown>; sender: string },
      )
      .filter((message) => message.domains?.map !== undefined);
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

  it("keeps the known cursor when a legacy pop-out answers with an unstamped target", async () => {
    // #859 round 9, thread 1. A pop-out on a bundle that sends no write time
    // answers the workspace handshake with whatever target it has had up for
    // hours. Stamping that with its arrival made it the freshest thing in
    // this window, so the next remount kept it and threw away a cursor that
    // really was newer. Unknown freshness loses to known freshness.
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
    wall.unmount();

    // The handshake reply lands a minute later, so its *arrival* is the most
    // recent moment in this window — the trap the old code fell into.
    vi.advanceTimersByTime(60_000);
    act(() => {
      channel.onmessage?.({
        data: {
          kind: "snapshot",
          sender: "legacy-window",
          revision: 1,
          domains: {
            map: { target: { lat: 1, lon: 1, name: "OLD" } },
          },
        },
      } as MessageEvent);
    });
    expect(useMapStore.getState().target?.name).toBe("OLD");
    expect(useMapStore.getState().targetSetAt).toBeUndefined();

    // Remount: the cursor's age is known, the target's is not.
    renderHook(() => useHamClockWallOperatingState());

    expect(useMapStore.getState().target).toMatchObject({ name: "K1ABC" });
    sync.unmount();
  });

  it("keeps a target picked after the clock stepped backwards", async () => {
    // #859 round 9, thread 2. `Date.now()` is not monotonic: an NTP
    // correction mid-session moves it backwards, and then a pick made *after*
    // a cursor arrival carries the smaller `targetSetAt` and loses to it.
    // The local write sequence cannot run backwards, so it decides.
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
    const cursorAt = useOperatingStateStore.getState().stamps.target.at;

    // The clock steps back a minute, then the operator picks a target.
    vi.setSystemTime(new Date("2026-09-09T23:59:00Z"));
    useMapStore.getState().setTarget({ lat: 40, lon: -80, name: "W3ABC" });

    // The later write really does carry the earlier timestamp, or this test
    // has stopped modelling a backward step.
    const targetSetAt = useMapStore.getState().targetSetAt;
    expect(targetSetAt).toBeDefined();
    expect(targetSetAt as number).toBeLessThan(
      useOperatingStateStore.getState().stamps.target.appliedAt,
    );

    renderHook(() => useHamClockWallOperatingState()).unmount();
    expect(useMapStore.getState().target).toMatchObject({ name: "W3ABC" });

    // Second event: the cursor is relayed again with the same stamp — an
    // already-held write, which must not re-stamp — and the wall remounts.
    act(() => {
      useOperatingStateStore
        .getState()
        .applyMessage(
          relayedTarget("zzz-relay", "phone-device", "K1ABC", "EM10", cursorAt),
        );
    });
    renderHook(() => useHamClockWallOperatingState()).unmount();
    expect(useMapStore.getState().target).toMatchObject({ name: "W3ABC" });

    // Third event: a legacy handshake reply. The snapshot channel replicates
    // it either way — that is what the workspace sync is for — but the
    // unstamped target it installs may not then outrank the cursor, so what
    // the wall settles on is shared state whose age is known, never the
    // stale foreign one.
    act(() => {
      channel.onmessage?.({
        data: {
          kind: "snapshot",
          sender: "legacy-window",
          revision: 1,
          domains: {
            map: { target: { lat: 1, lon: 1, name: "OLD" } },
          },
        },
      } as MessageEvent);
    });
    renderHook(() => useHamClockWallOperatingState());
    expect(useMapStore.getState().target).not.toMatchObject({ name: "OLD" });
    sync.unmount();
  });

  it("orders by what this window applied second, not by a clock or a foreign counter", async () => {
    // #859 round 11. The operating channel spans *devices*: the phone runs
    // its own write counter, starting from its own zero, and nothing it
    // sends can be compared with a number minted here — round 10 compared
    // them anyway, so an unseen peer's low number passed for an early write.
    // Every number compared below is minted by this window at the moment it
    // applied the event, which is the one ordering it can honestly claim.
    //
    // The clock is made useless on purpose: it steps backwards and then
    // stands still, so nothing in this chain can pass by timestamp.
    vi.stubGlobal("BroadcastChannel", TestChannel);
    vi.useFakeTimers();
    const t0 = new Date("2026-09-10T00:00:00Z").getTime();
    vi.setSystemTime(t0);

    const sync = renderHook(() => useOperationalWorkspaceSync());
    await act(async () => {
      await Promise.resolve();
    });
    const [channel] = TestChannel.instances;

    // 1. the wall sets a target; the clock then steps back a minute and a
    //    cursor written on the phone arrives. By the clock the cursor is a
    //    minute *older* than the target — and a day older still by the
    //    phone's own skewed clock, which is what is on the wire. This window
    //    applied it second, so it wins.
    useMapStore.getState().setTarget({ lat: 40, lon: -80, name: "W3ABC" });
    const targetSeq = useMapStore.getState().targetSeq as number;
    vi.setSystemTime(t0 - 60_000);
    const phoneAt = Date.now() - SKEW_MS;
    act(() => {
      useOperatingStateStore
        .getState()
        .applyMessage(
          inboundTarget("phone", "K1ABC", "EM10", null, null, phoneAt),
        );
    });
    const cursorSeq = useOperatingStateStore.getState().stamps.target
      .appliedSeq as number;
    expect(cursorSeq).toBeGreaterThan(targetSeq);
    expect(useOperatingStateStore.getState().stamps.target.at).toBeLessThan(
      useMapStore.getState().targetSetAt as number,
    );
    renderHook(() => useHamClockWallOperatingState()).unmount();
    expect(useMapStore.getState().target).toMatchObject({ name: "K1ABC" });

    // 2. the operator picks a target, and the same phone write is then
    //    relayed by another peer. `beats()` rejects the re-delivery, so it
    //    takes no new number and the pick still stands on the next remount.
    useMapStore.getState().setTarget({ lat: 51, lon: 0, name: "G0ABC" });
    const pickSeq = useMapStore.getState().targetSeq as number;
    act(() => {
      useOperatingStateStore
        .getState()
        .applyMessage(
          relayedTarget("zzz-relay", "phone", "K1ABC", "EM10", phoneAt),
        );
    });
    expect(useOperatingStateStore.getState().stamps.target.appliedSeq).toBe(
      cursorSeq,
    );
    expect(pickSeq).toBeGreaterThan(cursorSeq);
    renderHook(() => useHamClockWallOperatingState()).unmount();
    expect(useMapStore.getState().target).toMatchObject({ name: "G0ABC" });

    // 3. a pop-out sets a target, which syncs in and is numbered *here*;
    //    then a genuinely newer phone cursor arrives and is numbered after
    //    it. The cursor wins, with the clock standing still throughout.
    act(() => {
      channel.onmessage?.({
        data: {
          kind: "snapshot",
          sender: "pop-out",
          revision: 1,
          domains: {
            map: {
              target: { lat: -20, lon: -45, name: "PY5DX" },
              // A millisecond after the pick above, which is what makes it a
              // new selection rather than a stale window answering with what
              // it has always had (round 12). The clock is frozen, so this is
              // written out rather than advanced.
              targetSetAt: (useMapStore.getState().targetSetAt as number) + 1,
            },
          },
        },
      } as MessageEvent);
    });
    const syncedSeq = useMapStore.getState().targetSeq as number;
    expect(syncedSeq).toBeGreaterThan(pickSeq);
    renderHook(() => useHamClockWallOperatingState()).unmount();
    expect(useMapStore.getState().target).toMatchObject({ name: "PY5DX" });

    act(() => {
      useOperatingStateStore
        .getState()
        .applyMessage(
          inboundTarget("phone", "W2XYZ", "FN20", null, null, phoneAt + 1),
        );
    });
    expect(
      useOperatingStateStore.getState().stamps.target.appliedSeq as number,
    ).toBeGreaterThan(syncedSeq);
    renderHook(() => useHamClockWallOperatingState()).unmount();
    expect(useMapStore.getState().target).toMatchObject({ name: "W2XYZ" });

    // 4. a legacy snapshot with no write time at all: unknown freshness, so
    //    it takes no number either and loses to the cursor it arrived after.
    act(() => {
      channel.onmessage?.({
        data: {
          kind: "snapshot",
          sender: "legacy-window",
          revision: 2,
          domains: {
            map: { target: { lat: 1, lon: 1, name: "OLD" } },
          },
        },
      } as MessageEvent);
    });
    expect(useMapStore.getState().targetSeq).toBeUndefined();
    renderHook(() => useHamClockWallOperatingState());
    expect(useMapStore.getState().target).toMatchObject({ name: "W2XYZ" });
    sync.unmount();
  });

  it("keeps a newer cursor when a stale pop-out answers the handshake", async () => {
    // #859 round 12, thread 1. A pop-out left open answers the workspace
    // handshake with the target it picked an hour ago. Arriving is not the
    // same as being newer: installing it and numbering it with the newest
    // local sequence — because applying it really is the latest thing this
    // window did — put a stale target at the top of the order and took a
    // cursor that was genuinely newer.
    vi.stubGlobal("BroadcastChannel", TestChannel);
    vi.useFakeTimers();
    const t0 = new Date("2026-09-10T00:00:00Z").getTime();
    vi.setSystemTime(t0);

    const sync = renderHook(() => useOperationalWorkspaceSync());
    await act(async () => {
      await Promise.resolve();
    });
    const [channel] = TestChannel.instances;

    // The wall picks a target, then a newer cursor arrives and takes it.
    useMapStore.getState().setTarget({ lat: 40, lon: -80, name: "W3ABC" });
    vi.advanceTimersByTime(60_000);
    act(() => {
      useOperatingStateStore
        .getState()
        .applyMessage(inboundTarget("phone", "K1ABC", "EM10"));
    });
    renderHook(() => useHamClockWallOperatingState()).unmount();
    expect(useMapStore.getState().target).toMatchObject({ name: "K1ABC" });
    const heldSeq = useMapStore.getState().targetSeq as number;

    // The stale pop-out answers with a target stamped an hour ago.
    const stale = (
      revision: number,
      name: string,
      setAt: number,
    ): MessageEvent =>
      ({
        data: {
          kind: "snapshot",
          sender: "pop-out",
          revision,
          domains: {
            map: { target: { lat: -20, lon: -45, name }, targetSetAt: setAt },
          },
        },
      }) as MessageEvent;
    act(() => {
      channel.onmessage?.(stale(1, "OLD", t0 - 60 * 60_000));
    });

    // Not applied at all — not the value, and not a number for it either.
    expect(useMapStore.getState().target).toMatchObject({ name: "K1ABC" });
    expect(useMapStore.getState().targetSeq).toBe(heldSeq);
    renderHook(() => useHamClockWallOperatingState()).unmount();
    expect(useMapStore.getState().target).toMatchObject({ name: "K1ABC" });

    // The same window then makes a genuinely new selection, and it installs
    // and takes its place in this window's order.
    vi.advanceTimersByTime(60_000);
    act(() => {
      channel.onmessage?.(stale(2, "PY5DX", Date.now()));
    });
    expect(useMapStore.getState().target).toMatchObject({ name: "PY5DX" });
    expect(useMapStore.getState().targetSeq as number).toBeGreaterThan(heldSeq);
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
    useOperatingStateStore
      .getState()
      .applyMessage(inboundTarget("phone-device", "K1ABC", null));

    renderHook(() => useHamClockWallOperatingState());

    expect(useMapStore.getState().target).toMatchObject({ name: "W3ABC" });
    expect(useMapStore.getState().isolateTargetPath).toBe(true);
  });

  it("clears the map target when the cursor was cleared while the wall was unmounted", () => {
    // #859 round 13, thread 2. A phone changing band drops the shared target,
    // which is a write: it carries a stamp, and the live subscription below
    // applies it as `setTarget(null)`. The mount reconcile used to look at
    // the resolved *value* first, so a stamped clear that landed while the
    // wall was off screen was skipped and the wall kept the old target for
    // good. A stamp orders writes; a null value does not opt out of that.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-10T00:00:00Z"));

    useMapStore.getState().setTarget({ lat: 40, lon: -80, name: "W3ABC" });
    vi.advanceTimersByTime(60_000);
    useOperatingStateStore.getState().applyMessage({
      v: OPERATING_PROTOCOL_VERSION,
      senderId: "phone-device",
      sentAt: Date.now(),
      kind: "state" as const,
      patch: { target: { value: null, at: Date.now(), by: "phone-device" } },
    });

    renderHook(() => useHamClockWallOperatingState());

    expect(useMapStore.getState().target).toBeNull();
  });

  it("applies a cursor re-picked at the same value after the wall picked another", () => {
    // #859 round 13, thread 1. The phone picks K1ABC, the wall picks W3ABC
    // while the cursor is unwatched, then the operator goes back to the phone
    // and picks K1ABC again. That last pick is a new write; suppressing it
    // because the value equalled the one the cursor already held left every
    // peer on the *old* stamp, and the wall kept W3ABC for good.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-10T00:00:00Z"));

    useOperatingStateStore
      .getState()
      .applyMessage(inboundTarget("phone-device", "K1ABC", "EM10"));
    vi.advanceTimersByTime(60_000);
    useMapStore.getState().setTarget({ lat: 40, lon: -80, name: "W3ABC" });
    vi.advanceTimersByTime(60_000);
    useOperatingStateStore
      .getState()
      .applyMessage(
        inboundTarget("phone-device", "K1ABC", "EM10", null, null, Date.now()),
      );

    renderHook(() => useHamClockWallOperatingState());

    expect(useMapStore.getState().target).toMatchObject({ name: "K1ABC" });
  });

  it("applies another screen's same-millisecond pick after the wall picked its own", () => {
    // #859 round 14, thread 1. The phone and a second screen pick the same
    // target in the same millisecond, and the wall picks something else
    // between the two deliveries. The second pick is a distinct write: if it
    // is collapsed into the first as a replay it takes no application
    // number, and the wall keeps its own target for good.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-10T00:00:00Z"));
    const at = Date.now();

    useOperatingStateStore
      .getState()
      .applyMessage(
        inboundTarget("aaa-phone", "K1ABC", "EM10", null, null, at),
      );
    vi.advanceTimersByTime(60_000);
    useMapStore.getState().setTarget({ lat: 40, lon: -80, name: "W3ABC" });
    // Same instant on the wire, same value, a different screen: a second
    // write that wins the tie on its id.
    useOperatingStateStore
      .getState()
      .applyMessage(
        inboundTarget("zzz-phone", "K1ABC", "EM10", null, null, at),
      );

    renderHook(() => useHamClockWallOperatingState());

    expect(useMapStore.getState().target).toMatchObject({ name: "K1ABC" });
  });

  it("does not renumber a target when peers republish it for a joining window", async () => {
    // #859 round 14, thread 2. A third window asking for state makes *every*
    // peer republish what it holds, and a workspace snapshot names no
    // original writer — so keying the equal-stamp tie on whoever relayed it
    // let a high-id relay of an unchanged target mint a fresh sequence and
    // pass for the newest thing this window did, outranking a cursor that
    // arrived while the wall was unmounted. Identical value plus identical
    // stamp is a replay: no number, no key change.
    vi.stubGlobal("BroadcastChannel", TestChannel);
    vi.useFakeTimers();
    const t0 = new Date("2026-09-10T00:00:00Z").getTime();
    vi.setSystemTime(t0);

    const sync = renderHook(() => useOperationalWorkspaceSync());
    await act(async () => {
      await Promise.resolve();
    });
    const [channel] = TestChannel.instances;

    const aTarget = {
      kind: "snapshot",
      domains: {
        map: { target: { lat: -20, lon: -45, name: "PY5DX" }, targetSetAt: t0 },
      },
    };

    // Window A picks a target; it syncs in here and is numbered here.
    act(() => {
      channel.onmessage?.({
        data: { ...aTarget, sender: "aaa-window", revision: 1 },
      } as MessageEvent);
    });
    const syncedSeq = useMapStore.getState().targetSeq as number;

    // A newer cursor lands while the wall is unmounted.
    act(() => {
      useOperatingStateStore
        .getState()
        .applyMessage(inboundTarget("phone", "W2XYZ", "FN20", null, null, t0));
    });
    expect(
      useOperatingStateStore.getState().stamps.target.appliedSeq as number,
    ).toBeGreaterThan(syncedSeq);

    // Window C joins: A and B both republish A's target, unchanged, with A's
    // stamp. B's id sorts above this window's and above A's.
    act(() => {
      channel.onmessage?.({
        data: { ...aTarget, sender: "aaa-window", revision: 2 },
      } as MessageEvent);
      channel.onmessage?.({
        data: { ...aTarget, sender: "zzz-window", revision: 1 },
      } as MessageEvent);
    });
    expect(useMapStore.getState().targetSeq).toBe(syncedSeq);

    renderHook(() => useHamClockWallOperatingState()).unmount();
    expect(useMapStore.getState().target).toMatchObject({ name: "W2XYZ" });
    sync.unmount();
  });

  it("keeps a target picked between a legacy relay and the upgraded relay of one write", () => {
    // #859 round 15, thread 1. The phone's cursor reaches this screen first
    // through a tab too old to name an author, so the held tie key is only
    // the *relayer's* id. When an upgraded peer then relays the same write
    // with the author on it, comparing that author against the relayer's id
    // made it look like a second writer: it re-stamped, and the target the
    // operator picked between the two deliveries lost the remount. "A
    // different author" needs both sides known.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-10T00:00:00Z"));
    const at = Date.now();

    useOperatingStateStore
      .getState()
      .applyMessage(authorlessRelay("mmm-legacy", "K1ABC", "EM10", at));
    const seq = useOperatingStateStore.getState().stamps.target.appliedSeq;
    vi.advanceTimersByTime(60_000);
    useMapStore.getState().setTarget({ lat: 40, lon: -80, name: "W3ABC" });

    // The same write, now named — and the author's id sorts above the
    // relayer's, which is what used to win it the tie.
    useOperatingStateStore
      .getState()
      .applyMessage(
        relayedTarget("bbb-relay", "zzz-author", "K1ABC", "EM10", at),
      );

    expect(useOperatingStateStore.getState().stamps.target.appliedSeq).toBe(
      seq,
    );
    // It is still a replay that *learns*: the author is now known.
    expect(useOperatingStateStore.getState().stamps.target.by).toBe(
      "zzz-author",
    );

    renderHook(() => useHamClockWallOperatingState());
    expect(useMapStore.getState().target).toMatchObject({ name: "W3ABC" });
  });

  it("keeps a target picked between an authored write and a legacy relay of it", () => {
    // The other delivery order of the same mixed-version pair: the author's
    // own write lands first, and the legacy relay that follows names nobody.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-10T00:00:00Z"));
    const at = Date.now();

    useOperatingStateStore
      .getState()
      .applyMessage(
        inboundTarget("zzz-author", "K1ABC", "EM10", null, null, at),
      );
    const seq = useOperatingStateStore.getState().stamps.target.appliedSeq;
    vi.advanceTimersByTime(60_000);
    useMapStore.getState().setTarget({ lat: 40, lon: -80, name: "W3ABC" });

    useOperatingStateStore
      .getState()
      .applyMessage(authorlessRelay("mmm-legacy", "K1ABC", "EM10", at));

    expect(useOperatingStateStore.getState().stamps.target.appliedSeq).toBe(
      seq,
    );
    expect(useOperatingStateStore.getState().stamps.target.by).toBe(
      "zzz-author",
    );

    renderHook(() => useHamClockWallOperatingState());
    expect(useMapStore.getState().target).toMatchObject({ name: "W3ABC" });
  });

  it("applies a second window's live pick of the same target in the same millisecond", async () => {
    // #859 round 15, thread 2. Two windows *selecting* the same target in one
    // millisecond are two writes; only a republish for a joining window is a
    // replay. The message kind says which, so a live selection at an equal
    // stamp goes through the sender tie-break and mints when it wins — and
    // then outranks a cursor that arrived in between.
    vi.stubGlobal("BroadcastChannel", TestChannel);
    vi.useFakeTimers();
    const t0 = new Date("2026-09-10T00:00:00Z").getTime();
    vi.setSystemTime(t0);

    const sync = renderHook(() => useOperationalWorkspaceSync());
    await act(async () => {
      await Promise.resolve();
    });
    const [channel] = TestChannel.instances;

    act(() => channel.onmessage?.(livePick("aaa-window", t0)));
    const syncedSeq = useMapStore.getState().targetSeq as number;

    act(() => {
      useOperatingStateStore
        .getState()
        .applyMessage(inboundTarget("phone", "W2XYZ", "FN20", null, null, t0));
    });
    expect(
      useOperatingStateStore.getState().stamps.target.appliedSeq as number,
    ).toBeGreaterThan(syncedSeq);

    // A live pick from a window whose id sorts above wins the tie, mints,
    // and is then the newest thing this window applied.
    act(() => channel.onmessage?.(livePick("zzz-window", t0)));
    expect(useMapStore.getState().targetSeq as number).toBeGreaterThan(
      useOperatingStateStore.getState().stamps.target.appliedSeq as number,
    );

    renderHook(() => useHamClockWallOperatingState()).unmount();
    expect(useMapStore.getState().target).toMatchObject({ name: "PY5DX" });
    sync.unmount();
  });

  it("ignores a second window's live pick from a lower id in the same millisecond", async () => {
    // The negative order of the same race: the tie-break still decides it,
    // and losing takes no number — or a write that did not win would climb
    // above the cursor anyway.
    vi.stubGlobal("BroadcastChannel", TestChannel);
    vi.useFakeTimers();
    const t0 = new Date("2026-09-10T00:00:00Z").getTime();
    vi.setSystemTime(t0);

    const sync = renderHook(() => useOperationalWorkspaceSync());
    await act(async () => {
      await Promise.resolve();
    });
    const [channel] = TestChannel.instances;

    act(() => channel.onmessage?.(livePick("mmm-window", t0)));
    const syncedSeq = useMapStore.getState().targetSeq as number;

    act(() => {
      useOperatingStateStore
        .getState()
        .applyMessage(inboundTarget("phone", "W2XYZ", "FN20", null, null, t0));
    });

    act(() => channel.onmessage?.(livePick("aaa-window", t0)));
    expect(useMapStore.getState().targetSeq).toBe(syncedSeq);

    renderHook(() => useHamClockWallOperatingState()).unmount();
    expect(useMapStore.getState().target).toMatchObject({ name: "W2XYZ" });
    sync.unmount();
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
    useMapStore.setState({
      target: { lat: 40, lon: -80, name: "W3ABC" },
      isolateTargetPath: true,
    });

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
    expect(
      useOperatingStateStore.getState().registrations[key],
    ).toBeUndefined();
  });

  it("moves the wall's map target when another screen's cursor changes, resolving a grid to a lat/lon", () => {
    renderHook(() => useHamClockWallOperatingState());

    act(() => {
      useOperatingStateStore
        .getState()
        .applyMessage(inboundTarget("phone-device", "K1ABC", "EM10"));
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
        .applyMessage(
          inboundTarget("phone-device", "K1ABC", "EM10", 40.1, -74.2),
        );
    });

    expect(useMapStore.getState().target).toMatchObject({
      lat: 40.1,
      lon: -74.2,
    });
  });

  it("stops applying the inbound cursor once follow is switched off", () => {
    renderHook(() => useHamClockWallOperatingState());

    act(() => {
      useOperatingStateStore
        .getState()
        .applyMessage(inboundTarget("phone-device", "K1ABC", "EM10"));
    });
    expect(useMapStore.getState().target?.name).toBe("K1ABC");

    act(() => {
      useOperatingStateStore.getState().setFollowScreens(false);
      useOperatingStateStore
        .getState()
        .applyMessage(inboundTarget("phone-device", "W2XYZ", "FN20"));
    });

    expect(useMapStore.getState().target?.name).toBe("K1ABC");
  });
  it("keeps a target picked between a selection's patch and its command", () => {
    // #859 round 17. One tap on a spot publishes twice — a state patch and a
    // `selectSpot` command — and the command used to be stamped with its own
    // envelope's `sentAt`, a moment later than the patch. The replay guard
    // needs equal stamps to see a re-delivery, so the duplicate was applied
    // as a fresh cursor write, took a newer `appliedSeq`, and beat the map
    // target the operator picked while the wall was unmounted and the two
    // pipes were still in flight. One selection, one stamp.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-10T00:00:00Z"));
    const at = Date.now();
    const tap = spotSelection("phone", "K1ABC", "EM10", "spot-1", at);

    useOperatingStateStore.getState().applyMessage(tap.patch);
    const seq = useOperatingStateStore.getState().stamps.target.appliedSeq;

    // The operator picks something else on this screen while the wall is down.
    vi.advanceTimersByTime(60_000);
    useMapStore.getState().setTarget({ lat: 40, lon: -80, name: "W3ABC" });

    // The command finally arrives. Same write, so nothing is renumbered.
    useOperatingStateStore.getState().applyMessage(tap.command);
    expect(useOperatingStateStore.getState().stamps.target.appliedSeq).toBe(
      seq,
    );

    renderHook(() => useHamClockWallOperatingState());
    expect(useMapStore.getState().target).toMatchObject({ name: "W3ABC" });
  });

  it("keeps a target picked between a selection's command and its patch", () => {
    // The reversed delivery order: the command pipe is the quick one. It is
    // still a write — the cursor must move — and the patch that follows must
    // not be dropped as stale nor re-applied as new.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-10T00:00:00Z"));
    const at = Date.now();
    const tap = spotSelection("phone", "K1ABC", "EM10", "spot-1", at);

    useOperatingStateStore.getState().applyMessage(tap.command);
    expect(useOperatingStateStore.getState().cursor.target).toMatchObject({
      callsign: "K1ABC",
    });
    const seq = useOperatingStateStore.getState().stamps.target.appliedSeq;
    // The stamp is the selection's, not the envelope's late `sentAt`.
    expect(useOperatingStateStore.getState().stamps.target.at).toBe(at);

    vi.advanceTimersByTime(60_000);
    useMapStore.getState().setTarget({ lat: 40, lon: -80, name: "W3ABC" });

    useOperatingStateStore.getState().applyMessage(tap.patch);
    expect(useOperatingStateStore.getState().stamps.target.appliedSeq).toBe(
      seq,
    );
    expect(useOperatingStateStore.getState().cursor.target).toMatchObject({
      callsign: "K1ABC",
    });

    renderHook(() => useHamClockWallOperatingState());
    expect(useMapStore.getState().target).toMatchObject({ name: "W3ABC" });
  });
});
