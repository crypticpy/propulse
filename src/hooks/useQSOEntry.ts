/**
 * useQSOEntry — Master hook for QSO entry form.
 *
 * Wires bridge/CAT auto-fill, profile prefill, and operating mode
 * auto-detection into a single convenient API for the entry form.
 */

import { useEffect, useRef } from "react";
import { useQSOStore } from "@/stores/qsoStore";
import { useProfileStore } from "@/stores/profileStore";
import { useRigStore } from "@/stores/rigStore";
import type { OperatingMode } from "@/types/qso";

/** Map rig modes to simplified form modes */
function normalizeRigMode(rigMode: string): string {
  const upper = rigMode.toUpperCase();
  if (upper === "USB" || upper === "LSB") return "SSB";
  if (upper === "CW-R" || upper === "CW-L") return "CW";
  if (upper === "RTTY-R") return "RTTY";
  if (upper === "AM-N") return "AM";
  if (upper === "FM-N" || upper === "NFM") return "FM";
  return upper;
}

export function useQSOEntry() {
  const form = useQSOStore((s) => s.form);
  const formDefaults = useQSOStore((s) => s.formDefaults);
  const lookupResult = useQSOStore((s) => s.lookupResult);
  const lookupLoading = useQSOStore((s) => s.lookupLoading);
  const lookupError = useQSOStore((s) => s.lookupError);
  const dupeInfo = useQSOStore((s) => s.dupeInfo);
  const operatingMode = useQSOStore((s) => s.operatingMode);

  const setField = useQSOStore((s) => s.setField);
  const resetForm = useQSOStore((s) => s.resetForm);
  const setFormDefaults = useQSOStore((s) => s.setFormDefaults);
  const applyLookupToForm = useQSOStore((s) => s.applyLookupToForm);
  const logQSO = useQSOStore((s) => s.logQSO);
  const quickLog = useQSOStore((s) => s.quickLog);
  const lookupCallsign = useQSOStore((s) => s.lookupCallsign);
  const clearLookup = useQSOStore((s) => s.clearLookup);
  const checkDupe = useQSOStore((s) => s.checkDupe);
  const setOperatingMode = useQSOStore((s) => s.setOperatingMode);
  const initializeFromProfile = useQSOStore((s) => s.initializeFromProfile);

  // ── Bridge/CAT auto-fill ──────────────────────────────────────────────────

  const rigConnected = useRigStore((s) => s.connected);
  const rigFrequency = useRigStore((s) => s.frequency);
  const rigMode = useRigStore((s) => s.mode);

  const lastRigFreqRef = useRef(0);
  const lastRigModeRef = useRef("");

  useEffect(() => {
    if (!rigConnected) return;

    // Frequency: Hz → kHz
    if (rigFrequency > 0 && rigFrequency !== lastRigFreqRef.current) {
      lastRigFreqRef.current = rigFrequency;
      const freqKHz = Math.round(rigFrequency / 10) / 100; // Hz → kHz with 2 decimal precision
      setField("frequency", freqKHz);
      setField("rigSource", "bridge");
    }

    // Mode
    if (rigMode && rigMode !== lastRigModeRef.current) {
      lastRigModeRef.current = rigMode;
      const normalized = normalizeRigMode(rigMode);
      setField("mode", normalized);
    }
  }, [rigConnected, rigFrequency, rigMode, setField]);

  // ── Profile prefill on mount ──────────────────────────────────────────────

  const didInit = useRef(false);
  useEffect(() => {
    if (didInit.current) return;
    didInit.current = true;
    initializeFromProfile();
  }, [initializeFromProfile]);

  // ── Auto-detect operating mode from active location ───────────────────────

  const activeLocationType = useProfileStore((s) => {
    const station = s.station;
    if (!station) return undefined;
    const activeLocId = station.activeLocationId ?? station.homeLocationId;
    const activeLoc = station.savedLocations.find(
      (loc) => loc.id === activeLocId,
    );
    return activeLoc?.type;
  });

  const didAutoDetect = useRef(false);
  useEffect(() => {
    if (didAutoDetect.current) return;
    if (!activeLocationType) return;
    didAutoDetect.current = true;

    const typeMap: Record<string, OperatingMode> = {
      pota: "pota",
      sota: "sota",
      contest: "contest",
      fieldday: "fieldday",
    };
    const detected = typeMap[activeLocationType];
    if (detected) {
      setOperatingMode(detected);
    }
  }, [activeLocationType, setOperatingMode]);

  return {
    form,
    formDefaults,
    lookupResult,
    lookupLoading,
    lookupError,
    dupeInfo,
    operatingMode,
    rigConnected,
    setField,
    resetForm,
    setFormDefaults,
    applyLookupToForm,
    logQSO,
    quickLog,
    lookupCallsign,
    clearLookup,
    checkDupe,
    setOperatingMode,
    initializeFromProfile,
  };
}
