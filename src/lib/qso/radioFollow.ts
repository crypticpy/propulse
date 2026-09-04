import { bandFromFreq } from "@/lib/utils/bandFromFreq";
import { mapSpotModeToRigMode } from "@/lib/map/spotPresentation";
import type { OpsPosture } from "@/lib/map/contactMapPolicy";
import { useKioskStore } from "@/stores/kioskStore";
import { useOpsPostureStore } from "@/stores/opsPostureStore";
import { useQSOStore } from "@/stores/qsoStore";
import { useRigStore } from "@/stores/rigStore";
import { useSettingsStore } from "@/stores/settingsStore";
import type { DXSpot } from "@/types/dxcluster";

export function shouldWipeDraftOnQsy(args: {
  posture: OpsPosture;
  enabled: boolean;
  contactBand: string | null | undefined;
  nextBand: string | null | undefined;
}): boolean {
  if (!args.enabled || args.posture !== "contact") return false;
  const current = args.contactBand?.trim().toLowerCase() ?? "";
  if (!current) return false;
  const next = args.nextBand?.trim().toLowerCase() ?? "";
  return next !== current;
}

/**
 * CAT follow for the compact logger. Frequency always updates. If the VFO
 * leaves the band being worked, the callsign is wiped so the next log cannot
 * inherit the previous station.
 */
export function applyCatFrequencyFollow(freqHz: number): void {
  if (freqHz <= 0) return;
  const freqKHz = Math.round(freqHz / 10) / 100;
  useQSOStore.getState().setField("frequency", freqKHz);
  useQSOStore.getState().setField("rigSource", "bridge");

  const settings = useSettingsStore.getState().uiInteraction;
  const wipeEnabled = settings?.qsyWipeOnBandChange !== false;
  const ops = useOpsPostureStore.getState();
  const nextBand = bandFromFreq(freqKHz);
  if (
    shouldWipeDraftOnQsy({
      posture: ops.posture,
      enabled: wipeEnabled,
      contactBand: ops.contactBand,
      nextBand,
    })
  ) {
    useQSOStore.getState().setField("callsign", "");
    ops.exitContact("desk");
  }
}

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
