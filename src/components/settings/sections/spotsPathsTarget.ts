import { previewSlotId, type FamilySlotId } from "@/lib/views/runtime";
import type { LayoutMode } from "@/stores/mapStore";

/**
 * Where the Settings Spots & Paths surface edits, and where it commits.
 *
 * The editing slot is a non-persisting preview slot, so it can never take a
 * mounted map host's `ownerId\0slotId\0kind` registry key, and merely opening
 * Settings writes nothing to the working-slot session storage.
 */
export const SETTINGS_SPOTS_PREVIEW_SLOT = previewSlotId("settings-spots-paths");

export const FAMILY_SLOT_LABEL: Record<FamilySlotId, string> = {
  normal: "Standard map",
  pro: "Pro map",
  lite: "Lite map",
  hamclock: "HamClock wall",
};

/**
 * Family slot the running map reads for this layout. Lite shares the Normal
 * mount point and therefore the "normal" slot (`usePropSphereFamilySlot`);
 * HamClock mounts its own `hamclock` host.
 */
export function familySlotForLayout(layoutMode: LayoutMode): FamilySlotId {
  return layoutMode === "lite" ? "normal" : layoutMode;
}
