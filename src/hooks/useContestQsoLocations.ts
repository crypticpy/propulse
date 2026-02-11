/**
 * useContestQsoLocations — geocode active contest QSOs for map overlay
 *
 * Reads QSOs from the active contest session and resolves each callsign
 * to a lat/lon using prefix lookup. Returns an array of located QSOs
 * suitable for canvas rendering as arcs from the home station.
 */

import { useMemo } from "react";
import { useContestStore } from "@/stores/contestStore";
import { useProfileStore } from "@/stores/profileStore";
import {
  extractPrefixFromCallsign,
  getLocationFromPrefix,
} from "@/lib/data/prefixLocations";

export interface LocatedContestQso {
  callsign: string;
  lat: number;
  lon: number;
  band: string;
  mode: string;
  timestamp: string;
  isMultiplier: boolean;
}

export interface ContestQsoOverlayData {
  homeLat: number;
  homeLon: number;
  qsos: LocatedContestQso[];
}

/**
 * Returns geocoded contest QSOs when enabled. Memoized to avoid
 * re-geocoding on every render.
 */
export function useContestQsoLocations(
  enabled = true,
): ContestQsoOverlayData | null {
  const qsos = useContestStore((s) => s.activeSession?.qsos);
  const homeLat = useProfileStore((s) => s.station?.lat);
  const homeLon = useProfileStore((s) => s.station?.lon);

  return useMemo(() => {
    if (
      !enabled ||
      !qsos ||
      qsos.length === 0 ||
      homeLat == null ||
      homeLon == null
    )
      return null;

    const located: LocatedContestQso[] = [];
    for (const qso of qsos) {
      const prefix = extractPrefixFromCallsign(qso.callsign);
      const loc = getLocationFromPrefix(prefix);
      if (loc) {
        located.push({
          callsign: qso.callsign,
          lat: loc.lat,
          lon: loc.lon,
          band: qso.band,
          mode: qso.mode,
          timestamp: qso.timestamp,
          isMultiplier: qso.isMultiplier,
        });
      }
    }

    if (located.length === 0) return null;

    return {
      homeLat,
      homeLon,
      qsos: located,
    };
  }, [enabled, qsos, homeLat, homeLon]);
}
