/**
 * Geocoding API utilities
 *
 * Uses OpenStreetMap Nominatim for address-to-coordinates conversion.
 * This is a free service with rate limiting (1 request/second).
 */

export interface GeocodingResult {
  lat: number;
  lon: number;
  displayName: string;
  type: string;
  importance: number;
}

export interface GeocodingError {
  type: "network" | "no_results" | "invalid_input" | "rate_limited";
  message: string;
}

/**
 * Geocode an address string to coordinates
 * Uses OpenStreetMap Nominatim API (free, but rate-limited to 1 req/sec)
 *
 * @param query - Address, city, or location name to geocode
 * @param limit - Maximum number of results (default 5)
 * @returns Array of geocoding results or error
 */
export async function geocodeAddress(
  query: string,
  limit: number = 5,
): Promise<{ results: GeocodingResult[] } | { error: GeocodingError }> {
  // Validate input
  const trimmedQuery = query.trim();
  if (!trimmedQuery || trimmedQuery.length < 2) {
    return {
      error: {
        type: "invalid_input",
        message: "Please enter at least 2 characters",
      },
    };
  }

  try {
    const encodedQuery = encodeURIComponent(trimmedQuery);
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodedQuery}&limit=${limit}&addressdetails=1`;

    const response = await fetch(url, {
      headers: {
        // Required by Nominatim usage policy
        "User-Agent": "Propulse Ham Radio App (https://github.com/propulse)",
      },
    });

    if (response.status === 429) {
      return {
        error: {
          type: "rate_limited",
          message: "Too many requests. Please wait a moment and try again.",
        },
      };
    }

    if (!response.ok) {
      return {
        error: {
          type: "network",
          message: `Server error: ${response.status}`,
        },
      };
    }

    const data = await response.json();

    if (!Array.isArray(data) || data.length === 0) {
      return {
        error: {
          type: "no_results",
          message: "No locations found. Try a more specific address.",
        },
      };
    }

    // Transform results
    const results: GeocodingResult[] = data.map(
      (item: {
        lat: string;
        lon: string;
        display_name: string;
        type: string;
        importance: number;
      }) => ({
        lat: parseFloat(item.lat),
        lon: parseFloat(item.lon),
        displayName: item.display_name,
        type: item.type,
        importance: item.importance,
      }),
    );

    return { results };
  } catch (error) {
    return {
      error: {
        type: "network",
        message:
          error instanceof Error ? error.message : "Network error occurred",
      },
    };
  }
}

/**
 * Validate GPS coordinates
 *
 * @param lat - Latitude (-90 to 90)
 * @param lon - Longitude (-180 to 180)
 * @returns Error message or null if valid
 */
export function validateCoordinates(lat: number, lon: number): string | null {
  if (isNaN(lat) || isNaN(lon)) {
    return "Coordinates must be valid numbers";
  }

  if (lat < -90 || lat > 90) {
    return "Latitude must be between -90 and 90";
  }

  if (lon < -180 || lon > 180) {
    return "Longitude must be between -180 and 180";
  }

  return null;
}

/**
 * Parse coordinate string in various formats
 * Supports:
 * - Decimal: "40.7128, -74.0060"
 * - Decimal with degree symbol: "40.7128°, -74.0060°"
 * - DMS: "40°42'46"N 74°0'22"W"
 *
 * @param input - Coordinate string to parse
 * @returns Parsed coordinates or error message
 */
export function parseCoordinateString(
  input: string,
): { lat: number; lon: number } | { error: string } {
  const trimmed = input.trim();

  if (!trimmed) {
    return { error: "Please enter coordinates" };
  }

  // Try simple decimal format first: "40.7128, -74.0060" or "40.7128 -74.0060"
  const decimalMatch = trimmed.match(
    /^(-?\d+\.?\d*)[°]?\s*[,\s]\s*(-?\d+\.?\d*)[°]?$/,
  );

  if (decimalMatch) {
    const lat = parseFloat(decimalMatch[1]);
    const lon = parseFloat(decimalMatch[2]);
    const error = validateCoordinates(lat, lon);
    if (error) return { error };
    return { lat, lon };
  }

  // Try DMS format: "40°42'46"N 74°0'22"W" or similar
  const dmsMatch = trimmed.match(
    /(\d+)[°]\s*(\d+)?[''′]?\s*(\d+\.?\d*)?["″]?\s*([NSns])\s*[,\s]?\s*(\d+)[°]\s*(\d+)?[''′]?\s*(\d+\.?\d*)?["″]?\s*([EWew])/,
  );

  if (dmsMatch) {
    const latDeg = parseInt(dmsMatch[1], 10);
    const latMin = parseInt(dmsMatch[2] || "0", 10);
    const latSec = parseFloat(dmsMatch[3] || "0");
    const latDir = dmsMatch[4].toUpperCase();

    const lonDeg = parseInt(dmsMatch[5], 10);
    const lonMin = parseInt(dmsMatch[6] || "0", 10);
    const lonSec = parseFloat(dmsMatch[7] || "0");
    const lonDir = dmsMatch[8].toUpperCase();

    let lat = latDeg + latMin / 60 + latSec / 3600;
    let lon = lonDeg + lonMin / 60 + lonSec / 3600;

    if (latDir === "S") lat = -lat;
    if (lonDir === "W") lon = -lon;

    const error = validateCoordinates(lat, lon);
    if (error) return { error };
    return { lat, lon };
  }

  return {
    error:
      'Invalid format. Try "40.7128, -74.0060" or "40°42\'46"N 74°0\'22"W"',
  };
}

/**
 * Format coordinates for display
 */
export function formatCoordinates(
  lat: number,
  lon: number,
  format: "decimal" | "dms" = "decimal",
): string {
  if (format === "decimal") {
    const latDir = lat >= 0 ? "N" : "S";
    const lonDir = lon >= 0 ? "E" : "W";
    return `${Math.abs(lat).toFixed(4)}°${latDir}, ${Math.abs(lon).toFixed(4)}°${lonDir}`;
  }

  // DMS format
  const toDMS = (coord: number) => {
    const abs = Math.abs(coord);
    const deg = Math.floor(abs);
    const minFloat = (abs - deg) * 60;
    const min = Math.floor(minFloat);
    const sec = ((minFloat - min) * 60).toFixed(1);
    return `${deg}°${min}'${sec}"`;
  };

  const latDir = lat >= 0 ? "N" : "S";
  const lonDir = lon >= 0 ? "E" : "W";

  return `${toDMS(lat)}${latDir} ${toDMS(lon)}${lonDir}`;
}
