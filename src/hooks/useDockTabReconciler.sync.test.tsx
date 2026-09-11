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

type Message = {
  kind: string;
  revision?: number;
  domains?: Record<string, unknown>;
};

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

/**
 * A snapshot message as another window would put it on the channel: one
 * message per publish, carrying every domain that changed (#884 round 14).
 */
function snapshotMessage(domains: Record<string, unknown>): Message {
  return {
    kind: "snapshot",
    sender: "other-window",
    revision: nextRevision++,
    domains,
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
    // --- Sending window: the operator clicks Contest and picks Log in the
    // scope control in the same gesture, so the click itself moves the scope
    // that crosses the channel (`manualScope` is synced; `workspaceOpen` is
    // per-window and deliberately is not — #884 round 12).
    const senderWindow = render(<Window />);
    await flush();
    const sender = TestChannel.instances.at(-1) as TestChannel;

    act(() => {
      useContestUIEphemeralStore.getState().setDockTabIntent("contest");
      useContestUIStore.getState().setDockTab(NO_SESSION_DOCK_KEY, "contest");
      useMapOperationalStore.getState().setManualScope("log");
    });
    await flush();

    // The window publishes an arrival snapshot on mount, so take the batch
    // this click produced: the last one carrying the intent.
    const batch = messagesOf(sender)
      .filter(
        (m) =>
          m.kind === "snapshot" &&
          (m.domains?.contestUi as { dockTabIntent?: unknown } | undefined)
            ?.dockTabIntent != null,
      )
      .at(-1);
    expect(batch).toBeDefined();
    // One message, both domains: the tab, the intent stamped with the scope
    // the click produced, and the scope change itself.
    expect(batch?.domains?.contestUi).toMatchObject({
      dockTabIntent: { tab: "contest", scope: "log" },
    });
    expect(batch?.domains?.operational).toMatchObject({ manualScope: "log" });

    // --- Receiving window. The stores are module-global in one test process,
    // so the sender is unmounted first: what crosses to the receiver is the
    // payload and nothing else, which is exactly what a second document gets.
    senderWindow.unmount();
    useContestUIStore.setState({
      dockTabBySessionId: { [NO_SESSION_DOCK_KEY]: "log" },
    });
    useContestUIEphemeralStore.setState({ dockTabIntent: null });
    useMapOperationalStore.setState({ manualScope: null });

    render(<Window />);
    await flush();
    const receiver = TestChannel.instances.at(-1) as TestChannel;

    // One event, one reconciler run: the run sees the transition to Log and
    // the intent that explains it together, so it adopts the clicked tab and
    // the intent dies with the run (#884 round 14).
    await act(async () => {
      deliver(receiver, batch);
      await Promise.resolve();
    });
    for (let turn = 0; turn < 3; turn += 1) await flush();

    expect(useMapOperationalStore.getState().manualScope).toBe("log");
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
        snapshotMessage({
          contestUi: {
            dockTabBySessionId: { [NO_SESSION_DOCK_KEY]: "contest" },
            ...CONTEST_UI_MAPS,
            dockTabIntent: { tab: "contest", scope: "log" },
          },
          operational: { manualScope: "log", selectedReport: null },
        }),
      );
      await Promise.resolve();
    });
    // Several microtask turns: a ping-pong would keep producing messages.
    for (let turn = 0; turn < 5; turn += 1) await flush();

    // Whatever this window publishes, it never publishes the intent back.
    const replies = snapshotsSince(receiver, before);
    expect(replies.length).toBeLessThanOrEqual(1);
    for (const reply of replies) {
      const contestUi = (reply.domains?.contestUi ?? {
        dockTabIntent: null,
      }) as Record<string, unknown>;
      expect(contestUi).toMatchObject({ dockTabIntent: null });
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
      (m) => m.domains?.contestUi !== undefined,
    );
    expect(echoed).toHaveLength(1);
    expect(echoed[0]?.domains?.contestUi).toMatchObject({
      dockTabIntent: null,
    });
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
        snapshotMessage({
          contestUi: {
            dockTabBySessionId: { [NO_SESSION_DOCK_KEY]: "contest" },
            ...CONTEST_UI_MAPS,
          },
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
    expect(WORKSPACE_CHANNEL).toBe("propulse-operating-workspace-v5");
    render(<Window />);
    await flush();
    const channel = TestChannel.instances.at(-1) as TestChannel;
    expect(channel.name).toBe(WORKSPACE_CHANNEL);
  });

  // #884 round 10 (Codex, useDockTabReconciler.ts:119): the intent is
  // ephemeral, so a window that opens *later* hydrated the persisted Contest
  // tab, had no intent, no `previous`, and reconciled the operator's choice
  // away — then broadcast that reversal to the window that made it. Since
  // round 13 the rule is simply that a first run never writes.
  it("keeps a persisted tab when a late-joining window shares the scope", async () => {
    useContestUIStore.setState({
      dockTabBySessionId: { [NO_SESSION_DOCK_KEY]: "contest" },
    });

    render(<Window />);
    await flush();
    const joiner = TestChannel.instances.at(-1) as TestChannel;

    expect(dockTab()).toBe("contest");
    // Nothing was written, so there is no reversal to broadcast.
    expect(snapshotsSince(joiner, 0)).toEqual([]);
  });

  // #884 round 13 (Codex, useDockTabReconciler.ts:150): windows legitimately
  // start at different scopes, so a startup scope that differs from the one the
  // tab was chosen under is not evidence that the tab is stale. The first run
  // adopts it either way; only a transition this window observes reconciles.
  it("adopts a persisted tab on the first run even at a different scope", async () => {
    useRigStore.setState({ connected: true }); // scope Log, auto tab would be Log
    useContestUIStore.setState({
      dockTabBySessionId: { [NO_SESSION_DOCK_KEY]: "contest" },
    });

    render(<Window />);
    await flush();
    const joiner = TestChannel.instances.at(-1) as TestChannel;

    expect(dockTab()).toBe("contest");
    expect(snapshotsSince(joiner, 0)).toEqual([]);
  });

  // The other half of the rule: a transition the window actually sees does
  // reconcile, and writes the automatic tab.
  it("reconciles on a scope transition the window observes", async () => {
    useContestUIStore.setState({
      dockTabBySessionId: { [NO_SESSION_DOCK_KEY]: "contest" },
    });

    render(<Window />);
    await flush();
    expect(dockTab()).toBe("contest");

    act(() => {
      useRigStore.setState({ connected: true });
    });
    await flush();

    expect(dockTab()).toBe("log");
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
    expect(dockTab()).toBe("contest");

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
    useContestUIStore.setState({
      dockTabBySessionId: { [NO_SESSION_DOCK_KEY]: "contest" },
    });
    useMapOperationalStore.setState({ workspaceOpen: false });

    render(<PropSphereOpsWindow />);
    await flush();
    const popout = TestChannel.instances.at(-1) as TestChannel;

    // The startup effect ran, and the reconciler's first run saw the scope it
    // produced.
    expect(useMapOperationalStore.getState().workspaceOpen).toBe(true);
    expect(dockTab()).toBe("contest");
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
    });

    render(<Window />);
    await flush();
    const reloaded = TestChannel.instances.at(-1) as TestChannel;
    // Nothing may arrive late and flip this.
    for (let turn = 0; turn < 3; turn += 1) await flush();

    expect(dockTab()).toBe("contest");
    expect(snapshotsSince(reloaded, 0)).toEqual([]);
  });

  // #884 round 13 (Codex, useDockTabReconciler.ts:150): the popout is open at
  // Log with the operator's Contest tab; the main window is reloaded and starts
  // collapsed at Observe. Its first run used to reject the tab because the
  // startup scopes differed, write DX and broadcast that over the popout's
  // choice. A first run now never writes, so both windows keep Contest.
  it("keeps the popout's explicit tab when the main window reloads collapsed", async () => {
    // The popout made the choice under Log; the store is what a reload rehydrates.
    useContestUIStore.setState({
      dockTabBySessionId: { [NO_SESSION_DOCK_KEY]: "contest" },
    });
    // The reloaded main window: workspace collapsed, no rig, so scope Observe.
    useMapOperationalStore.setState({ workspaceOpen: false });
    useRigStore.setState({ connected: false });

    render(<Window />);
    await flush();
    const reloaded = TestChannel.instances.at(-1) as TestChannel;
    for (let turn = 0; turn < 3; turn += 1) await flush();

    // Contest stands in the shared persisted state both windows read...
    expect(dockTab()).toBe("contest");
    // ...and no DX write was broadcast to the popout.
    expect(snapshotsSince(reloaded, 0)).toEqual([]);
  });

  // #884 round 15 (Codex, useDockTabReconciler.ts:150): round 13's first run
  // returned unconditionally, so a dock that had never been given a tab stayed
  // empty and the console sat on its DX fallback. At Log scope no transition
  // is coming to fix that: the window started there.
  it("initialises an empty dock from a Log startup scope", async () => {
    useRigStore.setState({ connected: true });

    render(<Window />);
    await flush();

    expect(dockTab()).toBe("log");
  });

  it("initialises an empty dock from an Observe startup scope", async () => {
    render(<Window />);
    await flush();

    expect(dockTab()).toBe("dx");
  });

  // The refinement is only about an *empty* dock: a dock that has a selection
  // is still adopted as it stands, whatever the startup scope.
  it("still adopts an existing selection rather than initialising it", async () => {
    useRigStore.setState({ connected: true });
    useContestUIStore.setState({
      dockTabBySessionId: { [NO_SESSION_DOCK_KEY]: "contest" },
    });

    render(<Window />);
    await flush();
    const window_ = TestChannel.instances.at(-1) as TestChannel;

    expect(dockTab()).toBe("contest");
    expect(snapshotsSince(window_, 0)).toEqual([]);
  });

  // #884 round 14 (Codex, useDockTabReconciler.ts:125): the popout is at Log
  // because of its own `workspaceOpen`, which is per-window and not on the wire
  // (#884 round 12). A tab click there therefore sends an intent stamped `log`
  // with no scope change at all for the collapsed main window at Observe. The
  // old rule held that intent until some later run matched it, so when a rig
  // connected months of clicks later the equality branch mistook the genuine
  // Observe -> Log transition for the click's paired update and skipped
  // reconciliation. An intent now lives exactly one run.
  it("discards an intent that no scope change explains, and still reconciles later", async () => {
    useContestUIStore.setState({
      dockTabBySessionId: { [NO_SESSION_DOCK_KEY]: "log" },
    });
    render(<Window />);
    await flush();
    const main = TestChannel.instances.at(-1) as TestChannel;

    // The popout's click: the tab and a Log-stamped intent, no operational
    // payload, because nothing the click touched is synced.
    await act(async () => {
      deliver(
        main,
        snapshotMessage({
          contestUi: {
            dockTabBySessionId: { [NO_SESSION_DOCK_KEY]: "contest" },
            ...CONTEST_UI_MAPS,
            dockTabIntent: { tab: "contest", scope: "log" },
          },
        }),
      );
      await Promise.resolve();
    });
    for (let turn = 0; turn < 3; turn += 1) await flush();

    // This window did not transition, so it wrote nothing — and the intent is
    // gone rather than waiting for a match it will never legitimately get.
    expect(dockTab()).toBe("contest");
    expect(useContestUIEphemeralStore.getState().dockTabIntent).toBeNull();

    // Later, and for an unrelated reason, CAT connects and this window really
    // does move to Log. With no stale intent to excuse it, the transition
    // reconciles as any other would.
    await act(async () => {
      useRigStore.setState({ connected: true });
      await Promise.resolve();
    });
    await flush();

    expect(dockTab()).toBe("log");
  });

  // The other half of the one-run lifetime: an intent that arrives on a run
  // which is not a transition at all is discarded just the same, and the run
  // itself writes nothing because nothing moved.
  it("discards an intent delivered on a run that is not a transition", async () => {
    useRigStore.setState({ connected: true });
    useContestUIStore.setState({
      dockTabBySessionId: { [NO_SESSION_DOCK_KEY]: "log" },
    });
    render(<Window />);
    await flush();
    const main = TestChannel.instances.at(-1) as TestChannel;

    await act(async () => {
      deliver(
        main,
        snapshotMessage({
          contestUi: {
            dockTabBySessionId: { [NO_SESSION_DOCK_KEY]: "contest" },
            ...CONTEST_UI_MAPS,
            // Stamped with the scope this window is already sitting at.
            dockTabIntent: { tab: "contest", scope: "log" },
          },
        }),
      );
      await Promise.resolve();
    });
    for (let turn = 0; turn < 3; turn += 1) await flush();

    expect(useContestUIEphemeralStore.getState().dockTabIntent).toBeNull();
    expect(dockTab()).toBe("contest");
  });

  // #884 round 12 (Codex, PropSphereOpsWindow.tsx:31): the popout applies its
  // startup state before the sync subscription exists, so that write is never
  // published. It then sends the startup request and the main window — whose
  // own `workspaceOpen` is false — replies. Accepting that reply undid the
  // popout's startup state and flipped its scope from Log back to Observe.
  // `workspaceOpen` is per-window, so it is off the wire entirely.
  it("keeps its own workspace flag when the handshake reply says otherwise", async () => {
    useContestUIStore.setState({
      dockTabBySessionId: { [NO_SESSION_DOCK_KEY]: "contest" },
    });
    useMapOperationalStore.setState({ workspaceOpen: false });

    render(<PropSphereOpsWindow />);
    await flush();
    const popout = TestChannel.instances.at(-1) as TestChannel;
    const before = messagesOf(popout).length;

    // The main window answers the startup request with its own state, in which
    // the inline workspace is shut.
    await act(async () => {
      deliver(
        popout,
        snapshotMessage({
          operational: {
            manualScope: null,
            workspaceOpen: false,
            selectedReport: null,
          },
        }),
      );
      await Promise.resolve();
    });
    for (let turn = 0; turn < 3; turn += 1) await flush();

    // The popout is the workspace: its flag, its scope and the operator's tab
    // all stand, and it has no reversal to broadcast.
    expect(useMapOperationalStore.getState().workspaceOpen).toBe(true);
    expect(dockTab()).toBe("contest");
    expect(snapshotsSince(popout, before)).toEqual([]);
  });

  // The mirror image: a window with its inline workspace open keeps it when a
  // peer's snapshot arrives, so closing the popout cannot shut the main
  // window's panel. Everything else in the payload still applies.
  it("does not take another window's workspace flag, but still takes its scope", async () => {
    useMapOperationalStore.setState({ workspaceOpen: true });
    render(<Window />);
    await flush();
    const main = TestChannel.instances.at(-1) as TestChannel;

    await act(async () => {
      deliver(
        main,
        snapshotMessage({
          operational: {
            manualScope: "contest",
            workspaceOpen: false,
            selectedReport: null,
          },
        }),
      );
      await Promise.resolve();
    });

    expect(useMapOperationalStore.getState().workspaceOpen).toBe(true);
    expect(useMapOperationalStore.getState().manualScope).toBe("contest");
  });
});
