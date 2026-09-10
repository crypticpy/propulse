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
  operational: Pick<
    ReturnType<typeof useMapOperationalStore.getState>,
    "manualScope" | "workspaceOpen" | "selectedReport"
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
     * receiver can hold it until the separate `operational` message lands
     * (#884 round 7). Ephemeral in both windows, never persisted.
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
      domain: WorkspaceDomain;
      revision: number;
      state: WorkspaceSnapshot[WorkspaceDomain];
    };

const WORKSPACE_CHANNEL = "propulse-operating-workspace-v2";

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
      workspaceOpen: operational.workspaceOpen,
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
      dockTabIntent: useContestUIEphemeralStore.getState().dockTabIntent,
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
    const receivedRevisions = new Map<
      string,
      Map<WorkspaceDomain, number>
    >();

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
        // `contestUi` carries the explicit dock-tab marker, so it has to be
        // published before `operational` — the receiving window must have the
        // marker before it sees the workspace change that moves its scope.
        const domainsToPublish = [...pendingDomains].sort((a, b) =>
          a === "contestUi" ? -1 : b === "contestUi" ? 1 : 0,
        );
        pendingDomains.clear();
        for (const domain of domainsToPublish) {
          channel.postMessage({
            kind: "snapshot",
            sender,
            domain,
            revision: ++nextRevision,
            state: snapshot[domain],
          } satisfies WorkspaceMessage);
        }
      });
    };

    // Subscribe to the synchronized projection, not whole stores. In
    // particular, map camera/time updates and live DX-feed refreshes can occur
    // many times per second and must not generate workspace snapshots when the
    // target, draft, or selected report did not change.
    const subscriptions = [
      useMapOperationalStore.subscribe((state, previous) => {
        if (
          state.manualScope !== previous.manualScope ||
          state.workspaceOpen !== previous.workspaceOpen ||
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
        // Only a stamped intent is worth sending: an unstamped one has no
        // scope to pair with in the other window, and the stamp follows in the
        // same task.
        if (state.dockTabIntent?.scope != null) {
          pendingDockTabIntent = state.dockTabIntent;
        }
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
        !WORKSPACE_DOMAINS.includes(message.domain) ||
        !Number.isFinite(message.revision) ||
        !message.state
      ) {
        return;
      }

      const senderRevisions =
        receivedRevisions.get(message.sender) ??
        new Map<WorkspaceDomain, number>();
      const receivedRevision = senderRevisions.get(message.domain) ?? -1;
      if (message.revision <= receivedRevision) return;
      senderRevisions.set(message.domain, message.revision);
      receivedRevisions.set(message.sender, senderRevisions);

      applyingRemote = true;
      try {
        // Apply one domain at a time so editing a QSO draft can never replay a
        // stale contest session, target, or UI snapshot from another window.
        switch (message.domain) {
          case "operational":
            useMapOperationalStore.setState(
              message.state as WorkspaceSnapshot["operational"],
            );
            break;
          case "qso":
            useQSOStore.setState(message.state as WorkspaceSnapshot["qso"]);
            break;
          case "map":
            useMapStore.setState(message.state as WorkspaceSnapshot["map"]);
            break;
          case "dx":
            useDXStore.setState(message.state as WorkspaceSnapshot["dx"]);
            break;
          case "contest":
            useContestStore.setState(
              message.state as WorkspaceSnapshot["contest"],
            );
            break;
          case "contestUi": {
            const { dockTabIntent, ...contestUiState } =
              message.state as WorkspaceSnapshot["contestUi"];
            // Set the intent first: the reconciler in this window must see it
            // on the same run that sees the tab it excuses, and it holds there
            // until the paired `operational` message moves the scope. A null
            // never clears a locally held intent — the sending window clears
            // its own copy as soon as it consumes it, and that later message
            // would otherwise strip the intent here before the paired
            // `operational` message lands (#884 round 7). The local expiry
            // rule in useDockTabReconciler is the only thing that releases it.
            if (dockTabIntent !== null) {
              useContestUIEphemeralStore.setState({ dockTabIntent });
            }
            useContestUIStore.setState(contestUiState);
            break;
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
