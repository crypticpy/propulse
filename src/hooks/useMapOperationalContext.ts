import { hamClockProjectionContent } from "@/lib/hamclock/displayLayout";
import { useHamClockDisplayStore } from "@/stores/hamclockDisplayStore";
import { useHamClockStore } from "@/stores/hamclockStore";
import { useEffect, useMemo } from "react";
import { useContestStore } from "@/stores/contestStore";
import { useContestUIStore } from "@/stores/contestUIStore";
import {
  useContestUIEphemeralStore,
  type DockTabIntent,
} from "@/stores/contestUIEphemeralStore";
import { useDXStore } from "@/stores/dxStore";
import { useMapStore } from "@/stores/mapStore";
import { useMapOperationalStore } from "@/stores/mapOperationalStore";
import { useQSOStore } from "@/stores/qsoStore";
import { useRigStore } from "@/stores/rigStore";
import { useWSJTXStore } from "@/stores/wsjtxStore";
import {
  applyMapDataPolicyToLayers,
  buildMapDataPolicy,
  deriveMapDataScope,
  type MapDataPolicy,
  type MapDataScope,
} from "@/lib/map/operationalScope";
import { resolveMapPolicyScope } from "@/lib/map/contactMapPolicy";
import {
  normalizeContestUiState,
  normalizeDockTabIntent,
  normalizeOperationalState,
} from "@/lib/map/workspaceSyncPayload";
import { useOpsPostureStore } from "@/stores/opsPostureStore";

export interface MapOperationalContext {
  scope: MapDataScope;
  automaticScope: MapDataScope;
  manualScope: MapDataScope | null;
  policy: MapDataPolicy;
  contestSessionId: string | null;
  workspaceOpen: boolean;
}

/** One source of truth for scope precedence and contest assistance policy. */
export function useMapOperationalContext(): MapOperationalContext {
  const activeSession = useContestStore((state) => state.activeSession);
  const rigConnected = useRigStore((state) => state.connected);
  const wsjtxConnected = useWSJTXStore((state) => state.connected);
  const qsoDraftCallsign = useQSOStore((state) => state.form.callsign);
  const manualScope = useMapOperationalStore((state) => state.manualScope);
  const workspaceOpen = useMapOperationalStore((state) => state.workspaceOpen);
  const opsPosture = useOpsPostureStore((state) => state.posture);
  const contestSessionId = activeSession?.id ?? null;
  const storedAssistance = useContestUIStore((state) =>
    contestSessionId
      ? state.publicAssistanceBySessionId[contestSessionId]
      : undefined,
  );
  const declaredAssisted =
    (
      activeSession?.categories as
        | { assisted?: "assisted" | "non-assisted" }
        | undefined
    )?.assisted === "assisted";
  const stationOperationActive =
    rigConnected ||
    wsjtxConnected ||
    (workspaceOpen && qsoDraftCallsign.trim().length > 0);
  const automaticScope = deriveMapDataScope({
    manualScope: null,
    contestActive: Boolean(activeSession),
    stationOperationActive,
  });
  const scope = deriveMapDataScope({
    manualScope,
    contestActive: Boolean(activeSession),
    stationOperationActive,
  });
  const publicAssistance = storedAssistance ?? declaredAssisted;
  const policy = useMemo(
    () =>
      buildMapDataPolicy(
        resolveMapPolicyScope(scope, opsPosture),
        publicAssistance,
      ),
    [opsPosture, publicAssistance, scope],
  );

  return {
    scope,
    automaticScope,
    manualScope,
    policy,
    contestSessionId,
    workspaceOpen,
  };
}

/** Renderer adapter: preserve configured layers and derive focused visibility. */
export function useScopedMapLayers() {
  const configuredLayers = useMapStore((state) => state.layers);
  const hamClock = useMapStore(s => s.layoutMode === "hamclock");
  const mode = useHamClockStore(s => s.hamclockMode);
  const content = useHamClockDisplayStore(s => s.mapContent);
  const projection = useMapStore(s => s.viewMode);
  const hamClockContent = hamClock && (mode === "traffic" || mode === "bands") ? hamClockProjectionContent(projection, content) : undefined;
  const { policy } = useMapOperationalContext();
  return useMemo(
    () => applyMapDataPolicyToLayers(configuredLayers, policy, hamClockContent),
    [configuredLayers, policy, hamClockContent],
  );
}

type WorkspaceSnapshot = {
  /**
   * `workspaceOpen` is deliberately absent (#884 round 12). It is per-window UI
   * state — the popout *is* the workspace, so its flag is true by
   * construction, while the main window's flag describes its own inline panel.
   * Syncing it let one window's value overwrite the other's, which moved the
   * receiving window's derived scope (`workspaceOpen && draft callsign` is a
   * `stationOperationActive` term) and undid a popout's startup state on the
   * handshake reply. Nothing reads another window's value: the only consumer
   * is this hook's own scope derivation.
   */
  operational: Pick<
    ReturnType<typeof useMapOperationalStore.getState>,
    "manualScope" | "selectedReport"
  >;
  qso: Pick<
    ReturnType<typeof useQSOStore.getState>,
    "form" | "operatingMode"
  >;
  map: Pick<ReturnType<typeof useMapStore.getState>, "target">;
  dx: Pick<ReturnType<typeof useDXStore.getState>, "selectedSpot">;
  contest: Pick<
    ReturnType<typeof useContestStore.getState>,
    "activeSession" | "sessionHistory"
  >;
  contestUi: Pick<
    ReturnType<typeof useContestUIStore.getState>,
    | "dockTabBySessionId"
    | "bandBySessionId"
    | "modeBySessionId"
    | "draftBySessionId"
    | "draftSelectionBySessionId"
    | "draftUpdatedAtBySessionId"
    | "publicAssistanceBySessionId"
  > & {
    /**
     * The operator's explicit dock-tab choice travels with the tab it explains
     * (#884 round 6). Without it the receiving window sees only the tab plus
     * the scope change the click caused, has no intent, and reconciles the
     * shared tab straight back. It carries the scope it is paired with, so the
     * receiver can tell the transition the click explains from any other one
     * (#884 round 7). Since round 14 it rides in the same message as that
     * scope change and lives only until the receiver's next reconciler run.
     * Ephemeral in both windows, never persisted.
     */
    dockTabIntent: DockTabIntent | null;
  };
};

type WorkspaceDomain = keyof WorkspaceSnapshot;

const WORKSPACE_DOMAINS: readonly WorkspaceDomain[] = [
  "operational",
  "qso",
  "map",
  "dx",
  "contest",
  "contestUi",
];

type WorkspaceMessage =
  | { kind: "request"; sender: string }
  | {
      kind: "snapshot";
      sender: string;
      revision: number;
      /**
       * Every domain one publish produced, in one message (#884 round 14). The
       * domains of a single change used to go out as separate messages, and a
       * BroadcastChannel delivers each in its own task — so the receiver ran
       * its effects between them and saw the dock tab before the scope change
       * that explains it. One message is one task is one effect pass.
       */
      domains: Partial<WorkspaceSnapshot>;
    };

/**
 * The local operating-workspace wire between the docked console and the
 * `/map/ops` popout.
 *
 * **Bump this version whenever a payload field changes meaning for an existing
 * receiver** — a new field, a removed field, or a field an older receiver would
 * act on differently. Mixed-version windows must not share a protocol they do
 * not share: during a deploy the two windows run different bundles, and a
 * receiver that does not understand the newer payload acts on the part it does
 * understand and broadcasts the result back. v3 carries `dockTabIntent`; a v2
 * receiver ignored it, reconciled the dock tab from the scope change alone and
 * broadcast that reversal to the new window (#884 round 9). The cost of a bump
 * is a brief loss of cross-window sync during the deploy overlap, which a
 * reload restores; that is cheaper than capability negotiation, and far cheaper
 * than a peer undoing the operator's choice. v4 dropped `workspaceOpen` (it is
 * per-window, #884 round 12) and, with it, any field a v3 receiver would act on
 * differently. v5 replaced the per-domain message with one batched message per
 * publish (#884 round 14): a v4 receiver would find neither `domain` nor
 * `state` and silently drop every update.
 *
 * This is the only wire that carries `contestUi` or the dock-tab intent. The
 * other BroadcastChannels are separate protocols with their own versions:
 * `propulse-operating-state-v1` (`OPERATING_CHANNEL_NAME` /
 * `OPERATING_PROTOCOL_VERSION` in `@/lib/workspace/operatingChannel`),
 * `propulse-operating-monitor-v1` (`useOperatingMonitor`) and
 * `propulse-contest-events-v1` (`contestEventBus`). None of them changed here.
 */
export const WORKSPACE_CHANNEL = "propulse-operating-workspace-v5";

/**
 * Only a *stamped* intent means anything to another window: an unstamped one
 * has no scope to pair with there, and the stamp follows in the same task.
 */
function stampedDockTabIntent(): DockTabIntent | null {
  const intent = useContestUIEphemeralStore.getState().dockTabIntent;
  return intent !== null && intent.scope !== null ? intent : null;
}

function createWorkspaceSnapshot(): WorkspaceSnapshot {
  const operational = useMapOperationalStore.getState();
  const qso = useQSOStore.getState();
  const map = useMapStore.getState();
  const dx = useDXStore.getState();
  const contest = useContestStore.getState();
  const contestUi = useContestUIStore.getState();
  return {
    operational: {
      manualScope: operational.manualScope,
      selectedReport: operational.selectedReport,
    },
    qso: { form: qso.form, operatingMode: qso.operatingMode },
    map: { target: map.target },
    dx: { selectedSpot: dx.selectedSpot },
    contest: {
      activeSession: contest.activeSession,
      sessionHistory: contest.sessionHistory,
    },
    contestUi: {
      dockTabBySessionId: contestUi.dockTabBySessionId,
      bandBySessionId: contestUi.bandBySessionId,
      modeBySessionId: contestUi.modeBySessionId,
      draftBySessionId: contestUi.draftBySessionId,
      draftSelectionBySessionId: contestUi.draftSelectionBySessionId,
      draftUpdatedAtBySessionId: contestUi.draftUpdatedAtBySessionId,
      publicAssistanceBySessionId: contestUi.publicAssistanceBySessionId,
      dockTabIntent: stampedDockTabIntent(),
    },
  };
}

/**
 * Keep the docked console and optional secondary window on the same canonical
 * store state. BroadcastChannel transports presentation state only; QSO writes,
 * contest scoring, lookup, and CAT commands still use their existing services.
 */
export function useOperationalWorkspaceSync(): void {
  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;
    const sender =
      globalThis.crypto?.randomUUID?.() ??
      `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const channel = new BroadcastChannel(WORKSPACE_CHANNEL);
    let disposed = false;
    let applyingRemote = false;
    let publishQueued = false;
    let nextRevision = 0;
    const pendingDomains = new Set<WorkspaceDomain>();
    // The local reconciler stamps and then clears the dock-tab intent in its
    // effects, which run before the microtask that publishes. Latch the stamped
    // intent so the outgoing message still carries it to the other window
    // (#884 rounds 6 and 7).
    let pendingDockTabIntent: DockTabIntent | null = null;
    const receivedRevisions = new Map<string, number>();

    const publish = (...domains: WorkspaceDomain[]) => {
      if (disposed || applyingRemote) return;
      for (const domain of domains) pendingDomains.add(domain);
      if (publishQueued) return;
      publishQueued = true;
      queueMicrotask(() => {
        publishQueued = false;
        if (disposed || applyingRemote) {
          pendingDomains.clear();
          return;
        }
        if (pendingDomains.size === 0) return;
        const snapshot = createWorkspaceSnapshot();
        if (pendingDockTabIntent !== null) {
          snapshot.contestUi = {
            ...snapshot.contestUi,
            dockTabIntent: pendingDockTabIntent,
          };
          pendingDockTabIntent = null;
        }
        // One message for the whole batch: the receiver must apply the dock
        // tab, the intent that explains it and the scope change it is paired
        // with in a single task, or its reconciler runs in between and judges
        // the tab against a scope that has not moved yet (#884 round 14).
        const domains: Partial<WorkspaceSnapshot> = {};
        for (const domain of pendingDomains) {
          domains[domain] = snapshot[domain] as never;
        }
        pendingDomains.clear();
        channel.postMessage({
          kind: "snapshot",
          sender,
          revision: ++nextRevision,
          domains,
        } satisfies WorkspaceMessage);
      });
    };

    // Subscribe to the synchronized projection, not whole stores. In
    // particular, map camera/time updates and live DX-feed refreshes can occur
    // many times per second and must not generate workspace snapshots when the
    // target, draft, or selected report did not change.
    const subscriptions = [
      useMapOperationalStore.subscribe((state, previous) => {
        // `workspaceOpen` is per-window and not on the wire (#884 round 12),
        // so a change to it publishes nothing.
        if (
          state.manualScope !== previous.manualScope ||
          state.selectedReport !== previous.selectedReport
        ) {
          publish("operational");
        }
      }),
      useQSOStore.subscribe((state, previous) => {
        if (
          state.form !== previous.form ||
          state.operatingMode !== previous.operatingMode
        ) {
          publish("qso");
        }
      }),
      useMapStore.subscribe((state, previous) => {
        if (state.target !== previous.target) publish("map");
      }),
      useDXStore.subscribe((state, previous) => {
        if (state.selectedSpot !== previous.selectedSpot) publish("dx");
      }),
      useContestStore.subscribe((state, previous) => {
        if (
          state.activeSession !== previous.activeSession ||
          state.sessionHistory !== previous.sessionHistory
        ) {
          publish("contest");
        }
      }),
      useContestUIStore.subscribe((state, previous) => {
        if (
          state.dockTabBySessionId !== previous.dockTabBySessionId ||
          state.bandBySessionId !== previous.bandBySessionId ||
          state.modeBySessionId !== previous.modeBySessionId ||
          state.draftBySessionId !== previous.draftBySessionId ||
          state.draftSelectionBySessionId !==
            previous.draftSelectionBySessionId ||
          state.draftUpdatedAtBySessionId !==
            previous.draftUpdatedAtBySessionId ||
          state.publicAssistanceBySessionId !==
            previous.publicAssistanceBySessionId
        ) {
          publish("contestUi");
        }
      }),
      // The explicit dock-tab marker lives in the ephemeral store but belongs
      // to the same domain as the tab it explains, so it rides the same
      // message and cannot arrive after it.
      useContestUIEphemeralStore.subscribe((state, previous) => {
        if (state.dockTabIntent === previous.dockTabIntent) return;
        // Only a locally produced intent may populate the latch (#884 round 8,
        // Codex P1). `publish` checks `applyingRemote`, but the assignment
        // below happens first, so a remote apply used to leave the intent
        // latched; the next local publish sent it back to the window it came
        // from, which consumed it and published again — an endless ping-pong
        // after any cross-window tab click.
        if (applyingRemote) return;
        // Only a stamped intent is worth sending, and a clear carries nothing
        // a peer can use (a remote null never clears a held intent), so those
        // transitions publish nothing at all.
        if (state.dockTabIntent === null || state.dockTabIntent.scope === null) {
          return;
        }
        pendingDockTabIntent = state.dockTabIntent;
        publish("contestUi");
      }),
    ];

    channel.onmessage = (event: MessageEvent<WorkspaceMessage>) => {
      const message = event.data;
      if (!message || message.sender === sender) return;
      if (message.kind === "request") {
        publish(...WORKSPACE_DOMAINS);
        return;
      }
      if (
        message.kind !== "snapshot" ||
        !Number.isFinite(message.revision) ||
        !message.domains
      ) {
        return;
      }

      // Revisions are monotonic per sender and a batch carries everything that
      // sender had pending, so one counter per sender is enough.
      const lastRevision = receivedRevisions.get(message.sender) ?? -1;
      if (message.revision <= lastRevision) return;
      receivedRevisions.set(message.sender, message.revision);

      applyingRemote = true;
      try {
        // Apply in a fixed order inside the one task, so editing a QSO draft
        // can never replay a stale contest session, target, or UI snapshot
        // from another window, and so the dock tab and the intent that
        // explains it land before the reconciler's single run at the end.
        for (const domain of WORKSPACE_DOMAINS) {
          const state = message.domains[domain];
          if (state === undefined) continue;
          switch (domain) {
            case "operational":
              // Mixed-version windows are the normal state during a deploy, so
              // every field is validated before it is stored (#884 round 8).
              useMapOperationalStore.setState(normalizeOperationalState(state));
              break;
            case "qso":
              useQSOStore.setState(state as WorkspaceSnapshot["qso"]);
              break;
            case "map":
              useMapStore.setState(state as WorkspaceSnapshot["map"]);
              break;
            case "dx":
              useDXStore.setState(state as WorkspaceSnapshot["dx"]);
              break;
            case "contest":
              useContestStore.setState(state as WorkspaceSnapshot["contest"]);
              break;
            case "contestUi": {
              // A window on a bundle that predates the intent sends a payload
              // without the field at all: `normalizeDockTabIntent` turns that
              // (and any other malformed value) into null rather than storing
              // an `undefined` the reconciler would dereference (#884 r8).
              const intent = normalizeDockTabIntent(
                (state as Record<string, unknown>).dockTabIntent,
              );
              // A null never clears a locally held intent: the sending window
              // clears its own copy as soon as it consumes it, and that later
              // message would otherwise strip an intent this window has not
              // had a run to act on yet (#884 round 7). The reconciler's own
              // one-run lifetime is the only thing that releases it.
              if (intent !== null) {
                useContestUIEphemeralStore.setState({ dockTabIntent: intent });
              }
              useContestUIStore.setState(normalizeContestUiState(state));
              break;
            }
          }
        }
      } finally {
        applyingRemote = false;
      }
    };

    channel.postMessage({ kind: "request", sender } satisfies WorkspaceMessage);
    return () => {
      disposed = true;
      for (const unsubscribe of subscriptions) unsubscribe();
      channel.close();
    };
  }, []);
}
