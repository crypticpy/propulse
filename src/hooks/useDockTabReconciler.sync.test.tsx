import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useOperationalWorkspaceSync } from "@/hooks/useMapOperationalContext";
import { useDockTabReconciler } from "@/hooks/useDockTabReconciler";
import { useContestStore } from "@/stores/contestStore";
import {
  NO_SESSION_DOCK_KEY,
  useContestUIStore,
} from "@/stores/contestUIStore";
import { useContestUIEphemeralStore } from "@/stores/contestUIEphemeralStore";
import { useMapOperationalStore } from "@/stores/mapOperationalStore";
import { useOpsPostureStore } from "@/stores/opsPostureStore";
import { useQSOStore } from "@/stores/qsoStore";
import { useRigStore } from "@/stores/rigStore";
import { DEFAULT_QSO_FORM } from "@/types/qso";

vi.mock("@/lib/supabase", () => ({
  getSupabase: vi.fn(),
  isSupabaseConfigured: false,
}));

type Message = { kind: string; domain?: string; state?: unknown };

class TestChannel {
  static instances: TestChannel[] = [];
  closed = false;
  onmessage: ((event: MessageEvent<Message>) => void) | null = null;
  postMessage = vi.fn();
  constructor() {
    TestChannel.instances.push(this);
  }
  close() {
    this.closed = true;
  }
}

/** The dock owner of one window: the sync transport plus the one reconciler. */
function Window() {
  useOperationalWorkspaceSync();
  useDockTabReconciler();
  return null;
}

function messagesOf(channel: TestChannel): Message[] {
  return channel.postMessage.mock.calls.map((call) => call[0] as Message);
}

beforeEach(() => {
  vi.stubGlobal("BroadcastChannel", TestChannel);
  TestChannel.instances = [];
  useMapOperationalStore.setState({
    manualScope: null,
    workspaceOpen: false,
    selectedReport: null,
  });
  useOpsPostureStore.getState().reset();
  useContestUIStore.setState({ dockTabBySessionId: {} });
  useContestUIEphemeralStore.setState({
    explicitDockTab: null,
    scopeReconcileRequestId: 0,
  });
  useRigStore.setState({ connected: false });
  useQSOStore.setState({ form: { ...DEFAULT_QSO_FORM, callsign: "K1ABC" } });
  useContestStore.setState({ activeSession: null });
});

afterEach(() => {
  vi.unstubAllGlobals();
  TestChannel.instances = [];
});

describe("dock tab across the /map/ops popout", () => {
  // #884 round 6 (Codex, useDockTabReconciler.ts:44): the explicit marker used
  // to live only in the clicking window, so the receiving window saw the new
  // tab plus the Observe -> Log scope change the click caused, had no marker,
  // and reconciled the shared tab straight back to Log.
  it("does not revert an explicit tab that arrived over the sync channel", async () => {
    // --- Sending window: the operator clicks Contest with the workspace shut
    // and a call in the draft, so the click itself moves the automatic scope.
    const senderWindow = render(<Window />);
    await act(async () => {
      await Promise.resolve();
    });
    const sender = TestChannel.instances.at(-1) as TestChannel;

    act(() => {
      useContestUIEphemeralStore.getState().setExplicitDockTab("contest");
      useContestUIStore.getState().setDockTab(NO_SESSION_DOCK_KEY, "contest");
      useMapOperationalStore.getState().setWorkspaceOpen(true);
    });
    await act(async () => {
      await Promise.resolve();
    });

    // The window's own reconciler publishes an arrival snapshot on mount, so
    // take the messages this click produced: the last of each domain.
    const published = messagesOf(sender).filter((m) => m.kind === "snapshot");
    const contestUi = published
      .filter((m) => m.domain === "contestUi")
      .at(-1);
    const operational = published
      .filter((m) => m.domain === "operational")
      .at(-1);
    expect(contestUi).toBeDefined();
    expect(operational).toBeDefined();
    // The marker rides with the tab it explains, and ahead of the workspace
    // change that moves the receiver's scope.
    expect(contestUi?.state).toMatchObject({ explicitDockTab: "contest" });
    expect(published.lastIndexOf(contestUi!)).toBeLessThan(
      published.lastIndexOf(operational!),
    );

    // --- Receiving window. The stores are module-global in one test process,
    // so the sender is unmounted first: what crosses to the receiver is the
    // payload and nothing else, which is exactly what a second document gets.
    senderWindow.unmount();
    useContestUIStore.setState({
      dockTabBySessionId: { [NO_SESSION_DOCK_KEY]: "log" },
    });
    useContestUIEphemeralStore.setState({ explicitDockTab: null });
    useMapOperationalStore.setState({ workspaceOpen: false });

    render(<Window />);
    await act(async () => {
      await Promise.resolve();
    });
    const receiver = TestChannel.instances.at(-1) as TestChannel;

    await act(async () => {
      receiver.onmessage?.({
        data: { ...contestUi, sender: "other-window" },
      } as unknown as MessageEvent<Message>);
      receiver.onmessage?.({
        data: { ...operational, sender: "other-window" },
      } as unknown as MessageEvent<Message>);
      await Promise.resolve();
    });

    expect(useMapOperationalStore.getState().workspaceOpen).toBe(true);
    expect(
      useContestUIStore.getState().dockTabBySessionId[NO_SESSION_DOCK_KEY],
    ).toBe("contest");
    // Consumed on both sides by the same rule, so the next real scope change
    // reconciles normally.
    expect(useContestUIEphemeralStore.getState().explicitDockTab).toBeNull();
  });

  // Second event: after the marker is consumed, a genuine scope change in the
  // receiving window moves the dock again.
  it("reconciles the shared dock again once the marker is consumed", async () => {
    useContestUIStore.setState({
      dockTabBySessionId: { [NO_SESSION_DOCK_KEY]: "contest" },
    });
    useContestUIEphemeralStore.setState({ explicitDockTab: "contest" });
    render(<Window />);
    await act(async () => {
      await Promise.resolve();
    });

    act(() => {
      useRigStore.setState({ connected: true });
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(
      useContestUIStore.getState().dockTabBySessionId[NO_SESSION_DOCK_KEY],
    ).toBe("log");
  });
});
