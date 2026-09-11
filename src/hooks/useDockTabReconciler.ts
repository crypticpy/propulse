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
 *   the console is collapsed (what `PropSphere`'s deleted effect was for).
 * - `PropSphereOpsWindow` calls it because the popout mounts `OpsConsole` on
 *   its own, in a separate document with its own store instances.
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
 *      - stamped — consumed by the first run whose scope equals the stamped
 *        one. Until then the reconciler holds and never writes.
 *      - expiry, so a click that changes nothing cannot leak: a stamped intent
 *        is held against at most one other scope, and any dock (session)
 *        change drops it. The next genuine scope change then reconciles.
 * 2. Otherwise it acts only when the resolved scope or the dock it writes to
 *    actually changed. Both are recorded on every run — including a run the
 *    posture gate rejects — so a later posture change cannot replay a stale
 *    reconcile.
 * 3. Contact and Desk own the dock tab, so Work does not hide the band map —
 *    except when the operator has just picked a scope in
 *    `OperationalScopeControl` (`scopeReconcileRequestId`). Choosing Log takes
 *    the desk in the same event, so the gate would otherwise swallow the very
 *    change that was asked for (#884 round 6).
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
  const markExplicitDockTab = useContestUIStore((s) => s.markExplicitDockTab);
  // The scope under which the operator last explicitly chose this dock's tab.
  // The intent is ephemeral, so this persisted marker is the only thing a
  // late-joining window (or this one after a reload) has to tell an explicit
  // tab from a stale one (#884 round 10).
  const explicitScope = useContestUIStore(
    (s) => s.explicitDockTabScopeByDockKey[dockKey],
  );
  const posture = useOpsPostureStore((s) => s.posture);
  const { scope } = useMapOperationalContext();
  const dockTabIntent = useContestUIEphemeralStore((s) => s.dockTabIntent);
  const stampDockTabIntent = useContestUIEphemeralStore(
    (s) => s.stampDockTabIntent,
  );
  const clearDockTabIntent = useContestUIEphemeralStore(
    (s) => s.clearDockTabIntent,
  );
  // The one scope a stamped intent has already been held against, so it cannot
  // outlive the change it belongs to.
  const heldAgainst = useRef<MapDataScope | null>(null);
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
    if (dockTabIntent !== null) {
      const droppedByDock = reconciled.current?.dockKey !== dockKey;
      if (dockTabIntent.scope === null) {
        // This window made the click: stamp the scope the click produced. The
        // set re-renders, and the next run sees a matching scope and clears.
        stampDockTabIntent(scope);
        reconciled.current = { scope, dockKey };
        heldAgainst.current = null;
        return;
      }
      if (dockTabIntent.scope === scope) {
        clearDockTabIntent();
        // The scope has settled, so this is the moment to record what the
        // choice was made under; every window that hydrates the tab later can
        // then tell it is explicit.
        markExplicitDockTab(dockKey, scope);
        heldAgainst.current = null;
        reconciled.current = { scope, dockKey };
        return;
      }
      const alreadyHeld =
        heldAgainst.current !== null && heldAgainst.current !== scope;
      if (!droppedByDock && !alreadyHeld) {
        // The paired scope change has not arrived yet (a secondary window gets
        // the tab and the scope in two messages). Hold without writing.
        heldAgainst.current = scope;
        reconciled.current = { scope, dockKey };
        return;
      }
      // Expired: the pair never came. Release and reconcile normally.
      clearDockTabIntent();
      heldAgainst.current = null;
    }
    const previous = reconciled.current;
    reconciled.current = { scope, dockKey };
    if (previous === null && explicitScope === scope) {
      // First run in this window — a new /map/ops window, or this one after a
      // reload. The persisted tab was explicitly chosen under the scope that is
      // still current, so it stands exactly as it would have in the window that
      // made the choice: until the scope changes once, or the session does (a
      // session change is a different dock key, so the marker cannot match).
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
    explicitScope,
    markExplicitDockTab,
    stampDockTabIntent,
    posture,
    scope,
    scopeReconcileRequestId,
    setDockTab,
  ]);
}
