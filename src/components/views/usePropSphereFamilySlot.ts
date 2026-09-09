import { useLayoutEffect, useRef } from "react";
import type { FamilySlotId } from "@/lib/views/runtime";
import type { LayoutMode } from "@/stores/mapStore";

/**
 * PropSphere keeps its family slot while HamClock is showing so the monitor
 * runtime is not disposed. HamClockView mounts its own `hamclock` host.
 *
 * Normal and Lite render the same GlobeView mount point (PropSphere.tsx),
 * so they share the "normal" family here — giving them distinct slot
 * identities forced ViewProvider's React key (and the whole subtree,
 * including the WebGL canvas) to remount on every Normal <-> Lite toggle.
 * Pro renders its own distinct subtree, so it can keep its own family.
 */
export function usePropSphereFamilySlot(layoutMode: LayoutMode): FamilySlotId {
  const currentFamily: FamilySlotId = layoutMode === "lite" ? "normal" : layoutMode;
  const lastFamily = useRef<FamilySlotId>(
    layoutMode === "hamclock" ? "normal" : currentFamily,
  );

  // Ref write moved out of the render body (was not concurrent-safe) — a
  // discarded/replayed render can no longer leave lastFamily out of sync.
  useLayoutEffect(() => {
    if (layoutMode !== "hamclock") {
      lastFamily.current = currentFamily;
    }
  });

  return layoutMode === "hamclock" ? lastFamily.current : currentFamily;
}
