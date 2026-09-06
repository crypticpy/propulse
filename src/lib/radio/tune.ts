import { useRigStore } from "@/stores/rigStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { useKioskStore } from "@/stores/kioskStore";
import { mapSpotModeToRigMode } from "@/lib/map/spotPresentation";

export interface TuneConnection {
  catEnabled: boolean;
  bridgeEnabled: boolean;
  bridgeConnected: boolean;
  connected: boolean;
  kiosk: boolean;
}

export function tuneDisabledReason(connection: TuneConnection, frequencyKHz: number): string | null {
  if (!connection.catEnabled) return "CAT OFF";
  if (connection.kiosk) return "DISPLAY ONLY";
  if (!connection.bridgeEnabled) return "BRIDGE OFF";
  if (!connection.bridgeConnected) return "BRIDGE SEEKING";
  if (!connection.connected) return "RIG WAITING";
  const hz = Math.round(frequencyKHz * 1000);
  if (!Number.isFinite(frequencyKHz) || !Number.isSafeInteger(hz) || hz <= 0)
    return "INVALID FREQUENCY";
  return null;
}

/** Recheck at activation; stage both commands atomically without claiming CAT acknowledgement. */
export function queueTune(frequencyKHz: number, mode?: string): boolean {
  const rig = useRigStore.getState();
  if (tuneDisabledReason({ ...rig, bridgeEnabled: useSettingsStore.getState().bridgeEnabled,
    kiosk: useKioskStore.getState().active }, frequencyKHz)) return false;
  useRigStore.setState({
    pendingFrequency: Math.round(frequencyKHz * 1000),
    pendingMode: mapSpotModeToRigMode(mode, frequencyKHz),
  });
  return true;
}
