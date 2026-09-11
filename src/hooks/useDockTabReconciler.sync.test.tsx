import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  useOperationalWorkspaceSync,
  WORKSPACE_CHANNEL,
} from "@/hooks/useMapOperationalContext";
import { useDockTabReconciler } from "@/hooks/useDockTabReconciler";
import { PropSphereOpsWindow } from "@/pages/PropSphereOpsWindow";
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

// The popout host is exercised for its startup ordering, not its console.
vi.mock("@/components/ops/OpsConsole", () => ({
  OpsConsole: () => null,
}));
vi.mock("@/hooks/useOperatingSync", () => ({ useOperatingSync: () => {} }));
vi.mock("@/hooks/useRigBridgeSync", () => ({ useRigBridgeSync: () => {} }));

type Message = { kind: string; domain?: string; state?: unknown };

class TestChannel {
  static instances: TestChannel[] = [];
  closed = false;
  onmessage: ((event: MessageEvent<Message>) => void) | null = null;
  postMessage = vi.fn();
  readonly name: string;
  constructor(name: string) {
    this.name = name;
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
  useContestUIStore.setState({
    dockTabBySessionId: {},
    explicitDockTabScopeByDockKey: {},
  });
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

    // The only thing this window may publish is the explicit-scope marker it
    // recorded when it consumed the intent (#884 round 10), and never the
    // intent itself. Nothing else, and nothing that keeps going.
    const replies = snapshotsSince(receiver, before);
    expect(replies.length).toBeLessThanOrEqual(1);
    for (const reply of replies) {
      expect(reply.domain).toBe("contestUi");
      expect(reply.state).toMatchObject({ dockTabIntent: null });
    }
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

  // #884 round 8 (Codex P2, useMapOperationalContext.ts:392): a peer on the
  // same channel can send a contestUi snapshot with no dockTabIntent at all,
  // and storing that `undefined` made the reconciler dereference it and throw
  // inside the effect. Since round 9 bumped the channel to v3 the sender is no
  // longer a window on an older bundle — this now covers a malformed payload
  // from a peer on the *same* version, which the normalizers still guard.
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

  // #884 round 9 (Codex, useMapOperationalContext.ts:208): normalizing only
  // protects new-from-old. An old receiver on the same channel ignores
  // dockTabIntent entirely, reconciles the dock from the scope change the click
  // caused, and broadcasts that reversal back. The version in the channel name
  // is what keeps mixed-version windows apart, so it is asserted here: a future
  // payload change that would mean something different to an existing receiver
  // has to bump it consciously.
  it("talks on the versioned workspace channel", async () => {
    expect(WORKSPACE_CHANNEL).toBe("propulse-operating-workspace-v4");
    render(<Window />);
    await flush();
    const channel = TestChannel.instances.at(-1) as TestChannel;
    expect(channel.name).toBe(WORKSPACE_CHANNEL);
  });

  // #884 round 10 (Codex, useDockTabReconciler.ts:119): the intent is
  // ephemeral, so a window that opens *later* hydrated the persisted Contest
  // tab, had no intent, no `previous`, and reconciled the operator's choice
  // away — then broadcast that reversal to the window that made it.
  it("keeps a persisted explicit tab when a late-joining window shares the scope", async () => {
    useContestUIStore.setState({
      dockTabBySessionId: { [NO_SESSION_DOCK_KEY]: "contest" },
      // Chosen under Observe, which is still the derived scope here.
      explicitDockTabScopeByDockKey: { [NO_SESSION_DOCK_KEY]: "observe" },
    });

    render(<Window />);
    await flush();
    const joiner = TestChannel.instances.at(-1) as TestChannel;

    expect(dockTab()).toBe("contest");
    // Nothing was written, so there is no reversal to broadcast.
    expect(snapshotsSince(joiner, 0)).toEqual([]);
    // The marker stands until the scope actually changes, so a third window
    // joining now honours it too.
    expect(
      useContestUIStore.getState().explicitDockTabScopeByDockKey[
        NO_SESSION_DOCK_KEY
      ],
    ).toBe("observe");
  });

  // The other half of the rule: a marker from a scope that has since moved is
  // stale, so the late joiner reconciles normally and drops it.
  it("reconciles a persisted tab whose explicit scope has since changed", async () => {
    useContestUIStore.setState({
      dockTabBySessionId: { [NO_SESSION_DOCK_KEY]: "contest" },
      // Chosen under Log; the derived scope here is Observe.
      explicitDockTabScopeByDockKey: { [NO_SESSION_DOCK_KEY]: "log" },
    });

    render(<Window />);
    await flush();

    expect(dockTab()).toBe("dx");
    expect(
      useContestUIStore.getState().explicitDockTabScopeByDockKey[
        NO_SESSION_DOCK_KEY
      ],
    ).toBeUndefined();
  });

  // The clicking window has `previous === null` after a reload too, so it lost
  // its own choice the same way. One fix covers both.
  it("keeps the tab when the window that made the choice reloads", async () => {
    const clicking = render(<Window />);
    await flush();

    act(() => {
      useContestUIEphemeralStore.getState().setDockTabIntent("contest");
      useContestUIStore.getState().setDockTab(NO_SESSION_DOCK_KEY, "contest");
    });
    await flush();
    // Consuming the intent is what records the scope the choice was made under.
    expect(
      useContestUIStore.getState().explicitDockTabScopeByDockKey[
        NO_SESSION_DOCK_KEY
      ],
    ).toBe("observe");

    // Reload: the document goes away with everything ephemeral in it, and the
    // persisted stores come back.
    clicking.unmount();
    useContestUIEphemeralStore.setState({
      dockTabIntent: null,
      scopeReconcileRequestId: 0,
    });

    render(<Window />);
    await flush();
    const reloaded = TestChannel.instances.at(-1) as TestChannel;

    expect(dockTab()).toBe("contest");
    expect(snapshotsSince(reloaded, 0)).toEqual([]);
  });

  // #884 round 11 (Codex, useDockTabReconciler.ts:124): `workspaceOpen` is not
  // persisted, so a fresh popout starts with it false. Opening it in an effect
  // beside the reconciler gave the reconciler a first run at Observe — a scope
  // the window was about to leave — which rejected the Log marker, cleared it
  // and wrote DX before the second run settled on Log. The startup state is now
  // applied before the console (and the reconciler) mounts.
  it("keeps an explicit tab when the popout opens the workspace on startup", async () => {
    // The choice was made while the workspace was open, so it belongs to Log.
    useContestUIStore.setState({
      dockTabBySessionId: { [NO_SESSION_DOCK_KEY]: "contest" },
      explicitDockTabScopeByDockKey: { [NO_SESSION_DOCK_KEY]: "log" },
    });
    useMapOperationalStore.setState({ workspaceOpen: false });

    render(<PropSphereOpsWindow />);
    await flush();
    const popout = TestChannel.instances.at(-1) as TestChannel;

    // The startup effect ran, and the reconciler's first run saw the scope it
    // produced.
    expect(useMapOperationalStore.getState().workspaceOpen).toBe(true);
    expect(dockTab()).toBe("contest");
    expect(
      useContestUIStore.getState().explicitDockTabScopeByDockKey[
        NO_SESSION_DOCK_KEY
      ],
    ).toBe("log");
    // No DX write, so no reversal to broadcast to the window that made the
    // choice.
    expect(snapshotsSince(popout, 0)).toEqual([]);
  });

  // The main window has no startup effect that moves the scope: its only
  // `setWorkspaceOpen(true)` is an operator action. A reload therefore starts
  // at its final scope and the marker decides, with nothing arriving late.
  it("keeps an explicit tab across a main-window reload at the same scope", async () => {
    useRigStore.setState({ connected: true });
    useContestUIStore.setState({
      dockTabBySessionId: { [NO_SESSION_DOCK_KEY]: "contest" },
      explicitDockTabScopeByDockKey: { [NO_SESSION_DOCK_KEY]: "log" },
    });

    render(<Window />);
    await flush();
    const reloaded = TestChannel.instances.at(-1) as TestChannel;
    // Nothing may arrive late and flip this.
    for (let turn = 0; turn < 3; turn += 1) await flush();

    expect(dockTab()).toBe("contest");
    expect(snapshotsSince(reloaded, 0)).toEqual([]);
  });
});
