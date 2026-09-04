import { useEffect } from "react";
import { OpsConsole } from "@/components/ops/OpsConsole";
import { useMapStore } from "@/stores/mapStore";
import { useMapOperationalStore } from "@/stores/mapOperationalStore";
import { useMapDisplayTime } from "@/hooks/useUTCClock";
import { useOperationalWorkspaceSync } from "@/hooks/useMapOperationalContext";
import { useOperatingSync } from "@/hooks/useOperatingSync";
import { useRigBridgeSync } from "@/hooks/useRigBridgeSync";

/** Full-window presentation of the same stores and commands as the map dock. */
export function PropSphereOpsWindow() {
  const timeOffset = useMapStore((state) => state.timeOffset);
  const absoluteTime = useMapStore((state) => state.absoluteTime);
  const setWorkspaceOpen = useMapOperationalStore(
    (state) => state.setWorkspaceOpen,
  );
  const displayTime = useMapDisplayTime(timeOffset, absoluteTime);

  useOperationalWorkspaceSync();
  useRigBridgeSync();
  useOperatingSync();

  useEffect(() => {
    setWorkspaceOpen(true);
  }, [setWorkspaceOpen]);

  return (
    <main
      className="overflow-hidden bg-cosmic-gradient p-2 text-white"
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
