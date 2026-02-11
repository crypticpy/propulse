/**
 * NOAA Weather Alerts API client
 * Fetches active weather alerts for the US from weather.gov
 */

/**
 * Represents a single active weather alert with a geographic location
 */
export interface WeatherAlert {
  /** Unique alert identifier */
  id: string;
  /** Event type (e.g., "Severe Thunderstorm Warning", "Tornado Warning") */
  event: string;
  /** Human-readable headline */
  headline: string;
  /** Alert severity level */
  severity: "Extreme" | "Severe" | "Moderate" | "Minor" | "Unknown";
  /** Latitude of the alert area centroid */
  lat: number;
  /** Longitude of the alert area centroid */
  lon: number;
  /** Description of the affected area */
  areaDesc: string;
}

/**
 * NWS alert feature from the GeoJSON response
 */
interface NWSAlertFeature {
  id: string;
  properties: {
    event: string;
    headline: string | null;
    severity: string;
    areaDesc: string;
  };
  geometry: {
    type: string;
    coordinates: number[] | number[][] | number[][][] | number[][][][];
  } | null;
}

/**
 * NWS alerts GeoJSON response structure
 */
interface NWSAlertsResponse {
  type: string;
  features: NWSAlertFeature[];
}

const NWS_ALERTS_URL =
  "https://api.weather.gov/alerts/active?status=actual&message_type=alert";

const VALID_SEVERITIES = new Set([
  "Extreme",
  "Severe",
  "Moderate",
  "Minor",
  "Unknown",
]);

/**
 * Normalize severity string to our union type
 */
function normalizeSeverity(
  raw: string,
): "Extreme" | "Severe" | "Moderate" | "Minor" | "Unknown" {
  return VALID_SEVERITIES.has(raw)
    ? (raw as WeatherAlert["severity"])
    : "Unknown";
}

/**
 * Compute the centroid of a polygon's coordinates.
 * Handles GeoJSON Polygon (number[][][]) and MultiPolygon (number[][][][]) types.
 * Returns [lat, lon] or null if no valid points.
 */
function computeCentroid(
  geometry: NWSAlertFeature["geometry"],
): [number, number] | null {
  if (!geometry) return null;

  let points: number[][] = [];

  if (geometry.type === "Point") {
    const coords = geometry.coordinates as number[];
    if (coords.length >= 2) {
      return [coords[1], coords[0]]; // [lat, lon]
    }
    return null;
  }

  if (geometry.type === "Polygon") {
    // Polygon: number[][][] — take the outer ring
    const rings = geometry.coordinates as number[][][];
    if (rings.length > 0) {
      points = rings[0];
    }
  } else if (geometry.type === "MultiPolygon") {
    // MultiPolygon: number[][][][] — flatten all outer rings
    const polys = geometry.coordinates as number[][][][];
    for (const poly of polys) {
      if (poly.length > 0) {
        points = points.concat(poly[0]);
      }
    }
  }

  if (points.length === 0) return null;

  let sumLat = 0;
  let sumLon = 0;
  let count = 0;

  for (const point of points) {
    if (
      point.length >= 2 &&
      Number.isFinite(point[0]) &&
      Number.isFinite(point[1])
    ) {
      sumLon += point[0];
      sumLat += point[1];
      count++;
    }
  }

  if (count === 0) return null;

  return [sumLat / count, sumLon / count];
}

/**
 * Fetch active weather alerts from the NWS API
 * Only returns alerts that have valid geographic coordinates
 *
 * @returns Promise<WeatherAlert[]> - Array of weather alerts with locations
 */
export async function fetchWeatherAlerts(
  signal?: AbortSignal,
): Promise<WeatherAlert[]> {
  const response = await fetch(NWS_ALERTS_URL, {
    signal,
    headers: {
      Accept: "application/geo+json",
      "User-Agent": "(Propulse, contact@propulse.app)",
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP error ${response.status}: ${response.statusText}`);
  }

  const data: NWSAlertsResponse = await response.json();

  if (!Array.isArray(data.features)) {
    return [];
  }

  const alerts: WeatherAlert[] = [];

  for (const feature of data.features) {
    const centroid = computeCentroid(feature.geometry);
    if (!centroid) continue; // Skip alerts without valid geometry

    const [lat, lon] = centroid;

    alerts.push({
      id: feature.id,
      event: feature.properties.event,
      headline: feature.properties.headline ?? feature.properties.event,
      severity: normalizeSeverity(feature.properties.severity),
      lat,
      lon,
      areaDesc: feature.properties.areaDesc,
    });
  }

  return alerts;
}
