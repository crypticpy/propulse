import { maidenheadSchema } from "@/lib/views/spotContracts";

export function wrapLongitude(lon: number): number {
  let wrapped = lon;
  while (wrapped > 180) wrapped -= 360;
  while (wrapped < -180) wrapped += 360;
  return wrapped;
}

export function maidenheadFromCoordinates(
  lat: number,
  lon: number,
  length: 2 | 4 | 6,
): string | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90) return null;
  const wrapped = wrapLongitude(lon);
  const lonAdj = wrapped + 180;
  const latAdj = lat + 90;
  const fieldLon = Math.min(17, Math.floor(lonAdj / 20));
  const fieldLat = Math.min(17, Math.floor(latAdj / 10));
  let grid = String.fromCharCode(65 + fieldLon) + String.fromCharCode(65 + fieldLat);
  if (length === 2) return maidenheadSchema.parse(grid);
  const squareLon = Math.min(9, Math.floor((lonAdj % 20) / 2));
  const squareLat = Math.min(9, Math.floor(latAdj % 10));
  grid += String(squareLon) + String(squareLat);
  if (length === 4) return maidenheadSchema.parse(grid);
  const subLon = Math.min(23, Math.floor(((lonAdj % 20) % 2) / (2 / 24)));
  const subLat = Math.min(23, Math.floor((latAdj % 10 % 1) / (1 / 24)));
  grid += String.fromCharCode(65 + subLon) + String.fromCharCode(65 + subLat);
  return maidenheadSchema.parse(grid);
}

export function maidenheadPrefix(grid: string, length: 2 | 4 | 6): string | null {
  const parsed = maidenheadSchema.safeParse(grid);
  if (!parsed.success || parsed.data.length < length) return null;
  return parsed.data.slice(0, length);
}

/** Stable cell-center anchor. Not a live member centroid. */
export function maidenheadCenter(grid: string): { lat: number; lon: number } | null {
  const parsed = maidenheadSchema.safeParse(grid);
  if (!parsed.success) return null;
  const normalized = parsed.data;
  let west = -180;
  let south = -90;
  let lonSpan = 360;
  let latSpan = 180;
  west += (normalized.charCodeAt(0) - 65) * 20;
  south += (normalized.charCodeAt(1) - 65) * 10;
  lonSpan = 20;
  latSpan = 10;
  if (normalized.length >= 4) {
    west += Number(normalized[2]) * 2;
    south += Number(normalized[3]);
    lonSpan = 2;
    latSpan = 1;
  }
  if (normalized.length >= 6) {
    west += (normalized.charCodeAt(4) - 65) * (2 / 24);
    south += (normalized.charCodeAt(5) - 65) * (1 / 24);
    lonSpan = 2 / 24;
    latSpan = 1 / 24;
  }
  return {
    lat: Math.round((south + latSpan / 2) * 10000) / 10000,
    lon: wrapLongitude(Math.round((west + lonSpan / 2) * 10000) / 10000),
  };
}
