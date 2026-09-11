import { StrictMode, useEffect } from "react";
import { act, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useOperationalWorkspaceSync } from "./useMapOperationalContext";
import { nextLocalWriteSeq } from "@/lib/localWriteSequence";
import { useMapOperationalStore } from "@/stores/mapOperationalStore";
import { useMapStore } from "@/stores/mapStore";

vi.mock("@/lib/supabase", () => ({
  getSupabase: vi.fn(),
  isSupabaseConfigured: false,
}));

class TestChannel {
  static instances: TestChannel[] = [];
  closed = false;
  onmessage: ((event: MessageEvent) => void) | null = null;
  // The parameter is declared so `mock.calls` is typed: a test that reads
  // what was published cannot index an empty tuple.
  postMessage = vi.fn((_message: unknown) => {
    if (this.closed) throw new Error("Channel is closed");
  });
  constructor() {
    TestChannel.instances.push(this);
  }
  close() {
    this.closed = true;
  }
}

function Harness() {
  useOperationalWorkspaceSync();
  useEffect(() => {
    useMapOperationalStore.getState().setManualScope("log");
  }, []);
  return null;
}

/** Just the sync, with no store writes of its own. */
function SyncOnly() {
  useOperationalWorkspaceSync();
  return null;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  TestChannel.instances = [];
  useMapOperationalStore.setState({ manualScope: null, workspaceOpen: false });
  useMapStore.setState({
    target: null,
    targetSetAt: undefined,
    targetSeq: undefined,
  });
});

describe("operational workspace synchronization cleanup", () => {
  it("discards pending publishes when StrictMode replaces the channel", async () => {
    vi.stubGlobal("BroadcastChannel", TestChannel);
    const view = render(
      <StrictMode>
        <Harness />
      </StrictMode>,
    );
    await act(async () => {
      await Promise.resolve();
    });
    const [retired, active] = TestChannel.instances;
    expect(retired.closed).toBe(true);
    expect(retired.postMessage).toHaveBeenCalledTimes(1); // initial handshake only
    expect(active.closed).toBe(false);
    act(() => useMapOperationalStore.getState().setWorkspaceOpen(true));
    view.unmount();
    await act(async () => {
      await Promise.resolve();
    });
    expect(active.postMessage).toHaveBeenCalledTimes(1);
  });

  it("still publishes updates while mounted", async () => {
    vi.stubGlobal("BroadcastChannel", TestChannel);
    const view = render(<Harness />);
    await act(async () => {
      await Promise.resolve();
    });
    const [channel] = TestChannel.instances;
    // One batched message per publish (#884 round 14).
    expect(channel.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "snapshot",
        domains: expect.objectContaining({
          operational: expect.objectContaining({ manualScope: "log" }),
        }),
      }),
    );
    view.unmount();
  });
});

describe("map target synchronization", () => {
  it("publishes the target's write stamp alongside the target", async () => {
    vi.stubGlobal("BroadcastChannel", TestChannel);
    const view = render(<SyncOnly />);
    await act(async () => {
      await Promise.resolve();
    });
    const [channel] = TestChannel.instances;

    act(() => {
      useMapStore.getState().setTarget({ lat: 40, lon: -80, name: "W3ABC" });
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(channel.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "snapshot",
        domains: expect.objectContaining({
          map: {
            target: expect.objectContaining({ name: "W3ABC" }),
            targetSetAt: useMapStore.getState().targetSetAt,
          },
        }),
      }),
    );
    view.unmount();
  });

  it("publishes a stamp-only write, where the target object never changed", async () => {
    // #859 round 10, thread 1. Re-selecting an entry from `recentTargets`
    // hands `setTarget` the object already held, so only the stamp moves. A
    // publish predicate watching the target *reference* saw nothing, the
    // other window never applied the re-selection, and its wall then let a
    // cursor that was actually older win the remount. The predicate must
    // observe every field the write moves — including `targetSeq`, which no
    // longer travels but is the only field that always changes (round 11).
    vi.stubGlobal("BroadcastChannel", TestChannel);
    const view = render(<SyncOnly />);
    await act(async () => {
      await Promise.resolve();
    });
    const [channel] = TestChannel.instances;

    const sameTarget = { lat: 40, lon: -80, name: "W3ABC" };
    act(() => {
      useMapStore.getState().setTarget(sameTarget);
    });
    await act(async () => {
      await Promise.resolve();
    });
    const mapPublishes = () =>
      channel.postMessage.mock.calls
        .map(
          ([message]) =>
            message as {
              domains?: { map?: { targetSetAt?: number } };
            },
        )
        .filter((message) => message.domains?.map !== undefined);
    const before = mapPublishes().length;
    const firstSeq = useMapStore.getState().targetSeq;

    act(() => {
      useMapStore.getState().setTarget(sameTarget);
    });
    await act(async () => {
      await Promise.resolve();
    });

    // The premise: same object, new stamp.
    expect(useMapStore.getState().target).toBe(sameTarget);
    expect(useMapStore.getState().targetSeq).not.toBe(firstSeq);

    const mapMessages = mapPublishes();
    expect(mapMessages.length).toBe(before + 1);
    expect(mapMessages[mapMessages.length - 1]?.domains?.map?.targetSetAt).toBe(
      useMapStore.getState().targetSetAt,
    );
    view.unmount();
  });

  it("applies a received target with the sender's stamp, not this window's", async () => {
    // Without the stamp the receiver keeps the *previous* target's write
    // time, which is what let an older operating cursor beat a pop-out's
    // fresh pick when the HamClock wall remounted (#859).
    vi.stubGlobal("BroadcastChannel", TestChannel);
    useMapStore.setState({
      target: { lat: 1, lon: 1, name: "OLD" },
      targetSetAt: 1_000,
    });
    const view = render(<SyncOnly />);
    await act(async () => {
      await Promise.resolve();
    });
    const [channel] = TestChannel.instances;
    // Everything this window has numbered so far, so the assertion below is
    // about a number minted on arrival rather than one that was already
    // lying around.
    const seqBefore = nextLocalWriteSeq();

    act(() => {
      channel.onmessage?.({
        data: {
          kind: "snapshot",
          sender: "other-window",
          revision: 1,
          domains: {
            map: {
              target: { lat: 40, lon: -80, name: "W3ABC" },
              targetSetAt: 9_000,
            },
          },
        },
      } as MessageEvent);
    });

    expect(useMapStore.getState().target).toMatchObject({ name: "W3ABC" });
    expect(useMapStore.getState().targetSetAt).toBe(9_000);
    // The write time is the sender's; the *order* is this window's own. The
    // sender's counter numbers the sender's history, so applying the
    // snapshot takes a local number instead (#859 round 11) — and it must be
    // above anything minted here before, or the wall cannot tell that this
    // target arrived after the cursor it is about to be compared with.
    const appliedSeq = useMapStore.getState().targetSeq;
    expect(appliedSeq).toBeDefined();
    expect(appliedSeq as number).toBeGreaterThan(seqBefore);
    view.unmount();
  });

  it("ignores a stamped snapshot that is not newer than the target it holds", async () => {
    // #859 round 12. A pop-out left open answers the handshake with the
    // target it picked an hour ago. Both stamps are workspace windows on this
    // machine, one clock, so they compare directly — and only a strictly
    // newer one may install. An equal stamp is not newer either: that is the
    // same window re-announcing what this one already has, and where it is a
    // genuine same-millisecond race the tie falls to the higher window id
    // (round 13) — pinned below, so this test is about the ordering and not
    // about which random id happened to sort higher.
    vi.stubGlobal("BroadcastChannel", TestChannel);
    vi.stubGlobal("crypto", { randomUUID: () => "zzz-this-window" });
    useMapStore.setState({
      target: { lat: 40, lon: -80, name: "HELD" },
      targetSetAt: 5_000,
      // Nothing numbered here yet, so the assertions below are about numbers
      // this applier did or did not take.
      targetSeq: undefined,
    });
    const view = render(<SyncOnly />);
    await act(async () => {
      await Promise.resolve();
    });
    const [channel] = TestChannel.instances;
    const seqBefore = nextLocalWriteSeq();

    const snapshot = (revision: number, name: string, setAt: number) =>
      ({
        data: {
          kind: "snapshot",
          sender: "other-window",
          revision,
          domains: {
            map: { target: { lat: 1, lon: 1, name }, targetSetAt: setAt },
          },
        },
      }) as MessageEvent;

    act(() => {
      channel.onmessage?.(snapshot(1, "OLDER", 4_999));
    });
    expect(useMapStore.getState().target).toMatchObject({ name: "HELD" });

    act(() => {
      channel.onmessage?.(snapshot(2, "EQUAL", 5_000));
    });
    expect(useMapStore.getState().target).toMatchObject({ name: "HELD" });
    // Declining to apply a snapshot is not an application: no number was
    // taken for either of them, or a stale target would still have climbed
    // to the top of this window's order.
    expect(useMapStore.getState().targetSeq).toBeUndefined();

    act(() => {
      channel.onmessage?.(snapshot(3, "NEWER", 5_001));
    });
    expect(useMapStore.getState().target).toMatchObject({ name: "NEWER" });
    expect(useMapStore.getState().targetSetAt).toBe(5_001);
    expect(useMapStore.getState().targetSeq as number).toBeGreaterThan(
      seqBefore,
    );
    view.unmount();
  });

  it("keeps a target this window cleared over an older handshake answer", async () => {
    // #859 round 13, thread 3. `setTarget(null)` stamps `targetSetAt` like
    // any other write, so a window that *cleared* its target at 5000 has
    // something to lose: a pop-out suspended since 4000 answering the
    // handshake must not put its hours-old target back. "Nothing to lose" is
    // the absence of a stamp, never the nullness of the value.
    vi.stubGlobal("BroadcastChannel", TestChannel);
    useMapStore.setState({
      target: null,
      targetSetAt: 5_000,
      targetSeq: undefined,
    });
    const view = render(<SyncOnly />);
    await act(async () => {
      await Promise.resolve();
    });
    const [channel] = TestChannel.instances;

    act(() => {
      channel.onmessage?.({
        data: {
          kind: "snapshot",
          sender: "suspended-popout",
          revision: 1,
          domains: {
            map: {
              target: { lat: 1, lon: 1, name: "STALE" },
              targetSetAt: 4_000,
            },
          },
        },
      } as MessageEvent);
    });

    expect(useMapStore.getState().target).toBeNull();
    expect(useMapStore.getState().targetSetAt).toBe(5_000);
    // Declining is not an application, so no number was taken.
    expect(useMapStore.getState().targetSeq).toBeUndefined();
    view.unmount();
  });

  it("settles a same-millisecond pick between two windows on one winner", async () => {
    // #859 round 13, thread 4. Two editable windows picking different targets
    // inside one millisecond each refused the other under a plain `<=` and
    // stayed split for good. An exact tie now falls to the higher window id —
    // the same direction the operating store breaks its ties — so whichever
    // side you stand on, the same target wins. Nothing was added to the wire
    // for it: the envelope already names its sender (round 10's lesson).
    const settled: string[] = [];
    for (const [local, remote] of [
      ["aaa-window", "zzz-window"],
      ["zzz-window", "aaa-window"],
    ]) {
      vi.stubGlobal("BroadcastChannel", TestChannel);
      vi.stubGlobal("crypto", { randomUUID: () => local });
      // This window's own pick, so the tie key it holds is its own id.
      useMapStore.setState({
        target: { lat: 2, lon: 2, name: local },
        targetSetAt: 7_000,
        targetSeq: undefined,
      });
      const view = render(<SyncOnly />);
      await act(async () => {
        await Promise.resolve();
      });
      const channel = TestChannel.instances.at(-1) as TestChannel;

      act(() => {
        channel.onmessage?.({
          data: {
            kind: "snapshot",
            sender: remote,
            revision: 1,
            domains: {
              map: {
                target: { lat: 3, lon: 3, name: remote },
                targetSetAt: 7_000,
              },
            },
          },
        } as MessageEvent);
      });

      settled.push(useMapStore.getState().target?.name as string);
      view.unmount();
      vi.unstubAllGlobals();
      TestChannel.instances = [];
    }

    // Both windows end on the higher id's pick rather than each keeping its
    // own — convergence, not a deadlock.
    expect(settled).toEqual(["zzz-window", "zzz-window"]);
  });

  it("settles equal stamps from two senders on the higher one in either order", async () => {
    // #859 round 14, thread 2, the negative. Recognising a replay must not
    // cost the tie-break: two senders at one stamp carrying *different*
    // targets still converge on the higher sender's, whichever arrives
    // first.
    const settled: string[] = [];
    for (const order of [
      ["aaa-other", "zzz-other"],
      ["zzz-other", "aaa-other"],
    ]) {
      vi.stubGlobal("BroadcastChannel", TestChannel);
      vi.stubGlobal("crypto", { randomUUID: () => "mmm-this-window" });
      useMapStore.setState({
        target: null,
        targetSetAt: undefined,
        targetSeq: undefined,
      });
      const view = render(<SyncOnly />);
      await act(async () => {
        await Promise.resolve();
      });
      const channel = TestChannel.instances.at(-1) as TestChannel;

      order.forEach((sender, index) => {
        act(() => {
          channel.onmessage?.({
            data: {
              kind: "snapshot",
              sender,
              revision: index + 1,
              domains: {
                map: {
                  target: { lat: index, lon: index, name: sender },
                  targetSetAt: 7_000,
                },
              },
            },
          } as MessageEvent);
        });
      });

      settled.push(useMapStore.getState().target?.name as string);
      view.unmount();
      vi.unstubAllGlobals();
      TestChannel.instances = [];
    }

    expect(settled).toEqual(["zzz-other", "zzz-other"]);
  });

  it("labels a handshake reply differently from a live write", async () => {
    // #859 round 15, thread 2. The receiver's replay rule needs to know which
    // is which, and this is the only thing that can tell it: a republish for
    // a joining window carries the value already held, a live broadcast is a
    // write that just happened.
    vi.stubGlobal("BroadcastChannel", TestChannel);
    const view = render(<SyncOnly />);
    await act(async () => {
      await Promise.resolve();
    });
    const [channel] = TestChannel.instances;

    act(() => {
      useMapStore.getState().setTarget({ lat: 40, lon: -80, name: "W3ABC" });
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(channel.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        domains: expect.objectContaining({ map: expect.anything() }),
        triggers: expect.objectContaining({ map: "update" }),
      }),
    );

    channel.postMessage.mockClear();
    act(() => {
      channel.onmessage?.({
        data: { kind: "request", sender: "joining-window" },
      } as MessageEvent);
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(channel.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        domains: expect.objectContaining({ map: expect.anything() }),
        triggers: expect.objectContaining({ map: "handshake" }),
      }),
    );
    view.unmount();
  });

  it("keeps a held target when a window that never picked one answers the handshake", async () => {
    // #859 round 16. A window that has never selected a target snapshots the
    // "no target has ever been set" sentinel, `targetSetAt: 0`. Counting that
    // zero as a write let an empty peer's handshake reply install its
    // unwritten `null` over a target this window was actually holding. Every
    // spelling of "never written" — `undefined`, `0`, non-finite — is read
    // the same way now.
    vi.stubGlobal("BroadcastChannel", TestChannel);
    useMapStore.setState({
      target: { lat: 40, lon: -80, name: "HELD" },
      // Held from a legacy pop-out, so there is no stamp on this side either:
      // the case where a zero on the other side used to look like the newer
      // of the two.
      targetSetAt: undefined,
      targetSeq: undefined,
    });
    const view = render(<SyncOnly />);
    await act(async () => {
      await Promise.resolve();
    });
    const [channel] = TestChannel.instances;

    act(() => {
      channel.onmessage?.({
        data: {
          kind: "snapshot",
          sender: "empty-window",
          revision: 1,
          triggers: { map: "handshake" },
          domains: {
            map: { target: null, targetSetAt: 0 },
          },
        },
      } as MessageEvent);
    });

    expect(useMapStore.getState().target).toMatchObject({ name: "HELD" });
    // And nothing was numbered: a snapshot that never wrote cannot be the
    // newest thing this window applied.
    expect(useMapStore.getState().targetSeq).toBeUndefined();
    view.unmount();
  });

  it("installs a zero-stamped target without numbering it", async () => {
    // The other half of the sentinel: a peer that *has* a target but sends
    // the zero is a window on an older bundle, so its value still wins
    // last-writer-wins (round 9) — it simply carries no write time and no
    // application number, and the wall never promotes it over something it
    // can order.
    vi.stubGlobal("BroadcastChannel", TestChannel);
    useMapStore.setState({
      target: null,
      targetSetAt: undefined,
      targetSeq: undefined,
    });
    const view = render(<SyncOnly />);
    await act(async () => {
      await Promise.resolve();
    });
    const [channel] = TestChannel.instances;

    act(() => {
      channel.onmessage?.({
        data: {
          kind: "snapshot",
          sender: "legacy-window",
          revision: 1,
          domains: {
            map: { target: { lat: 1, lon: 1, name: "OLD" }, targetSetAt: 0 },
          },
        },
      } as MessageEvent);
    });

    expect(useMapStore.getState().target).toMatchObject({ name: "OLD" });
    expect(useMapStore.getState().targetSetAt).toBeUndefined();
    expect(useMapStore.getState().targetSeq).toBeUndefined();
    view.unmount();
  });

  it("still takes a stamped clear from another window", async () => {
    // Round 13 stands: a clear that carries a real write time is a write and
    // wins on it. Only the unwritten zero is ignored.
    vi.stubGlobal("BroadcastChannel", TestChannel);
    useMapStore.setState({
      target: { lat: 40, lon: -80, name: "HELD" },
      targetSetAt: 4_000,
      targetSeq: undefined,
    });
    const view = render(<SyncOnly />);
    await act(async () => {
      await Promise.resolve();
    });
    const [channel] = TestChannel.instances;

    act(() => {
      channel.onmessage?.({
        data: {
          kind: "snapshot",
          sender: "other-window",
          revision: 1,
          triggers: { map: "update" },
          domains: {
            map: { target: null, targetSetAt: 5_000 },
          },
        },
      } as MessageEvent);
    });

    expect(useMapStore.getState().target).toBeNull();
    expect(useMapStore.getState().targetSetAt).toBe(5_000);
    expect(useMapStore.getState().targetSeq).toBeDefined();
    view.unmount();
  });

  it("leaves a legacy snapshot that carries no write time unstamped", async () => {
    // Unknown, not new (#859 round 9). A window on an older bundle answers
    // the handshake with whatever target it has had up all along; stamping
    // that with its arrival made an hours-old pick look fresher than a
    // cursor already applied here, and the next wall remount kept the stale
    // target. It must not inherit the previous target's stamp either — that
    // is what round 2 fixed — so the honest value is neither: `undefined`.
    vi.stubGlobal("BroadcastChannel", TestChannel);
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-10T00:00:00Z"));
    useMapStore.setState({
      target: { lat: 1, lon: 1, name: "OLD" },
      targetSetAt: 1_000,
    });
    const view = render(<SyncOnly />);
    await act(async () => {
      await Promise.resolve();
    });
    const [channel] = TestChannel.instances;

    act(() => {
      channel.onmessage?.({
        data: {
          kind: "snapshot",
          sender: "other-window",
          revision: 1,
          domains: {
            map: { target: { lat: 40, lon: -80, name: "W3ABC" } },
          },
        },
      } as MessageEvent);
    });

    expect(useMapStore.getState().target).toMatchObject({ name: "W3ABC" });
    expect(useMapStore.getState().targetSetAt).toBeUndefined();
    // And no fabricated local sequence: this window did not write it.
    expect(useMapStore.getState().targetSeq).toBeUndefined();
    view.unmount();
  });
});
