/**
 * useFt8AutoConfig — FT8/FT4 auto-configuration toggle handler.
 *
 * When enabling FT8:
 *   1. Snapshots current radio + client-side DSP settings
 *   2. Configures radio for FT8 (USB mode, wide filter, AGC off, NR off, NB off)
 *   3. Starts FFT stream if not running
 *   4. Disables client-side NR and noise gate
 *
 * When disabling FT8:
 *   1. Restores all saved radio settings
 *   2. Restores client-side DSP settings
 */

import { useCallback, useRef } from "react";
import type { RadioState } from "@/lib/radio/protocol";
import { useSettingsStore } from "@/stores/settingsStore";
import { useSdrStore } from "@/stores/sdrStore";

// ── Constants ────────────────────────────────────────────────────────────────

/** Modes compatible with FT8/FT4 decoding (all upper-sideband digital variants). */
const FT8_USB_MODES = ["USB", "DIGU", "DATA-U", "DIGI-U", "USB-D"];
const isFt8CompatibleMode = (m: string) =>
  FT8_USB_MODES.includes(m.toUpperCase());

// ── Types ────────────────────────────────────────────────────────────────────

export interface UseFt8AutoConfigOptions {
  connectedDeviceId: string | null;
  effectiveStateRef: React.RefObject<RadioState | null>;
  ft8Decoder: {
    enabled: boolean;
    toggle: () => void;
  };
  fftEnabled: boolean;
  audioEnabled: boolean;
  handleModeChange: (mode: string) => void;
  handleFilterChange: (low: number, high: number) => void;
  handleAgcToggle: (enabled: boolean) => void;
  handleNrChange: (enabled: boolean, level: number) => void;
  handleNbChange: (enabled: boolean, threshold: number) => void;
  handleToggleFft: () => void;
  handleToggleAudio: () => void;
}

export interface Ft8AutoConfig {
  handleFt8Toggle: () => void;
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useFt8AutoConfig(opts: UseFt8AutoConfigOptions): Ft8AutoConfig {
  const {
    connectedDeviceId,
    effectiveStateRef,
    ft8Decoder,
    handleModeChange,
    handleFilterChange,
    handleAgcToggle,
    handleNrChange,
    handleNbChange,
    handleToggleFft,
  } = opts;

  const preFt8SettingsRef = useRef<{
    mode: string | null;
    filter: { low: number; high: number } | null;
    agc: boolean | null;
    nr: { enabled: boolean; level: number } | null;
    nb: { enabled: boolean; threshold?: number } | null;
    clientNr: boolean;
    noiseGate: boolean;
  } | null>(null);

  const handleFt8Toggle = useCallback(() => {
    const wasEnabled = ft8Decoder.enabled;
    ft8Decoder.toggle();

    if (!wasEnabled) {
      // ── ENABLING ──────────────────────────────────────────────
      const state = effectiveStateRef.current;
      const settings = useSettingsStore.getState();

      // 1. Snapshot current radio + client-side DSP settings
      preFt8SettingsRef.current = {
        mode: state?.mode ?? null,
        filter: state?.filter ? { ...state.filter } : null,
        agc: state?.agc ?? null,
        nr: state?.nr ? { ...state.nr } : null,
        nb: state?.nb ? { ...state.nb } : null,
        clientNr: settings.sdrNrEnabled,
        noiseGate: settings.sdrNoiseGateEnabled,
      };

      if (connectedDeviceId) {
        // 2. Mode -> USB if not already an FT8-compatible sideband mode
        if (state?.mode && !isFt8CompatibleMode(state.mode)) {
          handleModeChange("USB");
        }

        // 3. Filter -> 0-3000 Hz (full FT8 decode window)
        handleFilterChange(0, 3000);

        // 4. AGC off -- prevents audio level modulation that corrupts decoding
        if (state?.agc !== false) {
          handleAgcToggle(false);
        }

        // 5. Hardware NR off -- DSP noise reduction mangles FT8 waveforms
        if (state?.nr?.enabled) {
          handleNrChange(false, state.nr.level);
        }

        // 6. Hardware NB off -- noise blanker clips FT8 signal pulses
        if (state?.nb?.enabled) {
          handleNbChange(false, state.nb.threshold ?? 0);
        }

        // 7. Auto-start FFT streaming so waterfall shows FT8 signals
        if (!useSdrStore.getState().fftEnabled) {
          handleToggleFft();
        }
      }

      // 8. Client-side NR off -- same reason as hardware NR
      if (settings.sdrNrEnabled) {
        useSettingsStore.getState().updatePreferences({ sdrNrEnabled: false });
      }

      // 9. Client-side noise gate off -- would squelch weak FT8 signals
      if (settings.sdrNoiseGateEnabled) {
        useSettingsStore
          .getState()
          .updatePreferences({ sdrNoiseGateEnabled: false });
      }
    } else {
      // ── DISABLING -- restore previous settings ─────────────────
      const saved = preFt8SettingsRef.current;

      if (saved && connectedDeviceId) {
        // Restore mode (only if we changed it)
        if (saved.mode && !isFt8CompatibleMode(saved.mode)) {
          handleModeChange(saved.mode);
        }

        // Restore filter
        if (saved.filter) {
          handleFilterChange(saved.filter.low, saved.filter.high);
        }

        // Restore AGC
        if (saved.agc === true) {
          handleAgcToggle(true);
        }

        // Restore hardware NR
        if (saved.nr?.enabled) {
          handleNrChange(true, saved.nr.level);
        }

        // Restore hardware NB
        if (saved.nb?.enabled) {
          handleNbChange(true, saved.nb.threshold ?? 0);
        }
      }

      // Restore client-side DSP (works even without radio connection)
      if (saved) {
        if (saved.clientNr) {
          useSettingsStore.getState().updatePreferences({ sdrNrEnabled: true });
        }
        if (saved.noiseGate) {
          useSettingsStore
            .getState()
            .updatePreferences({ sdrNoiseGateEnabled: true });
        }
      }

      // Don't stop FFT/audio streaming -- user may want those running
      preFt8SettingsRef.current = null;
    }
  }, [
    connectedDeviceId,
    ft8Decoder,
    effectiveStateRef,
    handleAgcToggle,
    handleFilterChange,
    handleModeChange,
    handleNbChange,
    handleNrChange,
    handleToggleFft,
  ]);

  return { handleFt8Toggle };
}
