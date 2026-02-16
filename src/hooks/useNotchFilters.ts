/**
 * useNotchFilters — Notch filter CRUD handlers for the SDR audio chain.
 *
 * All handlers are stable (empty deps) and use useSettingsStore.getState() directly.
 */

import { useCallback } from "react";
import { useSettingsStore } from "@/stores/settingsStore";

// ── Types ────────────────────────────────────────────────────────────────────

export interface NotchFilterHandlers {
  handleAddNotch: (freqHz: number, q: number) => void;
  handleRemoveNotch: (id: string) => void;
  handleUpdateNotch: (id: string, freqHz: number, q: number) => void;
  handleToggleNotch: (id: string, enabled: boolean) => void;
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useNotchFilters(): NotchFilterHandlers {
  const handleAddNotch = useCallback((freqHz: number, q: number) => {
    const id = crypto.randomUUID?.() ?? `notch-${Date.now()}`;
    const current = useSettingsStore.getState().sdrNotchFilters;
    if (current.length >= 8) return; // max 8
    useSettingsStore.getState().updatePreferences({
      sdrNotchFilters: [...current, { id, freqHz, q, enabled: true }],
    });
  }, []);

  const handleRemoveNotch = useCallback((id: string) => {
    const current = useSettingsStore.getState().sdrNotchFilters;
    useSettingsStore.getState().updatePreferences({
      sdrNotchFilters: current.filter((n) => n.id !== id),
    });
  }, []);

  const handleUpdateNotch = useCallback(
    (id: string, freqHz: number, q: number) => {
      const current = useSettingsStore.getState().sdrNotchFilters;
      useSettingsStore.getState().updatePreferences({
        sdrNotchFilters: current.map((n) =>
          n.id === id ? { ...n, freqHz, q } : n,
        ),
      });
    },
    [],
  );

  const handleToggleNotch = useCallback((id: string, enabled: boolean) => {
    const current = useSettingsStore.getState().sdrNotchFilters;
    useSettingsStore.getState().updatePreferences({
      sdrNotchFilters: current.map((n) =>
        n.id === id ? { ...n, enabled } : n,
      ),
    });
  }, []);

  return {
    handleAddNotch,
    handleRemoveNotch,
    handleUpdateNotch,
    handleToggleNotch,
  };
}
