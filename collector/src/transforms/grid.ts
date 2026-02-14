/**
 * Maidenhead grid square utilities (copied from src/lib/utils/grid.ts)
 */

export function gridToLatLon(grid: string): { lat: number; lon: number } {
  if (!grid || typeof grid !== "string") {
    throw new Error("Grid square must be a non-empty string");
  }
  const normalized = grid.toUpperCase();

  if (!/^[A-R]{2}[0-9]{2}([A-X]{2})?$/i.test(grid)) {
    throw new Error(`Invalid grid square format: ${grid}`);
  }

  const fieldLon = (normalized.charCodeAt(0) - 65) * 20 - 180;
  const fieldLat = (normalized.charCodeAt(1) - 65) * 10 - 90;
  const squareLon = parseInt(normalized[2], 10) * 2;
  const squareLat = parseInt(normalized[3], 10) * 1;

  let lon = fieldLon + squareLon;
  let lat = fieldLat + squareLat;

  if (normalized.length === 6) {
    const subLon = (normalized.charCodeAt(4) - 65) * (2 / 24);
    const subLat = (normalized.charCodeAt(5) - 65) * (1 / 24);
    lon += subLon + 1 / 24;
    lat += subLat + 1 / 48;
  } else {
    lon += 1;
    lat += 0.5;
  }

  return {
    lat: Math.round(lat * 10000) / 10000,
    lon: Math.round(lon * 10000) / 10000,
  };
}

export function isValidGrid(grid: string): boolean {
  return /^[A-Ra-r]{2}[0-9]{2}([A-Xa-x]{2})?$/.test(grid);
}
