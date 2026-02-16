/**
 * NOAA SWPC API client functions
 * These functions call our Vercel Edge Function proxies to fetch solar weather data
 * from NOAA's Space Weather Prediction Center while avoiding CORS restrictions
 */

import type {
  KIndexData,
  SolarFluxData,
  SolarProbabilities,
  SunspotData,
  MagnetometerData,
  ApiError,
} from "./types";
import type {
  XrayFluxEntry,
  ProtonFluxEntry,
  DstEntry,
  DRAPData,
  CMEAnalysis,
  SolarFluxForecast,
} from "@/types/alerts";
import { getCachedResponse, setCachedResponse } from "@/lib/utils/idbCache";

async function safeParseErrorBody(response: Response): Promise<string | null> {
  try {
    const clone = response.clone();
    const body = await clone.json();
    return typeof body?.error === "string" ? body.error : null;
  } catch {
    return null;
  }
}

/** TTL values for IDB caching per endpoint */
const ENDPOINT_TTL_MS: Record<string, number> = {
  "k-index": 30 * 60 * 1000, // 30 minutes
  flux: 60 * 60 * 1000, // 1 hour
  magnetometer: 15 * 60 * 1000, // 15 minutes
  sunspots: 6 * 60 * 60 * 1000, // 6 hours
  probabilities: 60 * 60 * 1000, // 1 hour
  xray: 2 * 60 * 1000, // 2 minutes
  protons: 2 * 60 * 1000, // 2 minutes
  dst: 10 * 60 * 1000, // 10 minutes
  drap: 5 * 60 * 1000, // 5 minutes
  cme: 30 * 60 * 1000, // 30 minutes
  "flux-forecast": 60 * 60 * 1000, // 1 hour
};

/**
 * Base fetch wrapper with error handling and IDB caching.
 * Serves cached data when available and fresh, falling back to network.
 */
async function fetchFromProxy<T>(endpoint: string): Promise<T> {
  const url = `/api/solar/${endpoint}`;
  const ttl = ENDPOINT_TTL_MS[endpoint];

  // Check IDB cache first
  if (ttl) {
    const cached = await getCachedResponse(url);
    if (cached !== null) return cached as T;
  }

  try {
    const response = await fetch(url);

    if (!response.ok) {
      throw Object.assign(
        new Error(`HTTP error ${response.status}: ${response.statusText}`),
        {
          status: response.status,
          endpoint,
          upstreamError: await safeParseErrorBody(response),
        },
      );
    }

    const data = await response.json();

    // Cache the response in IDB (fire-and-forget)
    if (ttl) {
      setCachedResponse(url, data, ttl).catch(() => {});
    }

    return data as T;
  } catch (error) {
    if ((error as ApiError).endpoint) {
      throw error;
    }

    throw Object.assign(
      new Error(
        error instanceof Error ? error.message : "Unknown error occurred",
      ),
      { endpoint },
    );
  }
}

/**
 * Fetch planetary K-index data
 * The K-index measures geomagnetic activity on a scale of 0-9
 *
 * @returns Promise<KIndexData[]> - Array of K-index measurements (1-minute resolution)
 * @throws ApiError if the request fails
 */
export async function fetchKIndex(): Promise<KIndexData[]> {
  return fetchFromProxy<KIndexData[]>("k-index");
}

/**
 * Fetch 10.7 cm solar radio flux data
 * The F10.7 index is measured in solar flux units (sfu) and indicates solar activity
 *
 * @returns Promise<SolarFluxData[]> - Array of flux measurements
 * @throws ApiError if the request fails
 */
export async function fetchSolarFlux(): Promise<SolarFluxData[]> {
  return fetchFromProxy<SolarFluxData[]>("flux");
}

/**
 * Raw NOAA probability response (different field names from our interface)
 */
interface NOAAProbabilityResponse {
  date: string;
  c_class_1_day: number;
  m_class_1_day: number;
  x_class_1_day: number;
  "10mev_protons_1_day": number;
}

/**
 * Fetch solar event probability forecast
 * Returns probabilities for C, M, X-class flares and proton events
 *
 * @returns Promise<SolarProbabilities> - Current probability forecast
 * @throws ApiError if the request fails
 */
export async function fetchProbabilities(): Promise<SolarProbabilities> {
  const data = await fetchFromProxy<NOAAProbabilityResponse[]>("probabilities");
  // The API returns an array, we want the most recent forecast
  if (Array.isArray(data) && data.length > 0) {
    const latest = data[data.length - 1];
    // Map NOAA field names to our interface
    return {
      time_tag: latest.date,
      c_prob: latest.c_class_1_day,
      m_prob: latest.m_class_1_day,
      x_prob: latest.x_class_1_day,
      proton_prob: latest["10mev_protons_1_day"],
    };
  }
  throw Object.assign(new Error("No probability data available"), {
    endpoint: "probabilities",
  });
}

/**
 * Raw NOAA sunspot response (uses hyphenated field name)
 */
interface NOAASunspotResponse {
  "time-tag": string;
  ssn: number;
}

/**
 * Fetch sunspot number data
 * Historical and current sunspot counts for solar cycle monitoring
 *
 * @returns Promise<SunspotData[]> - Array of sunspot measurements
 * @throws ApiError if the request fails
 */
export async function fetchSunspots(): Promise<SunspotData[]> {
  const data = await fetchFromProxy<NOAASunspotResponse[]>("sunspots");
  // Map NOAA field names to our interface
  return data.map((item) => ({
    time_tag: item["time-tag"],
    ssn: item.ssn,
  }));
}

/**
 * Raw NOAA magnetometer response format (array of arrays)
 * First row is headers: ["time_tag", "bx_gsm", "by_gsm", "bz_gsm", "lon_gsm", "lat_gsm", "bt"]
 */
type RawMagnetometerRow = [
  string,
  string,
  string,
  string,
  string,
  string,
  string,
];

/**
 * Safely parse a numeric string, returning null for invalid/NaN values.
 * Explicitly checks for null and empty string before parsing.
 */
function toNumberOrNull(value: string | undefined | null): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : null;
}

/** Expected headers for raw magnetometer data validation */
const EXPECTED_MAG_HEADERS = ["time_tag", "bx_gsm", "by_gsm", "bz_gsm"];

/**
 * Fetch solar wind magnetometer data
 * Returns IMF Bz, By, and total field (Bt) measurements
 * Bz is critical for predicting geomagnetic storm impacts
 *
 * Handles both raw NOAA format (dev proxy) and processed format (Edge Function).
 *
 * @returns Promise<MagnetometerData[]> - Array of magnetometer measurements (1-minute resolution)
 * @throws ApiError if the request fails
 */
export async function fetchMagnetometer(): Promise<MagnetometerData[]> {
  const data = await fetchFromProxy<MagnetometerData[] | RawMagnetometerRow[]>(
    "magnetometer",
  );

  // Raw NOAA format - transform it
  if (Array.isArray(data) && data.length > 0 && Array.isArray(data[0])) {
    const rawData = data as RawMagnetometerRow[];

    // Validate header row contains expected columns
    const headerRow = rawData[0];
    const hasExpectedHeaders = EXPECTED_MAG_HEADERS.every((h) =>
      headerRow.some((col) => col.toLowerCase().includes(h.toLowerCase())),
    );

    if (!hasExpectedHeaders) {
      console.warn(
        "Magnetometer data headers do not match expected format:",
        headerRow,
      );
      return [];
    }

    // Transform data rows, filtering out malformed rows
    return rawData
      .slice(1)
      .filter((row) => Array.isArray(row) && row.length >= 7)
      .map((row) => ({
        time_tag: row[0],
        by_gsm: toNumberOrNull(row[2]),
        bz_gsm: toNumberOrNull(row[3]),
        bt: toNumberOrNull(row[6]),
      }));
  }

  // Already in processed format
  return data as MagnetometerData[];
}

// =============================================================================
// EXPANDED SOLAR DATA ENDPOINTS
// =============================================================================

/**
 * Fetch GOES X-ray flux data
 * Returns recent X-ray flux measurements for flare detection
 *
 * @returns Promise<XrayFluxEntry[]> - Array of X-ray flux measurements
 * @throws ApiError if the request fails
 */
export async function fetchXrayFlux(): Promise<XrayFluxEntry[]> {
  return fetchFromProxy<XrayFluxEntry[]>("xray");
}

/**
 * Fetch GOES integral proton flux data (>= 10 MeV)
 * Used for solar proton event detection
 *
 * @returns Promise<ProtonFluxEntry[]> - Array of proton flux measurements
 * @throws ApiError if the request fails
 */
export async function fetchProtonFlux(): Promise<ProtonFluxEntry[]> {
  return fetchFromProxy<ProtonFluxEntry[]>("protons");
}

/**
 * Raw Dst response row from NOAA Kyoto endpoint
 * Format: [time_tag, dst_value] pairs with header row
 */
type RawDstRow = [string, string];

/**
 * Fetch Dst (Disturbance Storm Time) index data
 * Dst < -50 nT indicates moderate geomagnetic storm
 *
 * Handles raw NOAA format (array of [time_tag, dst] pairs with header row).
 *
 * @returns Promise<DstEntry[]> - Array of Dst index measurements
 * @throws ApiError if the request fails
 */
export async function fetchDstIndex(): Promise<DstEntry[]> {
  const data = await fetchFromProxy<DstEntry[] | RawDstRow[]>("dst");

  // Raw NOAA format: array of [time_tag, dst] string pairs, first row is header
  if (Array.isArray(data) && data.length > 0 && Array.isArray(data[0])) {
    const rawData = data as RawDstRow[];

    // Skip header row, transform remaining entries
    return rawData
      .slice(1)
      .filter((row) => Array.isArray(row) && row.length >= 2)
      .map((row) => ({
        time_tag: row[0],
        dst: parseFloat(row[1]),
      }))
      .filter((entry) => Number.isFinite(entry.dst));
  }

  // Already in processed format
  return data as DstEntry[];
}

/**
 * Fetch D-Region Absorption Prediction (DRAP) data
 * Returns a grid of maximum usable frequencies showing HF absorption areas
 *
 * @returns Promise<DRAPData> - DRAP frequency absorption grid
 * @throws ApiError if the request fails
 */
export async function fetchDRAPData(): Promise<DRAPData> {
  return fetchFromProxy<DRAPData>("drap");
}

/**
 * Fetch CME (Coronal Mass Ejection) analysis data from NASA DONKI
 * Returns recent Earth-directed CME analyses
 *
 * @returns Promise<CMEAnalysis[]> - Array of CME analysis entries
 * @throws ApiError if the request fails
 */
export async function fetchCMEAnalysis(): Promise<CMEAnalysis[]> {
  return fetchFromProxy<CMEAnalysis[]>("cme");
}

/**
 * Fetch solar flux forecast (3-day NOAA forecast)
 * Returns the raw forecast text and parsed forecast entries
 *
 * @returns Promise<{ raw: string; forecast: SolarFluxForecast[] }> - Raw text + parsed forecast
 * @throws ApiError if the request fails
 */
export async function fetchFluxForecast(): Promise<{
  raw: string;
  forecast: SolarFluxForecast[];
}> {
  const url = "/api/solar/flux-forecast";
  const ttl = ENDPOINT_TTL_MS["flux-forecast"];

  // Check IDB cache first
  if (ttl) {
    const cached = await getCachedResponse(url);
    if (cached !== null)
      return cached as { raw: string; forecast: SolarFluxForecast[] };
  }

  const response = await fetch(url);
  if (!response.ok) {
    throw Object.assign(
      new Error(`HTTP error ${response.status}: ${response.statusText}`),
      { status: response.status, endpoint: "flux-forecast" },
    );
  }

  const contentType = response.headers.get("content-type") || "";

  // Edge function returns JSON with { raw, forecast }
  // Dev proxy returns raw text — parse client-side
  if (contentType.includes("application/json")) {
    const data = (await response.json()) as {
      raw: string;
      forecast: Array<{
        date: string;
        predicted_flux: number | null;
        predicted_a_index?: number | null;
      }>;
    };

    const forecast: SolarFluxForecast[] = data.forecast
      .filter((entry) => entry.predicted_flux !== null)
      .map((entry) => ({
        date: entry.date,
        predicted_flux: entry.predicted_flux!,
        predicted_a_index:
          typeof entry.predicted_a_index === "number"
            ? entry.predicted_a_index
            : undefined,
      }));

    const result = { raw: data.raw, forecast };
    if (ttl) setCachedResponse(url, result, ttl).catch(() => {});
    return result;
  }

  // Raw text from dev proxy — parse client-side
  const text = await response.text();
  const forecast = parseFluxForecastText(text);
  const result = { raw: text, forecast };
  if (ttl) setCachedResponse(url, result, ttl).catch(() => {});
  return result;
}

/**
 * Parse the NOAA 3-day solar-geomag predictions text into SolarFluxForecast entries.
 * Used in dev mode when the Vite proxy returns raw text instead of JSON.
 *
 * Format: colon-prefixed section headers with values on the next line:
 *   :Prediction_dates:   2026 Feb 14   2026 Feb 15   2026 Feb 16
 *   :10cm_flux:
 *                           115           115           110
 */
function parseFluxForecastText(text: string): SolarFluxForecast[] {
  const lines = text.split("\n");

  // Extract dates from :Prediction_dates: line
  const dateHeaders: string[] = [];
  for (const line of lines) {
    if (line.startsWith(":Prediction_dates:")) {
      const matches = line.matchAll(/(\d{4})\s+(\w{3})\s+(\d{1,2})/g);
      for (const m of matches) {
        dateHeaders.push(`${m[2]} ${m[3]}`);
      }
      break;
    }
  }

  const days: Array<{ date: string; predicted_flux: number | null }> = [];
  for (let d = 0; d < 3; d++) {
    days.push({ date: dateHeaders[d] || `Day ${d + 1}`, predicted_flux: null });
  }

  // Find :10cm_flux: header — values are on the next line
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === ":10cm_flux:") {
      const nextLine = lines[i + 1] || "";
      const sfiValues = nextLine
        .trim()
        .split(/\s+/)
        .map(Number)
        .filter((n) => Number.isFinite(n) && n >= 50 && n <= 400);
      for (let d = 0; d < Math.min(sfiValues.length, 3); d++) {
        days[d].predicted_flux = sfiValues[d];
      }
      break;
    }
  }

  return days
    .filter((d) => d.predicted_flux !== null)
    .map((d) => ({ date: d.date, predicted_flux: d.predicted_flux! }));
}
