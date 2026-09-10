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

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
}

function deliver(channel: TestChannel, message: Message | undefined): void {
  channel.onmessage?.({
    data: { ...message, sender: "other-window" },
  } as unknown as MessageEvent<Message>);
}

function dockTab(): string | undefined {
  return useContestUIStore.getState().dockTabBySessionId[NO_SESSION_DOCK_KEY];
}


let nextRevision = 100;

/** A snapshot message as another window would put it on the channel. */
function snapshotMessage(domain: string, state: unknown): Message {
  return {
    kind: "snapshot",
    sender: "other-window",
    domain,
    revision: nextRevision++,
    state,
  } as Message & { sender: string; revision: number };
}

const CONTEST_UI_MAPS = {
  bandBySessionId: {},
  modeBySessionId: {},
  draftBySessionId: {},
  draftSelectionBySessionId: {},
  draftUpdatedAtBySessionId: {},
  publicAssistanceBySessionId: {},
};

function snapshotsSince(channel: TestChannel, from: number): Message[] {
  return messagesOf(channel)
    .slice(from)
    .filter((m) => m.kind === "snapshot");
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
    dockTabIntent: null,
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
  // #884 round 6 (Codex, useDockTabReconciler.ts:44): the explicit intent used
  // to live only in the clicking window, so the receiving window saw the new
  // tab plus the Observe -> Log scope change the click caused, had no intent,
  // and reconciled the shared tab straight back to Log.
  //
  // #884 round 7 (Codex, useDockTabReconciler.ts:69): `contestUi` and
  // `operational` are two postMessage calls, so the receiver gets two message
  // events. The intent therefore carries the scope it was stamped with and is
  // consumed only on the run where the local scope matches it — which is the
  // run driven by the *second* message. Both events are delivered in their own
  // act() below so the effect runs in between, exactly as in a real window.
  it("does not revert an explicit tab that arrived over the sync channel", async () => {
    // --- Sending window: the operator clicks Contest with the workspace shut
    // and a call in the draft, so the click itself moves the automatic scope.
    const senderWindow = render(<Window />);
    await flush();
    const sender = TestChannel.instances.at(-1) as TestChannel;

    act(() => {
      useContestUIEphemeralStore.getState().setDockTabIntent("contest");
      useContestUIStore.getState().setDockTab(NO_SESSION_DOCK_KEY, "contest");
      useMapOperationalStore.getState().setWorkspaceOpen(true);
    });
    await flush();

    // The window publishes an arrival snapshot on mount, so take the messages
    // this click produced: the last of each domain that carries the payload.
    const published = messagesOf(sender).filter((m) => m.kind === "snapshot");
    const contestUi = published
      .filter(
        (m) =>
          m.domain === "contestUi" &&
          (m.state as { dockTabIntent?: unknown } | undefined)?.dockTabIntent !=
            null,
      )
      .at(-1);
    const operational = published
      .filter((m) => m.domain === "operational")
      .at(-1);
    expect(contestUi).toBeDefined();
    expect(operational).toBeDefined();
    // The clicking window stamps the scope its own click produced, and that is
    // what crosses the channel with the tab.
    expect(contestUi?.state).toMatchObject({
      dockTabIntent: { tab: "contest", scope: "log" },
    });

    // --- Receiving window. The stores are module-global in one test process,
    // so the sender is unmounted first: what crosses to the receiver is the
    // payload and nothing else, which is exactly what a second document gets.
    senderWindow.unmount();
    useContestUIStore.setState({
      dockTabBySessionId: { [NO_SESSION_DOCK_KEY]: "log" },
    });
    useContestUIEphemeralStore.setState({ dockTabIntent: null });
    useMapOperationalStore.setState({ workspaceOpen: false });

    render(<Window />);
    await flush();
    const receiver = TestChannel.instances.at(-1) as TestChannel;

    // Event one: the tab plus the intent. The receiver's scope is still
    // Observe, so the intent is held, not consumed, and nothing is written.
    await act(async () => {
      deliver(receiver, contestUi);
      await Promise.resolve();
    });
    expect(dockTab()).toBe("contest");
    expect(useContestUIEphemeralStore.getState().dockTabIntent).toMatchObject({
      tab: "contest",
      scope: "log",
    });

    // Event two: the workspace change that moves the scope to Log. The intent
    // matches the new scope, so it is consumed here and the tab survives.
    await act(async () => {
      deliver(receiver, operational);
      await Promise.resolve();
    });
    expect(useMapOperationalStore.getState().workspaceOpen).toBe(true);
    expect(dockTab()).toBe("contest");
    expect(useContestUIEphemeralStore.getState().dockTabIntent).toBeNull();
  });

  // Expiry, half one: a click that changes nothing still releases the intent,
  // because the clicking window stamps the scope it already has and consumes
  // it on the very next run.
  it("releases the intent for a click that does not change the scope", async () => {
    useRigStore.setState({ connected: true });
    useContestUIStore.setState({
      dockTabBySessionId: { [NO_SESSION_DOCK_KEY]: "log" },
    });
    render(<Window />);
    await flush();

    act(() => {
      useContestUIEphemeralStore.getState().setDockTabIntent("dx");
      useContestUIStore.getState().setDockTab(NO_SESSION_DOCK_KEY, "dx");
    });
    await flush();

    expect(dockTab()).toBe("dx");
    expect(useContestUIEphemeralStore.getState().dockTabIntent).toBeNull();
  });

  // Expiry, half two: an intent whose paired scope change never arrives is
  // held against one other scope and then released, so the next real change
  // reconciles the dock normally.
  it("reconciles the shared dock again once the intent is consumed", async () => {
    render(<Window />);
    await flush();
    // Scope is Observe here, so this intent matches on its first run: the tab
    // stands and the intent is consumed.
    act(() => {
      useContestUIEphemeralStore.setState({
        dockTabIntent: { tab: "contest", scope: "observe" },
      });
      useContestUIStore.setState({
        dockTabBySessionId: { [NO_SESSION_DOCK_KEY]: "contest" },
      });
    });
    await flush();
    expect(dockTab()).toBe("contest");
    expect(useContestUIEphemeralStore.getState().dockTabIntent).toBeNull();

    act(() => {
      useRigStore.setState({ connected: true });
    });
    await flush();

    expect(dockTab()).toBe("log");
  });

  // #884 round 8 (Codex P1, useMapOperationalContext.ts:326): the ephemeral
  // subscriber latched every intent change, including the one a remote apply
  // had just written, so the marker was published straight back to the window
  // it came from — which consumed it and published again, forever.
  it("does not publish anything back after applying a remote intent", async () => {
    useContestUIStore.setState({
      dockTabBySessionId: { [NO_SESSION_DOCK_KEY]: "log" },
    });
    render(<Window />);
    await flush();
    const receiver = TestChannel.instances.at(-1) as TestChannel;
    const before = messagesOf(receiver).length;

    await act(async () => {
      deliver(
        receiver,
        snapshotMessage("contestUi", {
          dockTabBySessionId: { [NO_SESSION_DOCK_KEY]: "contest" },
          ...CONTEST_UI_MAPS,
          dockTabIntent: { tab: "contest", scope: "log" },
        }),
      );
      await Promise.resolve();
    });
    await act(async () => {
      deliver(
        receiver,
        snapshotMessage("operational", {
          manualScope: null,
          workspaceOpen: true,
          selectedReport: null,
        }),
      );
      await Promise.resolve();
    });
    // Several microtask turns: a ping-pong would keep producing messages.
    for (let turn = 0; turn < 5; turn += 1) await flush();

    expect(snapshotsSince(receiver, before)).toEqual([]);
    expect(dockTab()).toBe("contest");
    expect(useContestUIEphemeralStore.getState().dockTabIntent).toBeNull();

    // And the marker must not be latched either: the next ordinary local
    // publish would otherwise carry the remote intent back to its originator,
    // which consumes it and publishes again.
    const beforeLocal = messagesOf(receiver).length;
    act(() => {
      useContestUIStore.setState({
        bandBySessionId: { [NO_SESSION_DOCK_KEY]: "20m" },
      });
    });
    await flush();
    const echoed = snapshotsSince(receiver, beforeLocal).filter(
      (m) => m.domain === "contestUi",
    );
    expect(echoed).toHaveLength(1);
    expect(echoed[0]?.state).toMatchObject({ dockTabIntent: null });
  });

  // #884 round 8 (Codex P2, useMapOperationalContext.ts:392): the channel name
  // has not changed, so during a deploy a window on the previous bundle answers
  // the startup request with a contestUi snapshot that has no dockTabIntent at
  // all. Storing that `undefined` made the reconciler dereference it and throw
  // inside the effect.
  it("survives a legacy contestUi snapshot with no dock-tab intent", async () => {
    useContestUIStore.setState({
      dockTabBySessionId: { [NO_SESSION_DOCK_KEY]: "log" },
    });
    render(<Window />);
    await flush();
    const receiver = TestChannel.instances.at(-1) as TestChannel;

    await act(async () => {
      deliver(
        receiver,
        snapshotMessage("contestUi", {
          dockTabBySessionId: { [NO_SESSION_DOCK_KEY]: "contest" },
          ...CONTEST_UI_MAPS,
        }),
      );
      await Promise.resolve();
    });

    // No throw, the marker is absent rather than undefined, and the reconciler
    // keeps reconciling: the scope here is Observe, so the dock goes to DX.
    expect(useContestUIEphemeralStore.getState().dockTabIntent).toBeNull();
    await act(async () => {
      useRigStore.setState({ connected: true });
      await Promise.resolve();
    });
    expect(dockTab()).toBe("log");
  });
});
