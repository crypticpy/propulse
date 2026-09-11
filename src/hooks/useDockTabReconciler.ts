/**
 * useDockTabReconciler
 *
 * The single owner of the ops dock tab (#884 round 4). Two effects used to
 * write `contestUIStore.dockTabBySessionId` with two different rules — one in
 * `OpsConsole` (posture-gated, scope-change-guarded) and one in `PropSphere`
 * (unconditional on any non-Observe scope) — and the page's ran last, so it
 * overwrote whatever the console had just decided. This hook is the merged
 * rule; both call sites now use it and nothing else reconciles the tab.
 *
 * Call it once per window, from the surface that owns the dock:
 * - `PropSphere` calls it unconditionally, so the tab is reconciled even while
 *   the console is collapsed (what `PropSphere`'s deleted effect was for). Its
 *   only `setWorkspaceOpen(true)` is an operator action (`openOpsConsole`), not
 *   a startup effect, so its first run already sees the final scope.
 * - `PropSphereOpsWindow` calls it because the popout mounts `OpsConsole` on
 *   its own, in a separate document with its own store instances.
 *
 * **Host contract (#884 round 11): a host must have applied every startup input
 * to the derived scope before it mounts this hook.** The first run records the
 * scope every later transition is measured against (rule 4), so a host that
 * opens the workspace, hydrates a draft or applies a session *after* mounting
 * would make its own startup look like a transition and reconcile a persisted
 * explicit tab away. `PropSphereOpsWindow` sets
 * `workspaceOpen` in an outer component and renders the console only once that
 * is done. The inputs and where each settles:
 * - `manualScope`, contest session, QSO draft callsign — persisted stores,
 *   hydrated synchronously from localStorage before the first render.
 * - `workspaceOpen` — not persisted; the popout's startup state, applied by
 *   its host before this hook mounts.
 * - rig and WSJT-X connections — asynchronous by nature, but a connection that
 *   arrives later is a genuine scope change, not startup, and is reconciled as
 *   one.
 * - a remote snapshot arriving on join — also a genuine change: it moves the
 *   scope through the same stores, together with the tab it explains.
 *
 * The rule:
 * 1. While an explicit tab click (`dockTabIntent`) is outstanding the
 *    reconciler stands down. The click's own `setWorkspaceOpen(true)` can move
 *    the automatic scope (`workspaceOpen && draft callsign` is one of the
 *    `stationOperationActive` terms), and answering that with a tab write
 *    would undo the click. The intent carries the scope it is paired with, so
 *    it survives a secondary window receiving the tab and the scope change as
 *    two separate messages (#884 round 7):
 *      - unstamped (`scope: null`) — the window that made the click: the first
 *        run stamps the scope it observes, which is the value that crosses to
 *        the other window, and the re-render that stamping causes clears it.
 *      - stamped — lives for exactly one run in the window that receives it
 *        (#884 round 14). If that run is a transition onto the stamped scope,
 *        the click explains the transition and the tab it chose stands;
 *        anything else discards the intent unconsumed and reconciles normally.
 *        Nothing is held across runs, so an intent that never had a paired
 *        scope change cannot wait around and then excuse an unrelated
 *        transition that happens to land on the same scope.
 *      - the transport guarantees the pair arrives together: one publish is
 *        one message carrying every domain it touched, so the receiver applies
 *        the tab, the intent and the scope change in a single task and runs
 *        this effect once at the end of it
 *        (`useOperationalWorkspaceSync`, channel v5).
 *      - as it stands, a *remote* tab click can never move the receiver's
 *        scope at all: the click writes `dockTabIntent`, the dock tab,
 *        `workspaceOpen` and the posture, and of those only the dock tab is
 *        synced — `workspaceOpen` is per-window since round 12, and none of
 *        `manualScope`, the contest session or the QSO draft is touched. The
 *        stamped intent is kept because it costs one field and is the only
 *        thing that would cover a future click that does move a synced input;
 *        the paired-adoption path is covered by a test so that stays true.
 * 2. Otherwise it acts only when the resolved scope or the dock it writes to
 *    actually changed. Both are recorded on every run — including a run the
 *    posture gate rejects — so a later posture change cannot replay a stale
 *    reconcile.
 * 3. Contact and Desk own the dock tab, so Work does not hide the band map —
 *    except when the operator has just picked a scope in
 *    `OperationalScopeControl` (`scopeReconcileRequestId`). Choosing Log takes
 *    the desk in the same event, so the gate would otherwise swallow the very
 *    change that was asked for (#884 round 6).
 * 4. A window's first run never writes and never clears: it adopts whatever
 *    tab is persisted for its dock (#884 round 13). Windows legitimately start
 *    at different scopes — the popout is the workspace and starts at Log, a
 *    reloaded main window is collapsed at Observe — so a startup scope that
 *    differs from the one the operator chose the tab under proves nothing. The
 *    consequence is deliberate: when a window later *observes* a transition it
 *    reconciles and broadcasts the automatic tab, even if a peer is sitting at
 *    the scope the tab was chosen for. That is the same behaviour two live
 *    windows have had since round 9 — the last real transition anywhere wins —
 *    and it is what keeps one rule instead of a per-window negotiation.
 */

import { useEffect, useRef } from "react";
import { useContestStore } from "@/stores/contestStore";
import { dockKeyForSession, useContestUIStore } from "@/stores/contestUIStore";
import { useContestUIEphemeralStore } from "@/stores/contestUIEphemeralStore";
import { useOpsPostureStore } from "@/stores/opsPostureStore";
import { useMapOperationalContext } from "@/hooks/useMapOperationalContext";
import type { MapDataScope } from "@/lib/map/operationalScope";

export function useDockTabReconciler(): void {
  const sessionId = useContestStore((s) => s.activeSession?.id ?? null);
  const dockKey = dockKeyForSession(sessionId);
  const setDockTab = useContestUIStore((s) => s.setDockTab);
  const posture = useOpsPostureStore((s) => s.posture);
  const { scope } = useMapOperationalContext();
  const dockTabIntent = useContestUIEphemeralStore((s) => s.dockTabIntent);
  const stampDockTabIntent = useContestUIEphemeralStore(
    (s) => s.stampDockTabIntent,
  );
  const clearDockTabIntent = useContestUIEphemeralStore(
    (s) => s.clearDockTabIntent,
  );
  const scopeReconcileRequestId = useContestUIEphemeralStore(
    (s) => s.scopeReconcileRequestId,
  );
  const handledScopeRequestId = useRef(scopeReconcileRequestId);
  // What the last run reconciled: the scope *and* the dock it wrote to. A new
  // session is a different dock with its own tab, so it needs reconciling even
  // when the scope did not move (the deleted `PropSphere` effect got this from
  // having `contestSessionId` in its dependency list).
  const reconciled = useRef<{ scope: MapDataScope; dockKey: string } | null>(
    null,
  );

  useEffect(() => {
    const previous = reconciled.current;
    reconciled.current = { scope, dockKey };
    if (dockTabIntent !== null) {
      if (dockTabIntent.scope === null) {
        // This window made the click: stamp the scope the click produced (the
        // click's own `setWorkspaceOpen` is already in this render), and stand
        // down. The stamp is what crosses to the other window, and the
        // re-render it causes gives this one its next run.
        stampDockTabIntent(scope);
        return;
      }
      // A stamped intent lives until this window's next run and no longer
      // (#884 round 14). Holding it across runs made an intent that never had
      // a paired scope change — a click in a popout whose Log scope comes from
      // its own `workspaceOpen`, which is per-window and not on the wire —
      // wait indefinitely, and then excuse the next genuine transition that
      // happened to land on the same scope (a rig connecting).
      clearDockTabIntent();
      const movedToTheClickedScope =
        previous !== null &&
        (previous.scope !== scope || previous.dockKey !== dockKey) &&
        dockTabIntent.scope === scope;
      // The click explains this transition, so leave the tab it chose alone.
      // Anything else falls through and reconciles normally: an intent is
      // never evidence about a run it did not cause.
      if (movedToTheClickedScope) return;
    }
    if (previous === null) {
      // First run in this window: adopt the persisted tab as it stands and
      // write nothing (#884 round 13). A window's startup scope is its own —
      // the popout is the workspace and runs at Log while a freshly reloaded
      // main window is collapsed at Observe (#884 round 12) — so a startup
      // scope that differs from the one the tab was chosen under is not
      // evidence that the tab is stale. Only a transition this window actually
      // observes reconciles. A tab from an old session cannot leak in: the tab
      // is keyed by the session dock key.
      handledScopeRequestId.current = scopeReconcileRequestId;
      return;
    }
    // An explicit scope selection is the operator speaking, exactly like a tab
    // click: it reconciles even when the resolved scope did not move (picking
    // Log while the rig is already up) and even from Contact or Desk (picking
    // Log *takes* the desk in the same event).
    const selected = handledScopeRequestId.current !== scopeReconcileRequestId;
    handledScopeRequestId.current = scopeReconcileRequestId;
    if (!selected) {
      if (previous?.scope === scope && previous.dockKey === dockKey) return;
      if (posture === "contact" || posture === "desk") return;
    }
    if (scope === "observe") {
      setDockTab(dockKey, "dx");
    } else if (scope === "log") {
      setDockTab(dockKey, "log");
    } else {
      // Contest scope reconciles onto whichever dock is current, including the
      // pre-session dock: choosing Contest in the scope control before a
      // session exists is exactly how the operator reaches Start Contest.
      setDockTab(dockKey, "contest");
    }
  }, [
    clearDockTabIntent,
    dockKey,
    dockTabIntent,
    stampDockTabIntent,
    posture,
    scope,
    scopeReconcileRequestId,
    setDockTab,
  ]);
}
