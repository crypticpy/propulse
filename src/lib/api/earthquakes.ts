/**
 * USGS Earthquake API client
 * Fetches recent significant earthquakes (M2.5+) from the past day
 */

/**
 * Represents a single earthquake event
 */
export interface EarthquakeEvent {
  /** Unique event identifier */
  id: string;
  /** Latitude in degrees */
  lat: number;
  /** Longitude in degrees */
  lon: number;
  /** Depth in kilometers */
  depth: number;
  /** Magnitude (Richter scale) */
  magnitude: number;
  /** Human-readable location description */
  place: string;
  /** Unix timestamp in milliseconds */
  time: number;
}

/**
 * USGS GeoJSON feature structure
 */
interface USGSFeature {
  id: string;
  properties: {
    mag: number | null;
    place: string | null;
    time: number | null;
  };
  geometry: {
    coordinates: [number, number, number]; // [lon, lat, depth]
  } | null;
}

/**
 * USGS GeoJSON response structure
 */
interface USGSGeoJSONResponse {
  type: string;
  features: USGSFeature[];
}

const USGS_EARTHQUAKE_URL =
  "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson";

/**
 * Fetch recent M2.5+ earthquakes from the past 24 hours
 * Uses the USGS public GeoJSON feed (CORS-friendly, no proxy needed)
 *
 * @returns Promise<EarthquakeEvent[]> - Array of earthquake events
 */
export async function fetchEarthquakes(): Promise<EarthquakeEvent[]> {
  try {
    const response = await fetch(USGS_EARTHQUAKE_URL);

    if (!response.ok) {
      throw new Error(`HTTP error ${response.status}: ${response.statusText}`);
    }

    const data: USGSGeoJSONResponse = await response.json();

    if (!Array.isArray(data.features)) {
      return [];
    }

    return data.features
      .filter(
        (
          feature,
        ): feature is USGSFeature & {
          geometry: NonNullable<USGSFeature["geometry"]>;
        } =>
          feature.geometry !== null &&
          feature.properties.mag !== null &&
          feature.properties.time !== null,
      )
      .map((feature) => ({
        id: feature.id,
        lon: feature.geometry.coordinates[0],
        lat: feature.geometry.coordinates[1],
        depth: feature.geometry.coordinates[2],
        magnitude: feature.properties.mag!,
        place: feature.properties.place ?? "Unknown location",
        time: feature.properties.time!,
      }));
  } catch (error) {
    console.warn(
      "[earthquakes] Failed to fetch:",
      error instanceof Error ? error.message : error,
    );
    return [];
  }
}
