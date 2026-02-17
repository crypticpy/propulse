/**
 * useStormImpact Hook
 *
 * Reads the user's station config (location + antennas) from profile and shack
 * stores, then runs the pure storm impact analyzer against a given alert.
 *
 * Returns a memoized StormImpactReport or null when no alert is provided.
 */

import { useMemo } from "react";
import type { SolarAlert } from "@/types/alerts";
import {
  analyzeStormImpact,
  isStormRelevantType,
  type StormImpactReport,
  type StationConfig,
  type StationAntenna,
} from "@/lib/utils/stormImpactAnalyzer";
import { useProfileStore } from "@/stores/profileStore";
import { useShackStore } from "@/stores/shackStore";

// =============================================================================
// HOOK
// =============================================================================

/**
 * Compute a personalized storm-impact report for the given alert.
 *
 * @param alert  Active solar alert, or null to skip analysis.
 * @returns StormImpactReport if the alert is storm-relevant, null otherwise.
 */
export function useStormImpact(
  alert: SolarAlert | null,
): StormImpactReport | null {
  // ── Station location ──────────────────────────────────────────────────────
  const station = useProfileStore((s) => s.station);
  const latitude = station?.lat ?? null;
  const longitude = station?.lon ?? null;

  // ── Antennas from shack ───────────────────────────────────────────────────
  const shackAntennas = useShackStore((s) => s.antennas);

  // ── Build stable station config ───────────────────────────────────────────
  const stationConfig = useMemo<StationConfig>(() => {
    const antennas: StationAntenna[] = shackAntennas
      .filter((a) => !a.retiredAt) // exclude retired antennas
      .map((a) => ({
        name: a.name,
        type: a.antennaType,
        bands: a.bands,
      }));

    // Collect unique active bands from all non-retired antennas
    const activeBands = Array.from(new Set(antennas.flatMap((a) => a.bands)));

    return { latitude, longitude, antennas, activeBands };
  }, [latitude, longitude, shackAntennas]);

  // ── Run analysis (memoized on alert id + station config) ──────────────────
  return useMemo(() => {
    if (!alert) return null;
    if (!isStormRelevantType(alert.type)) return null;

    return analyzeStormImpact(alert, stationConfig);
  }, [alert, stationConfig]);
}
