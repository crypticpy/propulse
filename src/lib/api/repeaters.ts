/**
 * RepeaterBook API client
 * Fetches nearby repeaters via the RepeaterBook proxy edge function
 */

/** Normalized repeater record */
export interface Repeater {
  /** Repeater callsign (e.g., "W1AW") */
  callsign: string;
  /** Output frequency in MHz */
  frequency: number;
  /** Offset from output frequency in MHz */
  offset: number;
  /** CTCSS/PL tone (e.g., "100.0") or null */
  tone: string | null;
  /** Latitude in degrees */
  lat: number;
  /** Longitude in degrees */
  lon: number;
  /** Nearest city */
  city: string;
  /** US state or region */
  state: string;
  /** Mode: "FM" | "DMR" | "D-Star" | "P25" | "YSF" etc */
  mode: string;
  /** Access: "OPEN" | "CLOSED" | "PRIVATE" */
  use: string;
  /** Whether the repeater is currently operational */
  operational: boolean;
}

/** Response shape for convenience (not used in fetch, but useful for consumers) */
export interface RepeaterResponse {
  count: number;
  results: Repeater[];
}

/**
 * Fetch nearby repeaters from RepeaterBook via the proxy edge function.
 * Returns an empty array on failure to keep UI resilient.
 *
 * @param lat - Latitude in degrees
 * @param lon - Longitude in degrees
 * @param distMiles - Search radius in miles (default: 50)
 * @param signal - Optional AbortSignal for cancellation
 */
export async function fetchRepeaters(
  lat: number,
  lon: number,
  distMiles = 50,
  signal?: AbortSignal,
): Promise<Repeater[]> {
  const res = await fetch(
    `/api/atmos/repeaters?lat=${lat}&lon=${lon}&dist=${distMiles}`,
    { signal },
  );

  if (!res.ok) return [];

  try {
    const raw = await res.json();
    // RepeaterBook returns { count, results } or an array
    const items: Record<string, unknown>[] =
      raw.results ?? (Array.isArray(raw) ? raw : []);

    return items
      .map((r) => ({
        callsign: String(r["Callsign"] ?? r.callsign ?? ""),
        frequency: Number(r["Frequency"] ?? r.frequency ?? 0),
        offset:
          Number(r["Input Freq"] ?? r.offset ?? 0) -
          Number(r["Frequency"] ?? r.frequency ?? 0),
        tone: r["PL"] ? String(r["PL"]) : null,
        lat: Number(r["Lat"] ?? r.lat ?? 0),
        lon: Number(r["Long"] ?? r.lon ?? 0),
        city: String(r["Nearest City"] ?? r.city ?? ""),
        state: String(r["State"] ?? r.state ?? ""),
        mode: String(r["Use"] ?? r.mode ?? "FM"),
        use: String(r["Operational Status"] ?? r.use ?? "OPEN"),
        operational: r["Operational Status"] !== "Off-Air",
      }))
      .filter((r: Repeater) => r.frequency > 0 && r.lat !== 0);
  } catch {
    return [];
  }
}
