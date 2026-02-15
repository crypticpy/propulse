/**
 * useActivation — Activation state management for POTA/SOTA workflows.
 *
 * Tracks active POTA or SOTA activation state including:
 * - Activation type, park/summit reference, and display name
 * - QSO count against threshold (POTA: 10, SOTA: 4)
 * - Elapsed timer since activation start
 * - Integration with qsoStore operating mode and mySig/mySigInfo
 * - Persistence in localStorage so state survives page refresh
 *
 * Usage:
 * ```ts
 * const { isActive, qsoCount, threshold, startActivation, endActivation } = useActivation();
 * ```
 */

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useQSOStore } from "@/stores/qsoStore";
import { getAllLogEntries } from "@/lib/db/logStore";
import type { LogEntry } from "@/lib/db/types";

// ── Constants ────────────────────────────────────────────────────────────────

const STORAGE_KEY = "propulse-activation";

/** Minimum QSOs for a valid activation */
const THRESHOLDS: Record<"pota" | "sota", number> = {
  pota: 10,
  sota: 4,
};

// ── Types ────────────────────────────────────────────────────────────────────

export type ActivationType = "pota" | "sota";

interface ActivationState {
  type: ActivationType;
  ref: string;
  name: string;
  startTime: string; // ISO timestamp
  endTime: string | null;
}

export interface UseActivationReturn {
  /** Whether an activation is currently in progress */
  isActive: boolean;
  /** Type of the current activation */
  activationType: ActivationType | null;
  /** POTA park reference (e.g., "K-1234") */
  parkRef: string | null;
  /** SOTA summit reference (e.g., "W4C/CM-001") */
  summitRef: string | null;
  /** Display name of the park/summit */
  activationName: string | null;
  /** Number of QSOs logged for this activation */
  qsoCount: number;
  /** Threshold for a valid activation */
  threshold: number;
  /** Activation start time (ISO) */
  startTime: string | null;
  /** Elapsed time in seconds since activation start */
  elapsedTime: number;
  /** Whether the QSO threshold has been met */
  isThresholdMet: boolean;
  /** Start a new activation */
  startActivation: (type: ActivationType, ref: string, name: string) => void;
  /** End the current activation */
  endActivation: () => void;
  /** Get all log entries matching the current activation */
  getActivationEntries: () => Promise<LogEntry[]>;
}

// ── Persistence Helpers ──────────────────────────────────────────────────────

function loadPersistedState(): ActivationState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ActivationState;
    // Validate shape
    if (
      parsed &&
      typeof parsed.type === "string" &&
      typeof parsed.ref === "string" &&
      typeof parsed.startTime === "string"
    ) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

function persistState(state: ActivationState | null): void {
  if (state) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } else {
    localStorage.removeItem(STORAGE_KEY);
  }
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useActivation(): UseActivationReturn {
  const [activation, setActivation] = useState<ActivationState | null>(
    loadPersistedState,
  );
  const [qsoCount, setQsoCount] = useState(0);
  const [elapsedTime, setElapsedTime] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval>>();

  const setOperatingMode = useQSOStore((s) => s.setOperatingMode);
  const setField = useQSOStore((s) => s.setField);
  const setFormDefaults = useQSOStore((s) => s.setFormDefaults);
  // Subscribe to entries changes so we recount when new QSOs are logged
  const storeEntries = useQSOStore((s) => s.entries);

  // ── QSO Count ────────────────────────────────────────────────────────────

  const countActivationQSOs = useCallback(async () => {
    if (!activation) {
      setQsoCount(0);
      return;
    }

    try {
      const allEntries = await getAllLogEntries();
      const sigKey = activation.type === "pota" ? "POTA" : "SOTA";
      const count = allEntries.filter(
        (e) => e.mySig === sigKey && e.mySigInfo === activation.ref,
      ).length;
      setQsoCount(count);
    } catch (err) {
      console.error("[useActivation] Failed to count QSOs:", err);
    }
  }, [activation]);

  // Re-count when activation changes or store entries change
  useEffect(() => {
    countActivationQSOs();
  }, [countActivationQSOs, storeEntries]);

  // ── Timer ────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = undefined;
    }

    if (!activation || activation.endTime) {
      setElapsedTime(0);
      return;
    }

    const startMs = new Date(activation.startTime).getTime();

    const tick = () => {
      const now = Date.now();
      setElapsedTime(Math.floor((now - startMs) / 1000));
    };

    tick(); // immediate update
    timerRef.current = setInterval(tick, 1000);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [activation]);

  // ── Actions ──────────────────────────────────────────────────────────────

  const startActivation = useCallback(
    (type: ActivationType, ref: string, name: string) => {
      const newState: ActivationState = {
        type,
        ref,
        name,
        startTime: new Date().toISOString(),
        endTime: null,
      };

      // Set qsoStore operating mode and sticky fields
      setOperatingMode(type);
      setField("mySigInfo", ref);
      setFormDefaults({ mySigInfo: ref });

      setActivation(newState);
      persistState(newState);
    },
    [setOperatingMode, setField, setFormDefaults],
  );

  const endActivation = useCallback(() => {
    if (activation) {
      const ended: ActivationState = {
        ...activation,
        endTime: new Date().toISOString(),
      };
      persistState(null); // Clear persisted state
      setActivation(null);
      // Reset operating mode
      setOperatingMode("general");
      setField("mySigInfo", "");
      setFormDefaults({ mySigInfo: "" });

      // Store ended activation for potential export (in sessionStorage for current tab)
      try {
        sessionStorage.setItem(
          "propulse-last-activation",
          JSON.stringify(ended),
        );
      } catch {
        // sessionStorage may be unavailable
      }
    }
  }, [activation, setOperatingMode, setField, setFormDefaults]);

  const getActivationEntries = useCallback(async (): Promise<LogEntry[]> => {
    if (!activation) return [];

    try {
      const allEntries = await getAllLogEntries();
      const sigKey = activation.type === "pota" ? "POTA" : "SOTA";
      return allEntries.filter(
        (e) => e.mySig === sigKey && e.mySigInfo === activation.ref,
      );
    } catch (err) {
      console.error("[useActivation] Failed to get activation entries:", err);
      return [];
    }
  }, [activation]);

  // ── Derived Values ───────────────────────────────────────────────────────

  const isActive = activation !== null && activation.endTime === null;
  const threshold = activation ? THRESHOLDS[activation.type] : 0;
  const isThresholdMet = qsoCount >= threshold && threshold > 0;

  const result = useMemo(
    (): UseActivationReturn => ({
      isActive,
      activationType: activation?.type ?? null,
      parkRef: activation?.type === "pota" ? activation.ref : null,
      summitRef: activation?.type === "sota" ? activation.ref : null,
      activationName: activation?.name ?? null,
      qsoCount,
      threshold,
      startTime: activation?.startTime ?? null,
      elapsedTime,
      isThresholdMet,
      startActivation,
      endActivation,
      getActivationEntries,
    }),
    [
      isActive,
      activation,
      qsoCount,
      threshold,
      elapsedTime,
      isThresholdMet,
      startActivation,
      endActivation,
      getActivationEntries,
    ],
  );

  return result;
}
