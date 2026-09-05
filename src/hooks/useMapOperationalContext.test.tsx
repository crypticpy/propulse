import { StrictMode, useEffect } from "react";
import { act, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useOperationalWorkspaceSync } from "./useMapOperationalContext";
import { useMapOperationalStore } from "@/stores/mapOperationalStore";

vi.mock("@/lib/supabase", () => ({
  getSupabase: vi.fn(),
  isSupabaseConfigured: false,
}));

class TestChannel {
  static instances: TestChannel[] = [];
  closed = false;
  onmessage = null;
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

afterEach(() => {
  vi.unstubAllGlobals();
  TestChannel.instances = [];
  useMapOperationalStore.setState({ manualScope: null, workspaceOpen: false });
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
