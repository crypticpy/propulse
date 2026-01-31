/**
 * Aurora data API client
 * Fetches NOAA OVATION aurora forecast data
 */

/**
 * Represents a single coordinate with aurora probability
 */
export interface AuroraCoordinate {
  /** Latitude in degrees (-90 to 90) */
  lat: number;
  /** Longitude in degrees (-180 to 180) */
  lon: number;
  /** Aurora probability (0-100) */
  aurora: number;
}

/**
 * Aurora forecast data from NOAA OVATION model
 */
export interface AuroraData {
  /** Time of the observation used for the forecast */
  observationTime: string;
  /** Time the forecast is valid for */
  forecastTime: string;
  /** Array of coordinates with aurora probabilities */
  coordinates: AuroraCoordinate[];
}

/**
 * Raw NOAA OVATION API response structure
 */
interface NOAAOvationResponse {
  "Observation Time": string;
  "Forecast Time": string;
  coordinates: [number, number, number][]; // [lon, lat, aurora]
}

/**
 * Fetch aurora data from NOAA OVATION model
 * Returns aurora probability data for both hemispheres
 *
 * @returns Promise<AuroraData> - Aurora forecast data
 * @throws Error if the request fails
 */
export async function fetchAuroraData(): Promise<AuroraData> {
  const url = "/api/aurora";

  try {
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`HTTP error ${response.status}: ${response.statusText}`);
    }

    const data: NOAAOvationResponse = await response.json();

    // Transform NOAA response to our format
    // NOAA returns [lon, lat, aurora] arrays
    const coordinates: AuroraCoordinate[] = data.coordinates.map(
      ([lon, lat, aurora]) => ({
        lat,
        lon: lon > 180 ? lon - 360 : lon, // Normalize longitude to -180 to 180
        aurora,
      }),
    );

    return {
      observationTime: data["Observation Time"],
      forecastTime: data["Forecast Time"],
      coordinates,
    };
  } catch (error) {
    throw new Error(
      error instanceof Error ? error.message : "Failed to fetch aurora data",
    );
  }
}
