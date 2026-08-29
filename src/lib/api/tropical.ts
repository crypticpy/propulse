/**
 * Tropical cyclone API client
 * Fetches active tropical systems from NHC via our edge proxy
 */

/** Saffir-Simpson category or tropical designation */
export type StormCategory =
  | "TD" // Tropical Depression
  | "TS" // Tropical Storm
  | "1" // Category 1
  | "2" // Category 2
  | "3" // Category 3
  | "4" // Category 4
  | "5"; // Category 5

/** Forecast track point */
export interface ForecastPoint {
  lat: number;
  lon: number;
  time: string; // ISO timestamp
  maxWind: number; // knots
  category: StormCategory;
}

/** Active tropical cyclone */
export interface TropicalCyclone {
  id: string;
  name: string;
  basin: "atlantic" | "pacific";
  category: StormCategory;
  lat: number;
  lon: number;
  maxWind: number; // knots
  minPressure: number; // mb
  movement: string; // e.g. "NW at 12 mph"
  forecastTrack: ForecastPoint[];
  lastUpdate: string; // ISO timestamp
}

/** JTWC basin designation for a tracked system */
export type JtwcBasin = "wpac" | "io" | "shem";

/** A JTWC-tracked system (West Pacific / Indian Ocean / S. Hemisphere) */
export interface JtwcCyclone {
  id: string;
  name: string;
  basin: JtwcBasin;
  category: string;
  warningNumber: number | null;
  lat: number | null;
  lon: number | null;
  maxWinds: number | null;
  link: string | null;
}

/** Response shape from our edge proxy */
interface TropicalResponse {
  activeStorms: TropicalCyclone[];
  jtwc?: JtwcCyclone[];
  jtwcAvailable?: boolean;
}

/** Everything one fetch of /api/atmos/tropical yields */
export interface TropicalSummary {
  activeStorms: TropicalCyclone[];
  jtwc: JtwcCyclone[];
  jtwcAvailable: boolean;
}

function windToCategory(wind: number): StormCategory {
  if (wind >= 157) return "5";
  if (wind >= 130) return "4";
  if (wind >= 111) return "3";
  if (wind >= 96) return "2";
  if (wind >= 64) return "1";
  if (wind >= 34) return "TS";
  return "TD";
}

/**
 * Parses the NHC CurrentSummaries JSON into our typed format.
 * NHC returns a varied structure -- we normalize it here.
 */
function parseNHCResponse(data: unknown): TropicalCyclone[] {
  // NHC CurrentSummaries.json returns an array of storm objects
  // Each has: id, name, classification, lat, lon, intensity, pressure, movement
  if (!data || typeof data !== "object") return [];

  const storms: TropicalCyclone[] = [];

  // Handle the NHC response format - it's an array of active cyclones
  const items = Array.isArray(data)
    ? data
    : (((data as Record<string, unknown>).activeStorms as unknown[]) ?? []);

  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    const s = item as Record<string, unknown>;

    const id = String(s.id ?? s.binNumber ?? "");
    const name = String(s.name ?? "Unknown");
    if (!id) continue;

    // Parse classification to category
    const classification = String(
      s.classification ?? s.type ?? "TD",
    ).toUpperCase();
    let category: StormCategory = "TD";
    if (classification.includes("HURRICANE") || classification.includes("HU")) {
      const wind = Number(s.intensity ?? s.maxWind ?? 0);
      category = windToCategory(wind);
    } else if (
      classification.includes("TROPICAL STORM") ||
      classification.includes("TS")
    ) {
      category = "TS";
    }

    const lat = Number(s.lat ?? s.latitude ?? 0);
    const lon = Number(s.lon ?? s.longitude ?? 0);
    if (lat === 0 && lon === 0) continue;

    storms.push({
      id,
      name,
      basin: lon > -30 ? "atlantic" : "pacific",
      category,
      lat,
      lon,
      maxWind: Number(s.intensity ?? s.maxWind ?? 0),
      minPressure: Number(s.pressure ?? s.minPressure ?? 0),
      movement: String(s.movement ?? s.movementDir ?? ""),
      forecastTrack: parseForecastTrack(s.forecastTrack ?? s.forecast),
      lastUpdate: String(
        s.lastUpdate ?? s.advisoryDate ?? new Date().toISOString(),
      ),
    });
  }

  return storms;
}

function parseForecastTrack(track: unknown): ForecastPoint[] {
  if (!Array.isArray(track)) return [];

  return track
    .filter(
      (p): p is Record<string, unknown> => p != null && typeof p === "object",
    )
    .map((p) => {
      const wind = Number(p.maxWind ?? p.intensity ?? 0);
      return {
        lat: Number(p.lat ?? p.latitude ?? 0),
        lon: Number(p.lon ?? p.longitude ?? 0),
        time: String(p.time ?? p.dateTime ?? ""),
        maxWind: wind,
        category: windToCategory(wind),
      };
    })
    .filter((p) => p.lat !== 0 || p.lon !== 0);
}

const EMPTY_SUMMARY: TropicalSummary = {
  activeStorms: [],
  jtwc: [],
  jtwcAvailable: false,
};

/**
 * Fetch active tropical cyclones (NHC + JTWC) from our edge proxy in a
 * single request.
 */
export async function fetchTropicalSummary(
  signal?: AbortSignal,
): Promise<TropicalSummary> {
  const res = await fetch("/api/atmos/tropical", { signal });
  if (!res.ok) return EMPTY_SUMMARY;

  const data: unknown = await res.json();

  // If our proxy already normalized the data
  if (
    data &&
    typeof data === "object" &&
    "activeStorms" in (data as Record<string, unknown>)
  ) {
    const resp = data as TropicalResponse;
    return {
      activeStorms: resp.activeStorms,
      jtwc: Array.isArray(resp.jtwc) ? resp.jtwc : [],
      jtwcAvailable: resp.jtwcAvailable === true,
    };
  }

  // Otherwise parse raw NHC response
  return { ...EMPTY_SUMMARY, activeStorms: parseNHCResponse(data) };
}
