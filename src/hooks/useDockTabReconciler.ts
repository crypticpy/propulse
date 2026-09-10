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
 * 2. Otherwise it acts only when the resolved scope actually changed. The
 *    scope is recorded on every run — including a run the posture gate
 *    rejects — so a later posture change cannot replay a stale reconcile.
 * 3. Contact and Desk own the dock tab, so Work does not hide the band map.
 */

import { useEffect, useRef } from "react";
import { useContestStore } from "@/stores/contestStore";
import { useContestUIStore } from "@/stores/contestUIStore";
import { useContestUIEphemeralStore } from "@/stores/contestUIEphemeralStore";
import { useOpsPostureStore } from "@/stores/opsPostureStore";
import { useMapOperationalContext } from "@/hooks/useMapOperationalContext";
import type { MapDataScope } from "@/lib/map/operationalScope";

export function useDockTabReconciler(): void {
  const sessionId = useContestStore((s) => s.activeSession?.id ?? null);
  const dockKey = sessionId ?? "no-session";
  const setDockTab = useContestUIStore((s) => s.setDockTab);
  const posture = useOpsPostureStore((s) => s.posture);
  const { scope } = useMapOperationalContext();
  const explicitDockTab = useContestUIEphemeralStore((s) => s.explicitDockTab);
  const clearExplicitDockTab = useContestUIEphemeralStore(
    (s) => s.clearExplicitDockTab,
  );
  const reconciledScope = useRef<MapDataScope | null>(null);

  useEffect(() => {
    if (explicitDockTab !== null) {
      clearExplicitDockTab();
      reconciledScope.current = scope;
      return;
    }
    const previousScope = reconciledScope.current;
    reconciledScope.current = scope;
    if (previousScope === scope) return;
    if (posture === "contact" || posture === "desk") return;
    if (scope === "observe") {
      setDockTab(dockKey, "dx");
    } else if (scope === "log") {
      setDockTab(dockKey, "log");
    } else if (scope === "contest" && sessionId) {
      setDockTab(sessionId, "contest");
    }
  }, [
    clearExplicitDockTab,
    dockKey,
    explicitDockTab,
    posture,
    scope,
    sessionId,
    setDockTab,
  ]);
}
