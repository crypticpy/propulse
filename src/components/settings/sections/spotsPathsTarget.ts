import { useIsMobile } from "@/hooks/useIsMobile";
import { previewSlotId, type FamilySlotId } from "@/lib/views/runtime";
import { useMapStore, type LayoutMode } from "@/stores/mapStore";

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
 * Family slot the running map reads on this device.
 *
 * Viewport decides first: `App.tsx` routes `/map` to `MobileMap` when
 * `useIsMobile()`, and `MobileMap` mounts `<BoundViewHost slot="normal">`
 * whatever `layoutMode` says. `layoutMode` is persisted per browser profile,
 * so a phone that last synced a Pro layout would otherwise be offered a `pro`
 * target no host on that device ever reads.
 *
 * Off mobile, Lite shares the Normal mount point and therefore the "normal"
 * slot (`usePropSphereFamilySlot`); HamClock mounts its own `hamclock` host.
 */
export function familySlotForLayout(
  layoutMode: LayoutMode,
  isMobile: boolean,
): FamilySlotId {
  if (isMobile) return "normal";
  return layoutMode === "lite" ? "normal" : layoutMode;
}

/** The family slot this device's map host is bound to right now. */
export function useSpotsPathsTargetSlot(): FamilySlotId {
  const layoutMode = useMapStore((state) => state.layoutMode);
  const isMobile = useIsMobile();
  return familySlotForLayout(layoutMode, isMobile);
}
