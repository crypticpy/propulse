/**
 * useClientDsp — Client-side DSP control handlers (noise gate, spectral NR).
 *
 * All handlers are stable (empty deps) and use useSettingsStore.getState() directly.
 */

import { useCallback } from "react";
import { useSettingsStore } from "@/stores/settingsStore";

// ── Types ────────────────────────────────────────────────────────────────────

export interface ClientDspHandlers {
  handleNoiseGateToggle: (enabled: boolean) => void;
  handleNoiseGateThresholdChange: (threshold: number) => void;
  handleClientNrToggle: (enabled: boolean) => void;
  handleClientNrLevelChange: (level: number) => void;
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useClientDsp(): ClientDspHandlers {
  const handleNoiseGateToggle = useCallback((enabled: boolean) => {
    useSettingsStore.getState().updatePreferences({
      sdrNoiseGateEnabled: enabled,
    });
  }, []);

  const handleNoiseGateThresholdChange = useCallback((threshold: number) => {
    useSettingsStore.getState().updatePreferences({
      sdrNoiseGateThreshold: threshold,
    });
  }, []);

  const handleClientNrToggle = useCallback((enabled: boolean) => {
    useSettingsStore.getState().updatePreferences({ sdrNrEnabled: enabled });
  }, []);

  const handleClientNrLevelChange = useCallback((level: number) => {
    useSettingsStore.getState().updatePreferences({ sdrNrLevel: level });
  }, []);

  return {
    handleNoiseGateToggle,
    handleNoiseGateThresholdChange,
    handleClientNrToggle,
    handleClientNrLevelChange,
  };
}
