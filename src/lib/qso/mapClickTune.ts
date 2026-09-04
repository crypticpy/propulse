import { mapSpotModeToRigMode } from "@/lib/map/spotPresentation";
import { useKioskStore } from "@/stores/kioskStore";
import { useRigStore } from "@/stores/rigStore";
import { useSettingsStore } from "@/stores/settingsStore";
import type { DXSpot } from "@/types/dxcluster";

/** Map click QSYs only when the operator opted in. Inspect stays inspect. */
export function maybeTuneOnMapClick(spot: DXSpot): void {
  if (useKioskStore.getState().active) return;
  if (useSettingsStore.getState().uiInteraction?.spotClickTunesRadio !== true) {
    return;
  }
  const rig = useRigStore.getState();
  rig.setPendingFrequency(spot.frequency * 1000);
  rig.setPendingMode(mapSpotModeToRigMode(spot.mode, spot.frequency));
}
