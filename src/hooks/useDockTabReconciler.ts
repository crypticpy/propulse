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
 * 1. An explicit tab click (`explicitDockTab`) is consumed and the reconciler
 *    stands down for that run. The click's own `setWorkspaceOpen(true)` can
 *    move the automatic scope (`workspaceOpen && draft callsign` is one of the
 *    `stationOperationActive` terms), and answering that with a tab write
 *    would undo the click.
 * 2. Otherwise it acts only when the resolved scope or the dock it writes to
 *    actually changed. Both are recorded on every run — including a run the
 *    posture gate rejects — so a later posture change cannot replay a stale
 *    reconcile.
 * 3. Contact and Desk own the dock tab, so Work does not hide the band map.
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
  const explicitDockTab = useContestUIEphemeralStore((s) => s.explicitDockTab);
  const clearExplicitDockTab = useContestUIEphemeralStore(
    (s) => s.clearExplicitDockTab,
  );
  // What the last run reconciled: the scope *and* the dock it wrote to. A new
  // session is a different dock with its own tab, so it needs reconciling even
  // when the scope did not move (the deleted `PropSphere` effect got this from
  // having `contestSessionId` in its dependency list).
  const reconciled = useRef<{ scope: MapDataScope; dockKey: string } | null>(
    null,
  );

  useEffect(() => {
    if (explicitDockTab !== null) {
      clearExplicitDockTab();
      reconciled.current = { scope, dockKey };
      return;
    }
    const previous = reconciled.current;
    reconciled.current = { scope, dockKey };
    if (previous?.scope === scope && previous.dockKey === dockKey) return;
    if (posture === "contact" || posture === "desk") return;
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
    clearExplicitDockTab,
    dockKey,
    explicitDockTab,
    posture,
    scope,
    setDockTab,
  ]);
}
