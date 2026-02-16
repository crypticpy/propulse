/**
 * useEqBands — EQ band CRUD handlers for the parametric equalizer system.
 *
 * Replaces the old useNotchFilters hook with a unified EQ band model that
 * supports bell, notch, shelf, and pass filter types across two categories.
 *
 * All handlers are stable (empty deps) and use useSettingsStore.getState()
 * directly so they never trigger re-renders or go stale.
 */

import { useCallback } from "react";
import { useSettingsStore } from "@/stores/settingsStore";
import type { EqBand, EqFilterType, EqBandCategory } from "@/lib/audio/eqTypes";
import {
  MAX_EQ_BANDS,
  createDefaultBand,
  filterTypeUsesGain,
} from "@/lib/audio/eqTypes";

// ── Types ────────────────────────────────────────────────────────────────────

export interface EqBandHandlers {
  handleAddEqBand: (
    freqHz: number,
    gainDb: number,
    category: EqBandCategory,
  ) => void;
  handleRemoveEqBand: (id: string) => void;
  handleUpdateEqBand: (
    id: string,
    freqHz: number,
    q: number,
    gainDb: number,
  ) => void;
  handleUpdateEqBandType: (id: string, filterType: EqFilterType) => void;
  handleToggleEqBand: (id: string, enabled: boolean) => void;
  handleEqBandQChange: (id: string, q: number) => void;
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useEqBands(): EqBandHandlers {
  const handleAddEqBand = useCallback(
    (freqHz: number, gainDb: number, category: EqBandCategory) => {
      const current = useSettingsStore.getState().sdrEqBands;
      if (current.length >= MAX_EQ_BANDS) return;
      useSettingsStore.getState().updatePreferences({
        sdrEqBands: [...current, createDefaultBand(category, freqHz, gainDb)],
      });
    },
    [],
  );

  const handleRemoveEqBand = useCallback((id: string) => {
    const current = useSettingsStore.getState().sdrEqBands;
    useSettingsStore.getState().updatePreferences({
      sdrEqBands: current.filter((b: EqBand) => b.id !== id),
    });
  }, []);

  const handleUpdateEqBand = useCallback(
    (id: string, freqHz: number, q: number, gainDb: number) => {
      const current = useSettingsStore.getState().sdrEqBands;
      useSettingsStore.getState().updatePreferences({
        sdrEqBands: current.map((b: EqBand) =>
          b.id === id ? { ...b, freqHz, q, gainDb } : b,
        ),
      });
    },
    [],
  );

  const handleUpdateEqBandType = useCallback(
    (id: string, filterType: EqFilterType) => {
      const current = useSettingsStore.getState().sdrEqBands;
      useSettingsStore.getState().updatePreferences({
        sdrEqBands: current.map((b: EqBand) =>
          b.id === id
            ? {
                ...b,
                filterType,
                gainDb: filterTypeUsesGain(filterType) ? b.gainDb : 0,
              }
            : b,
        ),
      });
    },
    [],
  );

  const handleToggleEqBand = useCallback((id: string, enabled: boolean) => {
    const current = useSettingsStore.getState().sdrEqBands;
    useSettingsStore.getState().updatePreferences({
      sdrEqBands: current.map((b: EqBand) =>
        b.id === id ? { ...b, enabled } : b,
      ),
    });
  }, []);

  const handleEqBandQChange = useCallback((id: string, q: number) => {
    const clamped = Math.max(0.1, Math.min(50, q));
    const current = useSettingsStore.getState().sdrEqBands;
    useSettingsStore.getState().updatePreferences({
      sdrEqBands: current.map((b: EqBand) =>
        b.id === id ? { ...b, q: clamped } : b,
      ),
    });
  }, []);

  return {
    handleAddEqBand,
    handleRemoveEqBand,
    handleUpdateEqBand,
    handleUpdateEqBandType,
    handleToggleEqBand,
    handleEqBandQChange,
  };
}
