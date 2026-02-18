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
  handleSweetenToggle: (enabled: boolean) => void;
  handleSweetenAmountChange: (amount: number) => void;
  handleExpanderToggle: (enabled: boolean) => void;
  handleExpanderThresholdChange: (threshold: number) => void;
  handleExpanderRatioChange: (ratio: number) => void;
  handleExpanderAttackMsChange: (attackMs: number) => void;
  handleExpanderReleaseMsChange: (releaseMs: number) => void;
  handleExpanderRangeDbChange: (rangeDb: number) => void;
  handleCompressorToggle: (enabled: boolean) => void;
  handleCompressorThresholdChange: (threshold: number) => void;
  handleCompressorRatioChange: (ratio: number) => void;
  handleCompressorAttackMsChange: (attackMs: number) => void;
  handleCompressorReleaseMsChange: (releaseMs: number) => void;
  handleCompressorKneeChange: (knee: number) => void;
  handleCompressorMakeupDbChange: (makeupDb: number) => void;
  handleSpectralTamingToggle: (enabled: boolean) => void;
  handleSpectralTamingTameAmountChange: (amount: number) => void;
  handleSpectralTamingRecoverAmountChange: (amount: number) => void;
  handleSpectralTamingSpeedChange: (speed: number) => void;
  handleLevelerToggle: (enabled: boolean) => void;
  handleLevelerTargetLevelChange: (level: number) => void;
  handleLevelerSpeedChange: (speed: number) => void;
  handleLevelerMaxGainDbChange: (maxGainDb: number) => void;
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

  const handleSweetenToggle = useCallback((enabled: boolean) => {
    useSettingsStore
      .getState()
      .updatePreferences({ sdrSweetenEnabled: enabled });
  }, []);

  const handleSweetenAmountChange = useCallback((amount: number) => {
    useSettingsStore.getState().updatePreferences({ sdrSweetenAmount: amount });
  }, []);

  const handleExpanderToggle = useCallback((enabled: boolean) => {
    useSettingsStore
      .getState()
      .updatePreferences({ sdrExpanderEnabled: enabled });
  }, []);
  const handleExpanderThresholdChange = useCallback((threshold: number) => {
    useSettingsStore.getState().updatePreferences({
      sdrExpanderThreshold: threshold,
    });
  }, []);
  const handleExpanderRatioChange = useCallback((ratio: number) => {
    useSettingsStore.getState().updatePreferences({ sdrExpanderRatio: ratio });
  }, []);
  const handleExpanderAttackMsChange = useCallback((attackMs: number) => {
    useSettingsStore.getState().updatePreferences({
      sdrExpanderAttackMs: attackMs,
    });
  }, []);
  const handleExpanderReleaseMsChange = useCallback((releaseMs: number) => {
    useSettingsStore.getState().updatePreferences({
      sdrExpanderReleaseMs: releaseMs,
    });
  }, []);
  const handleExpanderRangeDbChange = useCallback((rangeDb: number) => {
    useSettingsStore.getState().updatePreferences({
      sdrExpanderRangeDb: rangeDb,
    });
  }, []);

  const handleCompressorToggle = useCallback((enabled: boolean) => {
    useSettingsStore.getState().updatePreferences({
      sdrCompressorEnabled: enabled,
    });
  }, []);
  const handleCompressorThresholdChange = useCallback((threshold: number) => {
    useSettingsStore.getState().updatePreferences({
      sdrCompressorThreshold: threshold,
    });
  }, []);
  const handleCompressorRatioChange = useCallback((ratio: number) => {
    useSettingsStore
      .getState()
      .updatePreferences({ sdrCompressorRatio: ratio });
  }, []);
  const handleCompressorAttackMsChange = useCallback((attackMs: number) => {
    useSettingsStore.getState().updatePreferences({
      sdrCompressorAttackMs: attackMs,
    });
  }, []);
  const handleCompressorReleaseMsChange = useCallback((releaseMs: number) => {
    useSettingsStore.getState().updatePreferences({
      sdrCompressorReleaseMs: releaseMs,
    });
  }, []);
  const handleCompressorKneeChange = useCallback((knee: number) => {
    useSettingsStore.getState().updatePreferences({ sdrCompressorKnee: knee });
  }, []);
  const handleCompressorMakeupDbChange = useCallback((makeupDb: number) => {
    useSettingsStore.getState().updatePreferences({
      sdrCompressorMakeupDb: makeupDb,
    });
  }, []);

  const handleSpectralTamingToggle = useCallback((enabled: boolean) => {
    useSettingsStore
      .getState()
      .updatePreferences({ sdrSpectralTamingEnabled: enabled });
  }, []);

  const handleSpectralTamingTameAmountChange = useCallback((amount: number) => {
    useSettingsStore
      .getState()
      .updatePreferences({ sdrSpectralTamingTameAmount: amount });
  }, []);

  const handleSpectralTamingRecoverAmountChange = useCallback(
    (amount: number) => {
      useSettingsStore
        .getState()
        .updatePreferences({ sdrSpectralTamingRecoverAmount: amount });
    },
    [],
  );

  const handleSpectralTamingSpeedChange = useCallback((speed: number) => {
    useSettingsStore
      .getState()
      .updatePreferences({ sdrSpectralTamingSpeed: speed });
  }, []);

  const handleLevelerToggle = useCallback((enabled: boolean) => {
    useSettingsStore
      .getState()
      .updatePreferences({ sdrLevelerEnabled: enabled });
  }, []);

  const handleLevelerTargetLevelChange = useCallback((level: number) => {
    useSettingsStore
      .getState()
      .updatePreferences({ sdrLevelerTargetLevel: level });
  }, []);

  const handleLevelerSpeedChange = useCallback((speed: number) => {
    useSettingsStore.getState().updatePreferences({ sdrLevelerSpeed: speed });
  }, []);

  const handleLevelerMaxGainDbChange = useCallback((maxGainDb: number) => {
    useSettingsStore
      .getState()
      .updatePreferences({ sdrLevelerMaxGainDb: maxGainDb });
  }, []);

  return {
    handleNoiseGateToggle,
    handleNoiseGateThresholdChange,
    handleClientNrToggle,
    handleClientNrLevelChange,
    handleSweetenToggle,
    handleSweetenAmountChange,
    handleExpanderToggle,
    handleExpanderThresholdChange,
    handleExpanderRatioChange,
    handleExpanderAttackMsChange,
    handleExpanderReleaseMsChange,
    handleExpanderRangeDbChange,
    handleCompressorToggle,
    handleCompressorThresholdChange,
    handleCompressorRatioChange,
    handleCompressorAttackMsChange,
    handleCompressorReleaseMsChange,
    handleCompressorKneeChange,
    handleCompressorMakeupDbChange,
    handleSpectralTamingToggle,
    handleSpectralTamingTameAmountChange,
    handleSpectralTamingRecoverAmountChange,
    handleSpectralTamingSpeedChange,
    handleLevelerToggle,
    handleLevelerTargetLevelChange,
    handleLevelerSpeedChange,
    handleLevelerMaxGainDbChange,
  };
}
