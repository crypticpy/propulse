import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OPERATING_PROTOCOL_VERSION } from "@/lib/workspace/operatingChannel";
import { nextLocalWriteSeq } from "@/lib/localWriteSequence";
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
  /**
   * The writer's Lamport sequence. Minted from the same counter as this
   * window's own writes, which is what a peer that has seen them would do —
   * `observeRemoteWriteSeq` keeps every window's counter above every write it
   * has applied, so "the number a peer would mint right now" is exactly the
   * next one here. A test that wants a *stale* cursor passes an old one.
   */
  seq: number | undefined = nextLocalWriteSeq(),
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
        by: senderId,
        ...(seq === undefined ? {} : { seq }),
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
  /** The original write's sequence, passed through unchanged by a relay. */
  seq?: number,
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
        ...(seq === undefined ? {} : { seq }),
      },
    },
  };
}

/**
 * A `hello` reply from a tab on a bundle older than #859 round 5: the wire
 * had no way to name an author, so the entry carries only a value and a
 * stamp.
 */
function authorlessRelay(relayId: string, callsign: string, grid: string | null, at: number) {
  return {
    v: OPERATING_PROTOCOL_VERSION,
    senderId: relayId,
    sentAt: Date.now(),
    kind: "state" as const,
    patch: {
      target: { value: { callsign, grid, lat: null, lon: null, spotId: null }, at },
    },
  };
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

    expect(useMapStore.getState().target).toMatchObject({ name: "K1ABC", grid: "EM10" });
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

    expect(useMapStore.getState().target).toMatchObject({ name: "W3ABC", lat: 40, lon: -80 });
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
        .applyMessage(relayedTarget("zzz-peer", "aaa-phone", "K1ABC", "EM10", cursorAt));
    });

    // The relay changed nothing: same author, same arrival stamp as the
    // original application.
    expect(useOperatingStateStore.getState().stamps.target.by).toBe("aaa-phone");
    expect(useOperatingStateStore.getState().stamps.target.appliedAt).toBe(cursorAt);

    renderHook(() => useHamClockWallOperatingState());

    expect(useMapStore.getState().target).toMatchObject({ name: "W3ABC", lat: 40, lon: -80 });
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

    expect(useMapStore.getState().target).toMatchObject({ name: "W2XYZ", grid: "FN20" });
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
      useOperatingStateStore.getState().applyMessage(authorlessRelay("zzz-peer", "K1ABC", "EM10", cursorAt));
    });

    // Nothing moved: same author, same arrival stamp as the first application.
    expect(useOperatingStateStore.getState().stamps.target.by).toBe("aaa-phone");
    expect(useOperatingStateStore.getState().stamps.target.appliedAt).toBe(cursorAt);

    renderHook(() => useHamClockWallOperatingState());

    expect(useMapStore.getState().target).toMatchObject({ name: "W3ABC", lat: 40, lon: -80 });
  });

  it("keeps a sequenced local target over a cursor that cannot be ordered", () => {
    // The stated cost of the Lamport rule (#859 round 10). A tab on a bundle
    // older than this one sends no sequence, so there is no way to place its
    // write against a local one except by a clock that can step backwards —
    // and that is what handed a stale cursor the operator's own pick. It
    // loses the *mount reconcile*, deliberately.
    //
    // It costs nothing while the wall is up: the store still applies the
    // write (the merge rule is unchanged, and is covered in
    // `operatingStateStore.test.ts`) and the live subscription still moves
    // the map with it. Only the reconcile after an unmount prefers the write
    // it can order.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-10T00:00:00Z"));

    useMapStore.getState().setTarget({ lat: 40, lon: -80, name: "W3ABC" });

    vi.advanceTimersByTime(5_000);
    act(() => {
      useOperatingStateStore.getState().applyMessage(authorlessRelay("zzz-peer", "W2XYZ", "FN20", Date.now()));
    });
    // Applied to the shared cursor either way — this is the reconcile's
    // choice, not a dropped message.
    expect(useOperatingStateStore.getState().cursor.target?.callsign).toBe("W2XYZ");

    renderHook(() => useHamClockWallOperatingState());

    expect(useMapStore.getState().target).toMatchObject({ name: "W3ABC" });
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
          domain: "map",
          revision: 1,
          state: { target: { lat: 1, lon: 1, name: "OLD" } },
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
          domain: "map",
          revision: 1,
          state: { target: { lat: 1, lon: 1, name: "OLD" } },
        },
      } as MessageEvent);
    });
    renderHook(() => useHamClockWallOperatingState());
    expect(useMapStore.getState().target).not.toMatchObject({ name: "OLD" });
    sync.unmount();
  });

  it("orders a synchronized target against a cursor by sequence, not the clock", async () => {
    // #859 round 10, thread 2. Round 9 cleared the sequence on anything that
    // crossed a window, so cross-window ordering fell back to `Date.now()` —
    // and a clock step then froze a stale synced target in front of every
    // later cursor. The sequence is a Lamport clock now: it travels with the
    // write and is observed on receipt, so it stays comparable between
    // windows without a clock at all.
    //
    // Sequences are written as offsets from a base so the arithmetic is
    // visible; the base is above anything this process has minted, which is
    // what a peer that had observed our writes would send.
    const S = 5_000_000;
    vi.stubGlobal("BroadcastChannel", TestChannel);
    vi.useFakeTimers();
    const t0 = new Date("2026-09-10T00:00:00Z").getTime();
    vi.setSystemTime(t0);

    const sync = renderHook(() => useOperationalWorkspaceSync());
    await act(async () => {
      await Promise.resolve();
    });
    const [channel] = TestChannel.instances;

    const syncedTarget = { lat: -20, lon: -45, name: "PY5DX" };
    const snapshot = (
      revision: number,
      state: Record<string, unknown>,
    ): MessageEvent =>
      ({
        data: { kind: "snapshot", sender: "pop-out", domain: "map", revision, state },
      }) as MessageEvent;

    // 1. the pop-out picks a target and it syncs here, sequence and all.
    act(() => {
      channel.onmessage?.(
        snapshot(1, {
          target: syncedTarget,
          targetSetAt: t0,
          targetSeq: S + 5,
        }),
      );
    });
    expect(useMapStore.getState().targetSeq).toBe(S + 5);

    // 2. the clock steps backwards a minute, so every later write carries an
    //    *earlier* timestamp than the pick above.
    vi.setSystemTime(t0 - 60_000);

    // 3. a cursor written after it arrives. On the clock it looks older; on
    //    the sequence it is plainly newer, and the sequence decides.
    act(() => {
      useOperatingStateStore
        .getState()
        .applyMessage(
          inboundTarget("phone-device", "K1ABC", "EM10", null, null, Date.now(), S + 6),
        );
    });
    expect(useMapStore.getState().targetSetAt as number).toBeGreaterThan(
      useOperatingStateStore.getState().stamps.target.appliedAt,
    );
    renderHook(() => useHamClockWallOperatingState()).unmount();
    expect(useMapStore.getState().target).toMatchObject({ name: "K1ABC" });

    // 4. the pop-out re-selects the *same object* — a stamp-only write, which
    //    only reaches this window because the publish predicate watches the
    //    stamp (thread 1). Its sequence is above the one this window minted
    //    when the wall applied the cursor, because the pop-out observed that
    //    write too; that is the Lamport property doing the work.
    const afterCursor = useMapStore.getState().targetSeq as number;
    expect(afterCursor).toBeGreaterThan(S + 6);
    act(() => {
      channel.onmessage?.(
        snapshot(2, {
          target: syncedTarget,
          targetSetAt: Date.now(),
          targetSeq: afterCursor + 1,
        }),
      );
    });
    renderHook(() => useHamClockWallOperatingState()).unmount();
    expect(useMapStore.getState().target).toMatchObject({ name: "PY5DX" });

    // 5. a legacy snapshot with no stamp at all loses to both: it cannot be
    //    ordered, and the cursor can.
    act(() => {
      channel.onmessage?.(snapshot(3, { target: { lat: 1, lon: 1, name: "OLD" } }));
    });
    expect(useMapStore.getState().targetSeq).toBeUndefined();
    renderHook(() => useHamClockWallOperatingState());
    expect(useMapStore.getState().target).not.toMatchObject({ name: "OLD" });
    sync.unmount();
  });

  it("treats an equal sequence as a no-op, not a win for either side", async () => {
    // Equality means "cannot tell" — two windows can only reach the same
    // number without having seen each other. Neither side may claim it, and
    // in particular the map must not be re-written, which would mint a new
    // sequence and manufacture an ordering out of nothing.
    const S = 6_000_000;
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-10T00:00:00Z"));

    useMapStore.setState({
      target: { lat: 40, lon: -80, name: "W3ABC" },
      targetSetAt: Date.now(),
      targetSeq: S,
    });
    act(() => {
      useOperatingStateStore
        .getState()
        .applyMessage(
          inboundTarget("phone-device", "K1ABC", "EM10", null, null, Date.now(), S),
        );
    });
    expect(useOperatingStateStore.getState().stamps.target.appliedSeq).toBe(S);

    renderHook(() => useHamClockWallOperatingState());

    expect(useMapStore.getState().target).toMatchObject({ name: "W3ABC" });
    // Untouched, so no write happened at all.
    expect(useMapStore.getState().targetSeq).toBe(S);
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
