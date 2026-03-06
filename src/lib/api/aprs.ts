/**
 * APRS.fi API client
 * Fetches nearby APRS stations via the APRS.fi proxy edge function
 */

/** Normalized APRS station record */
export interface APRSStation {
  /** Callsign or SSID (e.g., "W5ABC-9") */
  name: string;
  /** Latitude in degrees */
  lat: number;
  /** Longitude in degrees */
  lon: number;
  /** APRS symbol code (e.g., "/k") */
  symbol: string;
  /** Station comment */
  comment: string;
  /** ISO timestamp of last heard */
  lastTime: string;
  /** Digi path (e.g., "WIDE1-1,WIDE2-1") */
  path: string;
  /** Speed in km/h, or null if stationary */
  speed: number | null;
  /** Course in degrees, or null if stationary */
  course: number | null;
}

/**
 * Fetch nearby APRS stations from aprs.fi via the proxy edge function.
 * Returns an empty array on failure to keep UI resilient.
 *
 * @param lat - Latitude in degrees
 * @param lon - Longitude in degrees
 * @param rangeKm - Search radius in kilometers (default: 100)
 * @param signal - Optional AbortSignal for cancellation
 */
export async function fetchAPRSStations(
  lat: number,
  lon: number,
  rangeKm = 100,
  signal?: AbortSignal,
): Promise<APRSStation[]> {
  const res = await fetch(
    `/api/atmos/aprs?lat=${lat}&lon=${lon}&range=${rangeKm}`,
    { signal },
  );

  if (!res.ok) return [];

  try {
    const raw = await res.json();

    if (raw.result !== "ok" || !Array.isArray(raw.entries)) {
      return [];
    }

    return raw.entries
      .map((e: Record<string, unknown>) => {
        const speedVal = e.speed != null ? Number(e.speed) : null;
        const courseVal = e.course != null ? Number(e.course) : null;
        const lasttime = e.lasttime ?? e.time;
        const unixTs = lasttime != null ? Number(lasttime) * 1000 : Date.now();

        return {
          name: String(e.name ?? ""),
          lat: Number(e.lat ?? 0),
          lon: Number(e.lng ?? 0),
          symbol: String(e.symbol ?? ""),
          comment: String(e.comment ?? ""),
          lastTime: new Date(unixTs).toISOString(),
          path: String(e.path ?? ""),
          speed: speedVal != null && !isNaN(speedVal) ? speedVal : null,
          course: courseVal != null && !isNaN(courseVal) ? courseVal : null,
        };
      })
      .filter((s: APRSStation) => s.name !== "" && s.lat !== 0 && s.lon !== 0);
  } catch {
    return [];
  }
}
