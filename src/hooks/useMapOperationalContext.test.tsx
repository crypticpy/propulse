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
  postMessage = vi.fn(() => {
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
        },
      }),
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
    view.unmount();
  });

  it("stamps a legacy snapshot that carries no write time with its arrival", async () => {
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

    expect(useMapStore.getState().targetSetAt).toBe(Date.now());
    view.unmount();
  });
});
