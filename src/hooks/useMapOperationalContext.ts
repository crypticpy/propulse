import { hamClockProjectionContent } from "@/lib/hamclock/displayLayout";
import { nextLocalWriteSeq } from "@/lib/localWriteSequence";
import { writtenAt } from "@/lib/writeStamp";
import { useHamClockDisplayStore } from "@/stores/hamclockDisplayStore";
import { useHamClockStore } from "@/stores/hamclockStore";
import { useEffect, useMemo } from "react";
import { useContestStore } from "@/stores/contestStore";
import { useContestUIStore } from "@/stores/contestUIStore";
import { useDXStore } from "@/stores/dxStore";
import { useMapStore, type TargetLocation } from "@/stores/mapStore";
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
        { assisted?: "assisted" | "non-assisted" } | undefined
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
  const hamClock = useMapStore((s) => s.layoutMode === "hamclock");
  const mode = useHamClockStore((s) => s.hamclockMode);
  const content = useHamClockDisplayStore((s) => s.mapContent);
  const projection = useMapStore((s) => s.viewMode);
  const hamClockContent =
    hamClock && (mode === "traffic" || mode === "bands")
      ? hamClockProjectionContent(projection, content)
      : undefined;
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
  qso: Pick<ReturnType<typeof useQSOStore.getState>, "form" | "operatingMode">;
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
  map: Pick<ReturnType<typeof useMapStore.getState>, "target" | "targetSetAt">;
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

/**
 * Why a snapshot was sent (#859 round 15). `"update"` is a live broadcast:
 * this window's own store changed and it is telling the others. `"handshake"`
 * is a reply to a joining window's `request` — a republish of what was
 * already held, which every peer sends at once and which names no original
 * writer.
 *
 * The receiver needs the difference to tell a *replay* from a second write
 * that happens to carry the same value at the same stamp: republished
 * targets are suppressed, live selections are ordered. It is a string, not a
 * counter — nothing here is compared across windows to establish order, so
 * round 10's rule stands.
 *
 * Optional on the wire, and absent means `"handshake"`: a window on a bundle
 * from before this field answers handshakes and broadcasts alike without it,
 * and the safe reading of an unlabelled equal-stamp equal-value snapshot is
 * the one that mints nothing. The channel name is unchanged — this is an
 * added optional field, which an older receiver reads past.
 */
type SnapshotTrigger = "update" | "handshake";

type WorkspaceMessage =
  | { kind: "request"; sender: string }
  | {
      kind: "snapshot";
      sender: string;
      domain: WorkspaceDomain;
      revision: number;
      state: WorkspaceSnapshot[WorkspaceDomain];
      trigger?: SnapshotTrigger;
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
 * Is this the target already held? A `TargetLocation` is four primitives, so
 * a field compare is exact. Used to recognise a *replay* of the target this
 * window holds — see the ordering rule in `operatingStateStore` (#859 round
 * 14): identical value plus identical stamp is one write coming round again,
 * never a new one.
 */
function sameTarget(
  a: TargetLocation | null | undefined,
  b: TargetLocation | null | undefined,
): boolean {
  if (!a || !b) return !a && !b;
  return (
    a.lat === b.lat && a.lon === b.lon && a.name === b.name && a.grid === b.grid
  );
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
    const pendingDomains = new Map<WorkspaceDomain, SnapshotTrigger>();
    const receivedRevisions = new Map<string, Map<WorkspaceDomain, number>>();
    /**
     * Which window wrote the map target this window currently holds: its own
     * id while the local pick stands, the sender's once a remote snapshot has
     * been applied. Used only to settle an equal-`targetSetAt` tie, and only
     * here — it is never published, so the wire is unchanged (#859 round 13,
     * and round 10's lesson: nothing new goes on the wire to order writes).
     */
    let targetTieKey: string = sender;

    const publish = (
      trigger: SnapshotTrigger,
      ...domains: WorkspaceDomain[]
    ) => {
      if (disposed || applyingRemote) return;
      for (const domain of domains) {
        // A real write queued in the same tick as a handshake reply is still
        // a real write: the honest label is the stronger of the two.
        if (trigger === "update" || !pendingDomains.has(domain)) {
          pendingDomains.set(domain, trigger);
        }
      }
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
        for (const [domain, trigger] of domainsToPublish) {
          channel.postMessage({
            kind: "snapshot",
            sender,
            domain,
            revision: ++nextRevision,
            state: snapshot[domain],
            trigger,
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
          publish("update", "operational");
        }
      }),
      useQSOStore.subscribe((state, previous) => {
        if (
          state.form !== previous.form ||
          state.operatingMode !== previous.operatingMode
        ) {
          publish("update", "qso");
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
        // Read through `writtenAt` so the initial "never written" value and
        // an explicit absence are one state, not two (#859 round 16): moving
        // between them is not a write and never needs publishing on its own.
        if (
          state.target !== previous.target ||
          writtenAt(state.targetSetAt) !== writtenAt(previous.targetSetAt) ||
          state.targetSeq !== previous.targetSeq
        ) {
          // A local write takes back the tie key; a remote one is applied
          // with `applyingRemote` set and keeps the key the applier gave it.
          if (!applyingRemote) targetTieKey = sender;
          publish("update", "map");
        }
      }),
      useDXStore.subscribe((state, previous) => {
        if (state.selectedSpot !== previous.selectedSpot)
          publish("update", "dx");
      }),
      useContestStore.subscribe((state, previous) => {
        if (
          state.activeSession !== previous.activeSession ||
          state.sessionHistory !== previous.sessionHistory
        ) {
          publish("update", "contest");
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
          publish("update", "contestUi");
        }
      }),
    ];

    channel.onmessage = (event: MessageEvent<WorkspaceMessage>) => {
      const message = event.data;
      if (!message || message.sender === sender) return;
      if (message.kind === "request") {
        publish("handshake", ...WORKSPACE_DOMAINS);
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
            // "Nothing to lose" is *no stamp at all*, and nothing else
            // (#859 round 13). It is not "the target is null": clearing the
            // target goes through `setTarget(null)`, which stamps
            // `targetSetAt` like any other write, so a window that cleared at
            // 5000 has something to lose and must refuse a suspended
            // pop-out's handshake target stamped 4000. This is the store's
            // rule — see the "A stamp is what orders writes" block in
            // `operatingStateStore` — applied on this channel: the stamp
            // orders the write, the value never does.
            //
            // Equal stamps are settled, not deadlocked. Two editable windows
            // picking different targets inside one millisecond would each
            // refuse the other under a plain `<=` and stay split for good, so
            // an exact tie falls to the higher window id — the same direction
            // the operating store's `beats()` takes, so the two channels can
            // never name different winners. The key is local
            // (`targetTieKey`): the envelope already carries `sender`, and
            // nothing needs adding to the wire.
            //
            // Residual, stated rather than papered over: `targetSetAt` is
            // `Date.now()` on one machine, and a clock stepped backwards
            // (NTP, manual change) makes a later write carry a smaller stamp,
            // which this window then refuses. Both windows share the
            // corrected clock, so it heals on the next write; a monotonic
            // cross-window counter would need one on the wire, which round 10
            // showed is the worse trade.
            //
            // Both sides are read through `writtenAt`, so the three spellings
            // of "never written" — `undefined`, the `0` sentinel a window
            // that has never picked a target still sends, and anything
            // non-finite — mean the same thing here (#859 round 16). A peer
            // that has never selected anything answered the handshake with
            // `{ target: null, targetSetAt: 0 }`, and counting that zero as a
            // write installed its unwritten null over a target this window
            // was actually holding.
            const held = useMapStore.getState();
            const senderAt = writtenAt(map.targetSetAt);
            if (senderAt !== undefined) {
              const heldAt = writtenAt(held.targetSetAt);
              if (heldAt !== undefined) {
                if (senderAt < heldAt) break;
                if (senderAt === heldAt) {
                  // A *republished* value equal to the one held, at the stamp
                  // already held, is this window's own write coming back
                  // (#859 rounds 14-15). When a third window joins, every
                  // peer answers at once with what it holds and none of those
                  // snapshots names the original writer; keying the tie on
                  // whoever relayed it would let a high-id relay of an
                  // unchanged target mint a fresh sequence and pass for the
                  // newest thing this window did — outranking a cursor that
                  // arrived while the wall was unmounted. A replay mints
                  // nothing and moves no key.
                  //
                  // Only a republish, though. Two windows *selecting* the
                  // same target in the same millisecond are two writes, and
                  // the wire already says which is which: `trigger`, the
                  // message kind, separates a handshake reply from a live
                  // broadcast. A live selection at an equal stamp goes to the
                  // sender tie-break below and mints if it wins, exactly as
                  // it would with a different value. An unlabelled snapshot
                  // (a window on an older bundle) reads as a republish, which
                  // is the reading that mints nothing.
                  if (
                    message.trigger !== "update" &&
                    sameTarget(held.target, map.target)
                  ) {
                    break;
                  }
                  // Genuinely different values at one instant: the tie falls
                  // to the higher sender, as below.
                  if (message.sender <= targetTieKey) break;
                }
              }
              targetTieKey = message.sender;
              useMapStore.setState({
                target: map.target,
                targetSetAt: senderAt,
                targetSeq: nextLocalWriteSeq(),
              });
              break;
            }
            // Unstamped *and* empty is not a write at all: a window that has
            // never picked a target, answering the handshake with the nothing
            // it holds. There is no stamp to order it by and no value to
            // install, so it is ignored rather than allowed to clear a target
            // this window is holding (#859 round 16).
            //
            // The residual, stated: a peer on a bundle too old to stamp
            // cannot propagate a *deliberate* clear either, because nothing
            // on its snapshot distinguishes the two. Keeping a target is the
            // recoverable mistake; destroying one is not. It heals as soon as
            // that peer selects something, and disappears once both sides are
            // upgraded, where a clear carries a stamp and wins on it
            // (round 13).
            if (map.target === null) break;
            // Unstamped with a value: last-writer-wins, as it has always
            // been — there is no stamp to compare, and refusing it would
            // leave a legacy pop-out unable to move this window's target at
            // all. It carries no number either, so the wall never promotes
            // it over something it can order (round 9).
            targetTieKey = message.sender;
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
