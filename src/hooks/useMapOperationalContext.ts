import { hamClockProjectionContent } from "@/lib/hamclock/displayLayout";
import { nextLocalWriteSeq } from "@/lib/localWriteSequence";
import { writtenAt } from "@/lib/writeStamp";
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
import { WORKSPACE_CHANNEL } from "@/lib/map/workspaceChannel";
import { refreshOperatingPopoutLiveness } from "@/lib/workspace/operatingPopout";
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
  // A popout this window opened is operating too, even though the inline dock
  // is shut (#884 round 15).
  const workspacePopoutOpen = useMapOperationalStore(
    (state) => state.workspacePopoutOpen,
  );
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
    ((workspaceOpen || workspacePopoutOpen) &&
      qsoDraftCallsign.trim().length > 0);
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
  /**
   * A `/map/ops` popout is going away (#884 round 15). Additive: a receiver
   * that does not know this kind falls through the `kind !== "snapshot"` guard
   * and ignores it, and the opener's `handle.closed` check on focus still
   * clears liveness — so this does not change the meaning of any field and
   * does not need a channel bump.
   */
  | { kind: "popout-closed" }
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
      /**
       * Why each domain in this batch was sent (#859 rounds 15 and 17). A
       * publish carries several domains in one message (#884 round 14), and
       * a handshake reply queued in the same tick as a live write shares it,
       * so the label is per domain rather than per message.
       *
       * Optional, and an absent entry reads as `"handshake"`: a window on a
       * bundle from before this field labels nothing, and the safe reading
       * of an unlabelled equal-stamp equal-value snapshot is the one that
       * mints nothing. Additive, so the channel version is unchanged.
       */
      triggers?: Partial<Record<WorkspaceDomain, SnapshotTrigger>>;
    };

// The channel name and its bump rule live in `@/lib/map/workspaceChannel`, so
// the popout-liveness module can open the same wire without importing this
// hook (#884 round 15). Re-exported here because that is where every existing
// caller and test reads it from.
export { WORKSPACE_CHANNEL };

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
      dockTabIntent: stampedDockTabIntent(),
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
    // The local reconciler stamps and then clears the dock-tab intent in its
    // effects, which run before the microtask that publishes. Latch the stamped
    // intent so the outgoing message still carries it to the other window
    // (#884 rounds 6 and 7).
    let pendingDockTabIntent: DockTabIntent | null = null;
    const receivedRevisions = new Map<string, number>();
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
        const triggers: Partial<Record<WorkspaceDomain, SnapshotTrigger>> = {};
        for (const [domain, trigger] of pendingDomains) {
          domains[domain] = snapshot[domain] as never;
          triggers[domain] = trigger;
        }
        pendingDomains.clear();
        channel.postMessage({
          kind: "snapshot",
          sender,
          revision: ++nextRevision,
          domains,
          triggers,
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
        if (
          state.dockTabIntent === null ||
          state.dockTabIntent.scope === null
        ) {
          return;
        }
        pendingDockTabIntent = state.dockTabIntent;
        publish("update", "contestUi");
      }),
    ];

    channel.onmessage = (event: MessageEvent<WorkspaceMessage>) => {
      const message = event.data;
      if (!message) return;
      if (message.kind === "popout-closed") {
        // The message is only the moment to look: a reload posts it too, and
        // there the handle is still open, so liveness (and the scope) hold.
        refreshOperatingPopoutLiveness();
        return;
      }
      if (message.sender === sender) return;
      if (message.kind === "request") {
        publish("handshake", ...WORKSPACE_DOMAINS);
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
            case "map": {
              const map = state as WorkspaceSnapshot["map"];
              // Why this domain was sent: a live selection is ordered like any
              // other write, a handshake republish of the value already held is
              // a replay (#859 round 15).
              const mapTrigger = message.triggers?.map ?? "handshake";
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
                      mapTrigger !== "update" &&
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
    // A popout killed by the browser sends nothing at all, and a real close
    // often has not flipped `closed` yet when its `pagehide` message arrives —
    // but focus comes back to this window either way (#884 round 15).
    const recheckPopout = () => refreshOperatingPopoutLiveness();
    window.addEventListener("focus", recheckPopout);
    document.addEventListener("visibilitychange", recheckPopout);
    return () => {
      window.removeEventListener("focus", recheckPopout);
      document.removeEventListener("visibilitychange", recheckPopout);
      disposed = true;
      for (const unsubscribe of subscriptions) unsubscribe();
      channel.close();
    };
  }, []);
}
