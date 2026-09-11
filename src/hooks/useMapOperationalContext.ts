import { hamClockProjectionContent } from "@/lib/hamclock/displayLayout";
import { nextLocalWriteSeq } from "@/lib/localWriteSequence";
import { useHamClockDisplayStore } from "@/stores/hamclockDisplayStore";
import { useHamClockStore } from "@/stores/hamclockStore";
import { useEffect, useMemo } from "react";
import { useContestStore } from "@/stores/contestStore";
import { useContestUIStore } from "@/stores/contestUIStore";
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
  /**
   * The target's whole stamp travels with it, so the sending window's write
   * survives the hop. Applying the target alone would leave this window's
   * stamp on the *previous* target, and the HamClock wall reconciles against
   * that stamp on mount (#859) — a pop-out's fresh pick would then lose to an
   * older operating cursor.
   *
   * `targetSeq` is deliberately *not* in the payload (#859 round 11). It
   * numbers the sending window's own applications and means nothing here;
   * round 10 sent it and compared it anyway. The receiver takes its own
   * number when it applies this snapshot, which is the ordering it can
   * honestly claim — `targetSetAt` still travels, as the sender's write time
   * for display and for the last-resort clock comparison.
   */
  map: Pick<
    ReturnType<typeof useMapStore.getState>,
    "target" | "targetSetAt"
  >;
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
  >;
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
    map: { target: map.target, targetSetAt: map.targetSetAt },
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
        const domainsToPublish = [...pendingDomains];
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
        // Every field the write moves, not just the object reference (#859
        // round 10). Re-selecting the same entry from `recentTargets` hands
        // `setTarget` the very object already held, so the target reference
        // is unchanged and only the stamp moves — and that stamp is the whole
        // point of the map domain. Publishing on the reference alone left the
        // other window on a stale stamp, which then lost the wall's remount
        // comparison to a cursor that was actually older.
        //
        // `targetSeq` stays in the predicate although it no longer travels
        // (round 11): it is the only field that always moves on a local
        // write, since re-selecting the same object inside one millisecond
        // leaves both the reference and `targetSetAt` untouched. It is the
        // trigger, not the payload — the receiver numbers the write itself.
        if (
          state.target !== previous.target ||
          state.targetSetAt !== previous.targetSetAt ||
          state.targetSeq !== previous.targetSeq
        ) {
          publish("map");
        }
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
        //
        // Census of the six (#859 round 12). A domain whose payload carries a
        // write stamp for the value it travels with must install only what is
        // strictly newer, because a window left open answers the handshake
        // with whatever it has had up all along:
        //
        // - `map` — stamped (`targetSetAt`). Gated below.
        // - `operational`, `qso` — no stamp; scope, panel and draft state are
        //   last-writer-wins, and the per-sender revision gate already orders
        //   one sender's messages against each other.
        // - `dx` — no stamp. `selectedSpot.time` is when the *spot* was
        //   posted, not when this operator selected it; gating on it would
        //   refuse to select an older spot.
        // - `contest` — no stamp. `startTime`/`endTime` are the contest's,
        //   not a write time.
        // - `contestUi` — no write stamp. `draftUpdatedAtBySessionId` is a
        //   per-session "typed recently" signal read by `ContestDock` for
        //   spot-prefill behaviour; it stamps neither the six maps it travels
        //   with nor the domain as a whole, so gating the payload on it would
        //   be inventing a stamp rather than honouring one. Last-writer-wins.
        switch (message.domain) {
          case "operational":
            useMapOperationalStore.setState(
              message.state as WorkspaceSnapshot["operational"],
            );
            break;
          case "qso":
            useQSOStore.setState(message.state as WorkspaceSnapshot["qso"]);
            break;
          case "map": {
            const map = message.state as WorkspaceSnapshot["map"];
            // A relayed target keeps the stamp it came with, and nothing
            // else. This window did not write it, so it may not stamp it
            // (#859 round 9): a fresh `Date.now()` would make a target the
            // sender picked hours ago look brand new here, and a fresh
            // sequence would claim this window wrote it. Both guesses beat a
            // cursor that really is newer, the same family of bug as
            // crediting a relay with someone else's write.
            //
            // The write *order* is the one thing this window may say for
            // itself (#859 round 11). Both windows are on this machine, but
            // the cursor it will be compared against may come from a phone,
            // so the only counter that can order the two is the local one —
            // and applying this snapshot is a local event with a place in it.
            // Round 9 left it cleared, which put the comparison back on a
            // clock that can step backwards; round 10 kept the sender's
            // number, which is not comparable with anything minted here.
            //
            // Only when the sender stamped the target at all. A window on an
            // older bundle answers the handshake with a target it has had up
            // for hours and no write time; numbering that as if it had just
            // been written is the same guess in a new place, and it is what
            // let a stale pop-out outrank a cursor already applied here
            // (round 9). Unknown freshness stays unknown, and the wall gives
            // an unstamped target the losing side.
            //
            // And a stamped snapshot is *applied* only when its stamp is
            // strictly newer than the one already held (#859 round 12).
            // Arriving is not the same as being newer: a pop-out left open
            // answers the handshake with the target it picked an hour ago,
            // and installing that unconditionally — then numbering it with
            // the newest local sequence, because applying it really is the
            // latest thing this window did — hands a stale target the top of
            // the order and takes a cursor that is genuinely newer. The two
            // timestamps are safe to compare directly: both are workspace
            // windows on *this* machine, one clock (round 10's note), which
            // is exactly why the cursor's foreign `at` is not compared here.
            //
            // Nothing held, or held unstamped, means there is nothing to
            // lose: install. Equal or older: ignore it entirely, including
            // the number — a snapshot this window declines to apply is not
            // an application.
            const held = useMapStore.getState();
            if (Number.isFinite(map.targetSetAt)) {
              const senderAt = map.targetSetAt as number;
              const nothingToLose =
                held.target === null || held.targetSetAt === undefined;
              if (!nothingToLose && senderAt <= (held.targetSetAt as number)) {
                break;
              }
              useMapStore.setState({
                target: map.target,
                targetSetAt: senderAt,
                targetSeq: nextLocalWriteSeq(),
              });
              break;
            }
            // Unstamped: last-writer-wins on the value, as it has always
            // been — there is no stamp to compare, and refusing it would
            // leave a legacy pop-out unable to move this window's target at
            // all. It carries no number either, so the wall never promotes
            // it over something it can order (round 9).
            useMapStore.setState({
              target: map.target,
              targetSetAt: undefined,
              targetSeq: undefined,
            });
            break;
          }
          case "dx":
            useDXStore.setState(message.state as WorkspaceSnapshot["dx"]);
            break;
          case "contest":
            useContestStore.setState(
              message.state as WorkspaceSnapshot["contest"],
            );
            break;
          case "contestUi":
            useContestUIStore.setState(
              message.state as WorkspaceSnapshot["contestUi"],
            );
            break;
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
