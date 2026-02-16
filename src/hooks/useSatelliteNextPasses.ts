/**
 * useSatelliteNextPasses -- Batch hook for computing next pass predictions.
 *
 * Returns a Map of NORAD ID -> next PassPrediction (or null) for each
 * satellite in the input array. Only computes when observer location
 * is available. Uses a 6-hour prediction window for performance.
 */

import { useMemo } from "react";
import { getSimplePassPrediction } from "@/lib/api/satellites";
import type { SatelliteInfoExtended, PassPrediction } from "@/types/satellite";

export function useSatelliteNextPasses(
  satellites: SatelliteInfoExtended[],
  observerLat: number | undefined,
  observerLon: number | undefined,
): Map<number, PassPrediction | null> {
  return useMemo(() => {
    const map = new Map<number, PassPrediction | null>();

    // No observer location — return empty map
    if (observerLat === undefined || observerLon === undefined) {
      return map;
    }

    const now = new Date();

    for (const sat of satellites) {
      try {
        const passes = getSimplePassPrediction(
          sat,
          observerLat,
          observerLon,
          now,
          6, // 6-hour window for performance
        );
        map.set(sat.noradId, passes.length > 0 ? passes[0] : null);
      } catch {
        map.set(sat.noradId, null);
      }
    }

    return map;
  }, [satellites, observerLat, observerLon]);
}
