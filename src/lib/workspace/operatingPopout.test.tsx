import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  useMapOperationalContext,
  useOperationalWorkspaceSync,
} from "@/hooks/useMapOperationalContext";
import { WORKSPACE_CHANNEL } from "@/lib/map/workspaceChannel";
import {
  openOperatingPopout,
  resetOperatingPopoutLiveness,
} from "@/lib/workspace/operatingPopout";
import { useMapOperationalStore } from "@/stores/mapOperationalStore";
import { useQSOStore } from "@/stores/qsoStore";
import { useRigStore } from "@/stores/rigStore";
import { useWSJTXStore } from "@/stores/wsjtxStore";
import { useContestStore } from "@/stores/contestStore";
import { DEFAULT_QSO_FORM } from "@/types/qso";
import type { MapDataPolicy, MapDataScope } from "@/lib/map/operationalScope";

vi.mock("@/lib/supabase", () => ({
  getSupabase: vi.fn(),
  isSupabaseConfigured: false,
}));

class TestChannel {
  static instances: TestChannel[] = [];
  onmessage: ((event: MessageEvent<unknown>) => void) | null = null;
  postMessage = vi.fn();
  readonly name: string;
  constructor(name: string) {
    this.name = name;
    TestChannel.instances.push(this);
  }
  close() {}
}

let observed: { scope: MapDataScope; policy: MapDataPolicy } | null = null;

/** The opener: the sync transport plus whatever reads the derived scope. */
function OpenerWindow() {
  useOperationalWorkspaceSync();
  const { scope, policy } = useMapOperationalContext();
  observed = { scope, policy };
  return null;
}

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
}

/** What a popout posts on `pagehide`, on the same channel. */
function deliverPopoutClosed(): void {
  for (const channel of TestChannel.instances) {
    channel.onmessage?.({
      data: { kind: "popout-closed" },
    } as MessageEvent<unknown>);
  }
}

let popoutWindow: { closed: boolean };

beforeEach(() => {
  vi.stubGlobal("BroadcastChannel", TestChannel);
  TestChannel.instances = [];
  observed = null;
  resetOperatingPopoutLiveness();
  popoutWindow = { closed: false };
  vi.stubGlobal(
    "open",
    vi.fn(() => popoutWindow as unknown as Window),
  );
  useMapOperationalStore.setState({
    manualScope: null,
    workspaceOpen: false,
    workspacePopoutOpen: false,
    selectedReport: null,
  });
  // A nonempty draft is what turns an open workspace into Log scope.
  useQSOStore.setState({ form: { ...DEFAULT_QSO_FORM, callsign: "K1ABC" } });
  useRigStore.setState({ connected: false });
  useWSJTXStore.setState({ connected: false });
  useContestStore.setState({ activeSession: null });
});

afterEach(() => {
  vi.unstubAllGlobals();
  resetOperatingPopoutLiveness();
});

describe("operating popout liveness in the opening window", () => {
  // #884 round 15 (Codex, useMapOperationalContext.ts:326): opening the popout
  // set the opener's own `workspaceOpen` — the inline dock's flag — and nothing
  // ever cleared it, because the child's collapse only clears its own copy and
  // `workspaceOpen` has been per-window since round 12. The opener stayed in
  // automatic Log scope with public activity suppressed after the popout was
  // gone.
  it("leaves Log scope and restores public activity when the popout closes", async () => {
    render(<OpenerWindow />);
    await flush();
    expect(observed?.scope).toBe("observe");

    act(() => {
      openOperatingPopout();
    });
    await flush();
    // A live popout is operating, so the opener follows it into Log.
    expect(observed?.scope).toBe("log");
    expect(observed?.policy.surfaces.liveSpots).not.toContain("public");

    // The operator closes it: `pagehide` posts, and by the time the opener
    // looks at the handle the window is gone.
    popoutWindow.closed = true;
    await act(async () => {
      deliverPopoutClosed();
      await Promise.resolve();
    });

    expect(observed?.scope).toBe("observe");
    expect(observed?.policy.surfaces.liveSpots).toContain("public");
  });

  // A reload posts the same `pagehide` message, so the message cannot be the
  // decision: the handle is. It is still open across a reload, so liveness —
  // and the opener's scope — hold, with no flap for the new document to undo.
  it("keeps liveness across a popout reload", async () => {
    render(<OpenerWindow />);
    await flush();
    act(() => {
      openOperatingPopout();
    });
    await flush();
    expect(observed?.scope).toBe("log");

    await act(async () => {
      deliverPopoutClosed(); // pagehide of the outgoing document
      await Promise.resolve();
    });

    expect(useMapOperationalStore.getState().workspacePopoutOpen).toBe(true);
    expect(observed?.scope).toBe("log");
  });

  // The two facts stay apart: a popout is not the inline dock.
  it("never sets the opener's inline workspace flag", async () => {
    render(<OpenerWindow />);
    await flush();

    act(() => {
      openOperatingPopout();
    });
    await flush();

    expect(useMapOperationalStore.getState().workspaceOpen).toBe(false);
    expect(useMapOperationalStore.getState().workspacePopoutOpen).toBe(true);
  });

  // A blocked popup is not a popout.
  it("does not claim liveness when the popup is blocked", async () => {
    vi.stubGlobal(
      "open",
      vi.fn(() => null),
    );
    render(<OpenerWindow />);
    await flush();

    act(() => {
      openOperatingPopout();
    });
    await flush();

    expect(useMapOperationalStore.getState().workspacePopoutOpen).toBe(false);
    expect(observed?.scope).toBe("observe");
  });

  // The browser can kill the tab without any message at all; regaining focus
  // is the other moment the opener re-reads the handle.
  it("clears liveness on focus when the popout died silently", async () => {
    render(<OpenerWindow />);
    await flush();
    act(() => {
      openOperatingPopout();
    });
    await flush();
    expect(observed?.scope).toBe("log");

    popoutWindow.closed = true;
    await act(async () => {
      window.dispatchEvent(new Event("focus"));
      await Promise.resolve();
    });

    expect(observed?.scope).toBe("observe");
  });

  it("opens the popout on the same workspace channel name", async () => {
    render(<OpenerWindow />);
    await flush();
    expect(TestChannel.instances.at(-1)?.name).toBe(WORKSPACE_CHANNEL);
  });
});
