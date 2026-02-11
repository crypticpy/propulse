/**
 * useLoggedQsoLocations — geocode logbook entries for map overlay
 *
 * Reads QSOs from IndexedDB logStore and resolves each to a lat/lon
 * using grid locator (preferred) or callsign prefix fallback.
 * Returns an array of located QSOs for canvas rendering as arcs.
 *
 * Uses React Query for async IndexedDB access with appropriate caching.
 */

import { useQuery } from "@tanstack/react-query";
import { useProfileStore } from "@/stores/profileStore";
import { getAllLogEntries } from "@/lib/db/logStore";
import { gridToLatLon, isValidGrid } from "@/lib/utils/grid";
import {
  extractPrefixFromCallsign,
  getLocationFromPrefix,
} from "@/lib/data/prefixLocations";

export interface LocatedLogQso {
  callsign: string;
  lat: number;
  lon: number;
  band: string;
  mode: string;
  date: string;
}

export interface LogQsoOverlayData {
  homeLat: number;
  homeLon: number;
  qsos: LocatedLogQso[];
}

const LOG_QSOS_QUERY_KEY = ["loggedQsoLocations"] as const;

/** Max QSOs to display on the map to avoid canvas overload */
const MAX_DISPLAY_QSOS = 500;

/**
 * Fetch and geocode log entries from IndexedDB.
 * Returns most recent entries first, capped at MAX_DISPLAY_QSOS.
 */
async function fetchAndGeocodeLogEntries(): Promise<LocatedLogQso[]> {
  const entries = await getAllLogEntries();

  // Sort newest first
  const sorted = entries.sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
  );

  const located: LocatedLogQso[] = [];
  for (const entry of sorted) {
    if (located.length >= MAX_DISPLAY_QSOS) break;

    let lat: number | null = null;
    let lon: number | null = null;

    // Prefer grid locator for precision
    if (entry.grid && isValidGrid(entry.grid)) {
      const coords = gridToLatLon(entry.grid);
      lat = coords.lat;
      lon = coords.lon;
    }

    // Fallback to callsign prefix lookup
    if (lat === null || lon === null) {
      const prefix = extractPrefixFromCallsign(entry.callsign);
      const loc = getLocationFromPrefix(prefix);
      if (loc) {
        lat = loc.lat;
        lon = loc.lon;
      }
    }

    if (lat !== null && lon !== null) {
      located.push({
        callsign: entry.callsign,
        lat,
        lon,
        band: entry.band,
        mode: entry.mode,
        date: entry.date,
      });
    }
  }

  return located;
}

/**
 * Returns geocoded logbook QSOs when enabled.
 * Uses React Query for async IndexedDB access.
 */
export function useLoggedQsoLocations(
  enabled = true,
): LogQsoOverlayData | null {
  const station = useProfileStore((s) => s.station);

  const { data: qsos } = useQuery({
    queryKey: LOG_QSOS_QUERY_KEY,
    queryFn: fetchAndGeocodeLogEntries,
    enabled: enabled && !!station,
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });

  if (!qsos || qsos.length === 0 || !station) return null;

  return {
    homeLat: station.lat,
    homeLon: station.lon,
    qsos,
  };
}
