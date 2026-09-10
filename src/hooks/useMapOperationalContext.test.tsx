import { StrictMode, useEffect } from "react";
import { act, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useOperationalWorkspaceSync } from "./useMapOperationalContext";
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
  constructor() { TestChannel.instances.push(this); }
  close() { this.closed = true; }
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
  useMapStore.setState({ target: null, targetSetAt: 0 });
});

describe("operational workspace synchronization cleanup", () => {
  it("discards pending publishes when StrictMode replaces the channel", async () => {
    vi.stubGlobal("BroadcastChannel", TestChannel);
    const view = render(<StrictMode><Harness /></StrictMode>);
    await act(async () => { await Promise.resolve(); });
    const [retired, active] = TestChannel.instances;
    expect(retired.closed).toBe(true);
    expect(retired.postMessage).toHaveBeenCalledTimes(1); // initial handshake only
    expect(active.closed).toBe(false);
    act(() => useMapOperationalStore.getState().setWorkspaceOpen(true));
    view.unmount();
    await act(async () => { await Promise.resolve(); });
    expect(active.postMessage).toHaveBeenCalledTimes(1);
  });

  it("still publishes updates while mounted", async () => {
    vi.stubGlobal("BroadcastChannel", TestChannel);
    const view = render(<Harness />);
    await act(async () => { await Promise.resolve(); });
    const [channel] = TestChannel.instances;
    expect(channel.postMessage).toHaveBeenCalledWith(expect.objectContaining({
      kind: "snapshot", domain: "operational",
      state: expect.objectContaining({ manualScope: "log" }),
    }));
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
        domain: "map",
        state: {
          target: expect.objectContaining({ name: "W3ABC" }),
          targetSetAt: useMapStore.getState().targetSetAt,
          targetSeq: useMapStore.getState().targetSeq,
        },
      }),
    );
    view.unmount();
  });

  it("publishes a stamp-only write, where the target object never changed", async () => {
    // #859 round 10, thread 1. Re-selecting an entry from `recentTargets`
    // hands `setTarget` the object already held, so only the stamp moves. A
    // publish predicate watching the target *reference* saw nothing, the
    // other window kept a stale sequence, and its wall then let a cursor
    // that was actually older win the remount. The predicate must observe
    // every field that travels.
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
        .map(([message]) => message as { domain: string; state: { targetSeq?: number } })
        .filter((message) => message.domain === "map");
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
    expect(mapMessages[mapMessages.length - 1]?.state.targetSeq).toBe(
      useMapStore.getState().targetSeq,
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

    act(() => {
      channel.onmessage?.({
        data: {
          kind: "snapshot",
          sender: "other-window",
          domain: "map",
          revision: 1,
          state: {
            target: { lat: 40, lon: -80, name: "W3ABC" },
            targetSetAt: 9_000,
          },
        },
      } as MessageEvent);
    });

    expect(useMapStore.getState().target).toMatchObject({ name: "W3ABC" });
    expect(useMapStore.getState().targetSetAt).toBe(9_000);
    // The sender's sequence numbers mean nothing here and this window did not
    // write the target, so it takes no sequence of its own (#859 round 9).
    expect(useMapStore.getState().targetSeq).toBeUndefined();
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
          domain: "map",
          revision: 1,
          state: { target: { lat: 40, lon: -80, name: "W3ABC" } },
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
