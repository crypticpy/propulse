/**
 * Maidenhead grid square conversion utilities
 * Converts between lat/lon coordinates and Maidenhead grid locators
 *
 * Grid format: 2 letters + 2 digits + optional 2 letters (e.g., EM10, EM10fp)
 * - Field (AA-RR): 20 x 10 degrees
 * - Square (00-99): 2 x 1 degrees
 * - Subsquare (aa-xx): 5' x 2.5' (minutes)
 */

/**
 * Convert Maidenhead grid square to latitude/longitude
 * Returns the center point of the grid square
 *
 * @param grid - Maidenhead grid locator (4 or 6 characters)
 * @returns Object with lat and lon in decimal degrees
 * @throws Error if grid format is invalid
 *
 * @example
 * ```ts
 * gridToLatLon('EM10fp')  // { lat: 30.0625, lon: -97.9167 }
 * gridToLatLon('EM10')    // { lat: 30.5, lon: -98 }
 * ```
 */
export function gridToLatLon(grid: string): { lat: number; lon: number } {
  const normalized = grid.toUpperCase();

  // Validate grid format (4 or 6 characters)
  if (!/^[A-R]{2}[0-9]{2}([A-X]{2})?$/i.test(grid)) {
    throw new Error(
      `Invalid grid square format: ${grid}. Expected format: AA00 or AA00aa (e.g., EM10 or EM10fp)`,
    );
  }

  // Field (first 2 letters): A-R maps to 0-17
  // Each field is 20 degrees longitude, 10 degrees latitude
  const fieldLon = (normalized.charCodeAt(0) - 65) * 20 - 180;
  const fieldLat = (normalized.charCodeAt(1) - 65) * 10 - 90;

  // Square (2 digits): 0-9
  // Each square is 2 degrees longitude, 1 degree latitude
  const squareLon = parseInt(normalized[2], 10) * 2;
  const squareLat = parseInt(normalized[3], 10) * 1;

  let lon = fieldLon + squareLon;
  let lat = fieldLat + squareLat;

  if (normalized.length === 6) {
    // Subsquare (last 2 letters): A-X maps to 0-23
    // Each subsquare is 5 minutes (1/12 degree) longitude, 2.5 minutes (1/24 degree) latitude
    const subLon = (normalized.charCodeAt(4) - 65) * (2 / 24);
    const subLat = (normalized.charCodeAt(5) - 65) * (1 / 24);

    lon += subLon + 1 / 24; // Add half subsquare for center
    lat += subLat + 1 / 48; // Add half subsquare for center
  } else {
    // For 4-character grid, return center of square
    lon += 1; // Half of 2 degrees
    lat += 0.5; // Half of 1 degree
  }

  return {
    lat: Math.round(lat * 10000) / 10000,
    lon: Math.round(lon * 10000) / 10000,
  };
}

/**
 * Convert latitude/longitude to Maidenhead grid square
 *
 * @param lat - Latitude in decimal degrees (-90 to 90)
 * @param lon - Longitude in decimal degrees (-180 to 180)
 * @param precision - Grid precision: 4 for field+square (AA00), 6 for subsquare (AA00aa), 8 for extended
 * @returns Maidenhead grid locator string
 * @throws Error if coordinates are out of range
 *
 * @example
 * ```ts
 * latLonToGrid(30.0625, -97.9167)     // 'EM10fp'
 * latLonToGrid(30.0625, -97.9167, 4)  // 'EM10'
 * ```
 */
export function latLonToGrid(
  lat: number,
  lon: number,
  precision: number = 6,
): string {
  // Validate coordinates
  if (lat < -90 || lat > 90) {
    throw new Error(`Latitude must be between -90 and 90: ${lat}`);
  }
  if (lon < -180 || lon > 180) {
    throw new Error(`Longitude must be between -180 and 180: ${lon}`);
  }

  // Normalize longitude to 0-360 range for calculation
  let adjustedLon = lon + 180;
  let adjustedLat = lat + 90;

  const grid: string[] = [];

  // Field (first 2 letters)
  const fieldLon = Math.floor(adjustedLon / 20);
  const fieldLat = Math.floor(adjustedLat / 10);
  grid.push(String.fromCharCode(65 + fieldLon));
  grid.push(String.fromCharCode(65 + fieldLat));

  // Square (2 digits)
  const squareLon = Math.floor((adjustedLon % 20) / 2);
  const squareLat = Math.floor((adjustedLat % 10) / 1);
  grid.push(squareLon.toString());
  grid.push(squareLat.toString());

  if (precision >= 6) {
    // Subsquare (lowercase letters)
    const remainderLon = adjustedLon % 2;
    const remainderLat = adjustedLat % 1;
    const subLon = Math.floor(remainderLon * 12);
    const subLat = Math.floor(remainderLat * 24);
    grid.push(String.fromCharCode(97 + Math.min(subLon, 23)));
    grid.push(String.fromCharCode(97 + Math.min(subLat, 23)));
  }

  if (precision >= 8) {
    // Extended subsquare (digits)
    const remainderLon = (adjustedLon * 12) % 1;
    const remainderLat = (adjustedLat * 24) % 1;
    const extLon = Math.floor(remainderLon * 10);
    const extLat = Math.floor(remainderLat * 10);
    grid.push(extLon.toString());
    grid.push(extLat.toString());
  }

  return grid.join("");
}

/**
 * Validate a Maidenhead grid square string
 *
 * @param grid - Grid string to validate
 * @returns True if valid grid format (4, 6, or 8 characters)
 *
 * @example
 * ```ts
 * isValidGrid('EM10')    // true
 * isValidGrid('EM10fp')  // true
 * isValidGrid('ZZ99')    // false (Z is out of range)
 * isValidGrid('EM1')     // false (too short)
 * ```
 */
export function isValidGrid(grid: string): boolean {
  // 4-character: AA00 (field + square)
  // 6-character: AA00aa (field + square + subsquare)
  // 8-character: AA00aa00 (extended)
  return /^[A-Ra-r]{2}[0-9]{2}([A-Xa-x]{2}([0-9]{2})?)?$/.test(grid);
}

/**
 * Calculate distance between two grid squares using Haversine formula
 *
 * @param grid1 - First grid square
 * @param grid2 - Second grid square
 * @returns Distance in kilometers
 *
 * @example
 * ```ts
 * gridDistance('EM10', 'FN31')  // ~2500 km
 * ```
 */
export function gridDistance(grid1: string, grid2: string): number {
  const pos1 = gridToLatLon(grid1);
  const pos2 = gridToLatLon(grid2);

  const R = 6371; // Earth's radius in km
  const dLat = toRad(pos2.lat - pos1.lat);
  const dLon = toRad(pos2.lon - pos1.lon);
  const lat1 = toRad(pos1.lat);
  const lat2 = toRad(pos2.lat);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLon / 2) * Math.sin(dLon / 2) * Math.cos(lat1) * Math.cos(lat2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return Math.round(R * c);
}

/**
 * Calculate bearing from one grid to another
 *
 * @param fromGrid - Starting grid square
 * @param toGrid - Destination grid square
 * @returns Bearing in degrees (0-360, 0 = North)
 */
export function gridBearing(fromGrid: string, toGrid: string): number {
  const pos1 = gridToLatLon(fromGrid);
  const pos2 = gridToLatLon(toGrid);

  const lat1 = toRad(pos1.lat);
  const lat2 = toRad(pos2.lat);
  const dLon = toRad(pos2.lon - pos1.lon);

  const y = Math.sin(dLon) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);

  let bearing = Math.atan2(y, x) * (180 / Math.PI);
  bearing = (bearing + 360) % 360;

  return Math.round(bearing);
}

/**
 * Convert degrees to radians
 */
function toRad(deg: number): number {
  return deg * (Math.PI / 180);
}
