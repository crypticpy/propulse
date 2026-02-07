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
import { getCachedResponse, setCachedResponse } from "@/lib/utils/idbCache";

/** TTL values for IDB caching per endpoint */
const ENDPOINT_TTL_MS: Record<string, number> = {
  "k-index": 30 * 60 * 1000, // 30 minutes
  flux: 60 * 60 * 1000, // 1 hour
  magnetometer: 15 * 60 * 1000, // 15 minutes
  sunspots: 6 * 60 * 60 * 1000, // 6 hours
  probabilities: 60 * 60 * 1000, // 1 hour
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
        { status: response.status, endpoint },
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
