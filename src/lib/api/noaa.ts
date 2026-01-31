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
  ApiError,
} from "./types";

/**
 * Base fetch wrapper with error handling
 */
async function fetchFromProxy<T>(endpoint: string): Promise<T> {
  const url = `/api/solar/${endpoint}`;

  try {
    const response = await fetch(url);

    if (!response.ok) {
      const error: ApiError = {
        message: `HTTP error ${response.status}: ${response.statusText}`,
        status: response.status,
        endpoint,
      };
      throw error;
    }

    const data = await response.json();
    return data as T;
  } catch (error) {
    if ((error as ApiError).endpoint) {
      throw error;
    }

    const apiError: ApiError = {
      message:
        error instanceof Error ? error.message : "Unknown error occurred",
      endpoint,
    };
    throw apiError;
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
 * Fetch solar event probability forecast
 * Returns probabilities for C, M, X-class flares and proton events
 *
 * @returns Promise<SolarProbabilities> - Current probability forecast
 * @throws ApiError if the request fails
 */
export async function fetchProbabilities(): Promise<SolarProbabilities> {
  const data = await fetchFromProxy<SolarProbabilities[]>("probabilities");
  // The API returns an array, we want the most recent forecast
  if (Array.isArray(data) && data.length > 0) {
    return data[data.length - 1];
  }
  throw {
    message: "No probability data available",
    endpoint: "probabilities",
  } as ApiError;
}

/**
 * Fetch sunspot number data
 * Historical and current sunspot counts for solar cycle monitoring
 *
 * @returns Promise<SunspotData[]> - Array of sunspot measurements
 * @throws ApiError if the request fails
 */
export async function fetchSunspots(): Promise<SunspotData[]> {
  return fetchFromProxy<SunspotData[]>("sunspots");
}
