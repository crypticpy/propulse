import { useEffect, useState } from "react";
import { OpsConsole } from "@/components/ops/OpsConsole";
import { useMapStore } from "@/stores/mapStore";
import { useMapOperationalStore } from "@/stores/mapOperationalStore";
import { useMapDisplayTime } from "@/hooks/useUTCClock";
import { useDockTabReconciler } from "@/hooks/useDockTabReconciler";
import { useOperationalWorkspaceSync } from "@/hooks/useMapOperationalContext";
import { useOperatingSync } from "@/hooks/useOperatingSync";
import { useRigBridgeSync } from "@/hooks/useRigBridgeSync";
import { useOperatingPopoutPresence } from "@/lib/workspace/operatingPopout";

/**
 * Full-window presentation of the same stores and commands as the map dock.
 *
 * This outer component exists only to apply the popout's startup state before
 * anything that reads the derived operating scope mounts (#884 round 11).
 * `workspaceOpen` is not persisted, so a fresh popout starts with it false; it
 * is also per-window and never synced (#884 round 12), so this write cannot be
 * undone by the handshake reply from a main window whose own flag is false;
 * opening it in an effect *beside* `useDockTabReconciler` gave the reconciler a
 * first run at a scope the window was about to leave, and it cleared the
 * operator's explicit dock tab on the way past. The reconciler's contract is
 * that its host has already applied every startup input to the scope, so the
 * console is rendered only once that is true.
 */
export function PropSphereOpsWindow() {
  const setWorkspaceOpen = useMapOperationalStore(
    (state) => state.setWorkspaceOpen,
  );
  const [startupApplied, setStartupApplied] = useState(false);

  useEffect(() => {
    setWorkspaceOpen(true);
    setStartupApplied(true);
  }, [setWorkspaceOpen]);

  if (!startupApplied) {
    // One frame of the same surface, so there is no flash before the console.
    return (
      <main
        className="overflow-hidden bg-cosmic-gradient p-2 text-su-text"
        style={{ height: "100vh" }}
        aria-busy="true"
      />
    );
  }

  return <OperationalWorkspaceWindow />;
}

/** The window proper: mounted only after the startup state above is applied. */
function OperationalWorkspaceWindow() {
  const timeOffset = useMapStore((state) => state.timeOffset);
  const absoluteTime = useMapStore((state) => state.absoluteTime);
  const displayTime = useMapDisplayTime(timeOffset, absoluteTime);

  useOperationalWorkspaceSync();
  // Tell the window that opened this one when the document goes away, so its
  // derived scope stops counting a popout that is gone (#884 round 15).
  useOperatingPopoutPresence();
  // The popout mounts OpsConsole on its own, in a separate document with its
  // own store instances, so it owns the dock-tab reconciliation here (#884).
  useDockTabReconciler();
  useRigBridgeSync();
  useOperatingSync();

  return (
    <main
      className="overflow-hidden bg-cosmic-gradient p-2 text-su-text"
      style={{ height: "100vh" }}
    >
      <OpsConsole
        displayTime={displayTime}
        onCollapse={() => window.close()}
        className="h-full"
      />
    </main>
  );
}

export default PropSphereOpsWindow;
