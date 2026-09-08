import { useRef } from "react";
import type { FamilySlotId } from "@/lib/views/runtime";
import type { LayoutMode } from "@/stores/mapStore";

/**
 * PropSphere keeps its family slot while HamClock is showing so the monitor
 * runtime is not disposed. HamClockView mounts its own `hamclock` host.
 */
export function usePropSphereFamilySlot(layoutMode: LayoutMode): FamilySlotId {
  const lastFamily = useRef<FamilySlotId>(
    layoutMode === "hamclock" ? "normal" : layoutMode,
  );
  if (layoutMode !== "hamclock") {
    lastFamily.current = layoutMode;
  }
  return lastFamily.current;
}
