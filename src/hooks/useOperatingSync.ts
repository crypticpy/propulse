/**
 * useOperatingSync - Bridges rig, WSJT-X, and contest stores into operatingStore
 *
 * Subscribes to rigStore, wsjtxStore, contestStore, and contestUIStore,
 * pushing resolved band/mode/frequency updates into the central operatingStore.
 * Mount once in both Layout.tsx and MobileLayout.tsx.
 *
 * Each source subscription is a separate useEffect for clarity and independent
 * teardown. Band-level debounce prevents the rig's ~200ms poll cycle from
 * causing unnecessary re-resolves when only frequency (not band) changes.
 */

import { useEffect, useRef } from "react";
import { useRigStore } from "@/stores/rigStore";
import { useWSJTXStore } from "@/stores/wsjtxStore";
import { useContestStore } from "@/stores/contestStore";
import { useContestUIStore } from "@/stores/contestUIStore";
import { useOperatingStore } from "@/stores/operatingStore";
import { normalizeMode } from "@/lib/utils/modeNormalize";
import { frequencyToBand } from "@/types/bridge";
import type { BandId } from "@/types/user";

// ─── Hook ──────────────────────────────────────────────────────────────────

export function useOperatingSync(): void {
  // Refs for band/mode debounce (CAT rig)
  const lastCATBandRef = useRef<string | null>(null);
  const lastCATModeRef = useRef<string | null>(null);

  // Refs for band/mode debounce (WSJT-X)
  const lastWSJTXBandRef = useRef<string | null>(null);
  const lastWSJTXModeRef = useRef<string | null>(null);

  // ── 1. CAT / Rig sync ──────────────────────────────────────────────────

  const rigConnected = useRigStore((s) => s.connected);
  const rigBand = useRigStore((s) => s.band);
  const rigMode = useRigStore((s) => s.mode);
  const rigFrequency = useRigStore((s) => s.frequency);

  useEffect(() => {
    if (!rigConnected) {
      // Rig disconnected — clear CAT source
      lastCATBandRef.current = null;
      lastCATModeRef.current = null;
      useOperatingStore.getState()._setCATConnected(false);
      return;
    }

    // Skip unknown band
    if (rigBand === "?") return;

    const normalizedMode = normalizeMode(String(rigMode));

    // Debounce: only push when band or mode actually changes
    if (
      rigBand === lastCATBandRef.current &&
      normalizedMode === lastCATModeRef.current
    ) {
      return;
    }

    lastCATBandRef.current = rigBand;
    lastCATModeRef.current = normalizedMode;

    useOperatingStore
      .getState()
      .updateFromCAT(rigBand as BandId, normalizedMode, rigFrequency);
  }, [rigConnected, rigBand, rigMode, rigFrequency]);

  // ── 2. WSJT-X sync ─────────────────────────────────────────────────────

  const wsjtxConnected = useWSJTXStore((s) => s.connected);
  const wsjtxStatus = useWSJTXStore((s) => s.status);

  useEffect(() => {
    if (!wsjtxConnected) {
      lastWSJTXBandRef.current = null;
      lastWSJTXModeRef.current = null;
      useOperatingStore.getState()._setWSJTXConnected(false);
      return;
    }

    if (!wsjtxStatus) return;

    const band = frequencyToBand(wsjtxStatus.frequency);
    if (band === "?") return;

    const normalizedMode = normalizeMode(wsjtxStatus.mode);

    // Debounce: only push when band or mode changes
    if (
      band === lastWSJTXBandRef.current &&
      normalizedMode === lastWSJTXModeRef.current
    ) {
      return;
    }

    lastWSJTXBandRef.current = band;
    lastWSJTXModeRef.current = normalizedMode;

    useOperatingStore
      .getState()
      .updateFromWSJTX(band as BandId, normalizedMode, wsjtxStatus.frequency);
  }, [wsjtxConnected, wsjtxStatus]);

  // ── 3. Contest session sync ─────────────────────────────────────────────

  const activeSession = useContestStore((s) => s.activeSession);
  const contestSessionId = activeSession?.id ?? null;

  useEffect(() => {
    useOperatingStore.getState().setContestSession(contestSessionId);
  }, [contestSessionId]);

  // ── 4. Contest band/mode sync ───────────────────────────────────────────

  const contestBand = useContestUIStore((s) =>
    contestSessionId ? s.getBand(contestSessionId) : null,
  );
  const contestMode = useContestUIStore((s) =>
    contestSessionId ? s.getMode(contestSessionId) : null,
  );

  useEffect(() => {
    if (!contestSessionId || !contestBand || !contestMode) return;

    useOperatingStore
      .getState()
      .updateFromContest(contestBand as BandId, normalizeMode(contestMode));
  }, [contestSessionId, contestBand, contestMode]);
}
