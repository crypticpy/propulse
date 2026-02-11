/**
 * Maidenhead Grid Overlay Utilities
 *
 * Provides data for rendering the Maidenhead Locator System grid on maps.
 * The system divides Earth into 18x18 fields, each 20° longitude × 10° latitude.
 * Field designators use two uppercase letters (e.g., "FN" for northeast US).
 */

export interface MaidenheadField {
  /** Two-letter field designator (e.g., "FN", "JO") */
  label: string;
  /** Western edge longitude in degrees */
  lonStart: number;
  /** Southern edge latitude in degrees */
  latStart: number;
  /** Center longitude in degrees */
  lonCenter: number;
  /** Center latitude in degrees */
  latCenter: number;
}

/**
 * Generate all 324 Maidenhead fields (18 × 18).
 * First character encodes longitude: A = 180°W to R = 160°E (20° steps)
 * Second character encodes latitude: A = 90°S to R = 80°N (10° steps)
 */
let _fieldsCache: MaidenheadField[] | null = null;

export function getMaidenheadFields(): MaidenheadField[] {
  if (_fieldsCache) return _fieldsCache;
  const fields: MaidenheadField[] = [];
  for (let lonIdx = 0; lonIdx < 18; lonIdx++) {
    for (let latIdx = 0; latIdx < 18; latIdx++) {
      const lonChar = String.fromCharCode(65 + lonIdx);
      const latChar = String.fromCharCode(65 + latIdx);
      const lonStart = lonIdx * 20 - 180;
      const latStart = latIdx * 10 - 90;
      fields.push({
        label: lonChar + latChar,
        lonStart,
        latStart,
        lonCenter: lonStart + 10,
        latCenter: latStart + 5,
      });
    }
  }
  _fieldsCache = fields;
  return fields;
}

/** Longitude grid lines: 19 lines from -180° to 180° at 20° intervals */
export const MAIDENHEAD_LON_LINES: number[] = Array.from(
  { length: 19 },
  (_, i) => -180 + i * 20,
);

/** Latitude grid lines: 19 lines from -90° to 90° at 10° intervals */
export const MAIDENHEAD_LAT_LINES: number[] = Array.from(
  { length: 19 },
  (_, i) => -90 + i * 10,
);

// ---------------------------------------------------------------------------
// Grid level selection
// ---------------------------------------------------------------------------

/** Grid precision level based on zoom scale */
export type GridLevel = "field" | "square" | "subsquare";

/**
 * Determine which Maidenhead grid level to render for a given zoom scale.
 * - scale < 1.5  → field   (2-char, 20° × 10°)
 * - scale < 5    → square  (4-char, 2° × 1°)
 * - scale >= 5   → subsquare (6-char, 5' × 2.5')
 */
export function getGridLevelForZoom(scale: number): GridLevel {
  if (scale < 1.5) return "field";
  if (scale < 5) return "square";
  return "subsquare";
}

// ---------------------------------------------------------------------------
// 4-char squares (2° lon × 1° lat)
// ---------------------------------------------------------------------------

/** A Maidenhead square cell — same shape for 4-char and 6-char grids */
export interface MaidenheadSquare {
  /** Grid locator label (4-char or 6-char) */
  label: string;
  /** Western edge longitude in degrees */
  lonStart: number;
  /** Southern edge latitude in degrees */
  latStart: number;
  /** Center longitude in degrees */
  lonCenter: number;
  /** Center latitude in degrees */
  latCenter: number;
}

/** Viewport bounds for culled grid generation */
export interface ViewportBounds {
  lonMin: number;
  lonMax: number;
  latMin: number;
  latMax: number;
}

/**
 * Generate all 4-char Maidenhead squares that overlap the given viewport.
 *
 * Each square is 2° longitude × 1° latitude. Labels follow the standard:
 * - Char 1: field longitude letter (A-R)
 * - Char 2: field latitude letter (A-R)
 * - Char 3: square longitude digit (0-9)
 * - Char 4: square latitude digit (0-9)
 */
export function getMaidenheadSquaresInViewport(
  viewport: ViewportBounds,
): MaidenheadSquare[] {
  const { lonMin, lonMax, latMin, latMax } = viewport;
  const squares: MaidenheadSquare[] = [];

  // Clamp to valid Maidenhead bounds
  const startLon = Math.max(-180, Math.floor(lonMin / 2) * 2);
  const endLon = Math.min(180, Math.ceil(lonMax / 2) * 2);
  const startLat = Math.max(-90, Math.floor(latMin / 1) * 1);
  const endLat = Math.min(90, Math.ceil(latMax / 1) * 1);

  for (let lon = startLon; lon < endLon; lon += 2) {
    for (let lat = startLat; lat < endLat; lat += 1) {
      const fieldLonIdx = Math.floor((lon + 180) / 20);
      const fieldLatIdx = Math.floor((lat + 90) / 10);
      const sqLonIdx = Math.floor(((lon + 180) % 20) / 2);
      const sqLatIdx = Math.floor(((lat + 90) % 10) / 1);

      const label =
        String.fromCharCode(65 + fieldLonIdx) +
        String.fromCharCode(65 + fieldLatIdx) +
        sqLonIdx.toString() +
        sqLatIdx.toString();

      squares.push({
        label,
        lonStart: lon,
        latStart: lat,
        lonCenter: lon + 1,
        latCenter: lat + 0.5,
      });
    }
  }

  return squares;
}

// ---------------------------------------------------------------------------
// 6-char subsquares (5' lon × 2.5' lat = 1/12° × 1/24°)
// ---------------------------------------------------------------------------

/** Longitude step for a subsquare: 5 minutes = 1/12 degree */
const SUBSQUARE_LON_STEP = 1 / 12;
/** Latitude step for a subsquare: 2.5 minutes = 1/24 degree */
const SUBSQUARE_LAT_STEP = 1 / 24;

/**
 * Generate all 6-char Maidenhead subsquares that overlap the given viewport.
 *
 * Each subsquare is 5' longitude × 2.5' latitude. Labels extend the 4-char
 * square with two lowercase letters (a-x):
 * - Char 5: subsquare longitude letter (a-x, 24 per square)
 * - Char 6: subsquare latitude letter (a-x, 24 per square)
 */
export function getMaidenheadSubsquaresInViewport(
  viewport: ViewportBounds,
): MaidenheadSquare[] {
  const { lonMin, lonMax, latMin, latMax } = viewport;
  const subsquares: MaidenheadSquare[] = [];

  // Snap start to subsquare grid boundary
  const startLon = Math.max(
    -180,
    Math.floor(lonMin / SUBSQUARE_LON_STEP) * SUBSQUARE_LON_STEP,
  );
  const endLon = Math.min(
    180,
    Math.ceil(lonMax / SUBSQUARE_LON_STEP) * SUBSQUARE_LON_STEP,
  );
  const startLat = Math.max(
    -90,
    Math.floor(latMin / SUBSQUARE_LAT_STEP) * SUBSQUARE_LAT_STEP,
  );
  const endLat = Math.min(
    90,
    Math.ceil(latMax / SUBSQUARE_LAT_STEP) * SUBSQUARE_LAT_STEP,
  );

  for (
    let lon = startLon;
    lon < endLon - SUBSQUARE_LON_STEP / 2;
    lon += SUBSQUARE_LON_STEP
  ) {
    for (
      let lat = startLat;
      lat < endLat - SUBSQUARE_LAT_STEP / 2;
      lat += SUBSQUARE_LAT_STEP
    ) {
      // Round to avoid floating-point drift
      const rLon = Math.round(lon * 12) / 12;
      const rLat = Math.round(lat * 24) / 24;

      const normLon = rLon + 180;
      const normLat = rLat + 90;

      const fieldLonIdx = Math.floor(normLon / 20);
      const fieldLatIdx = Math.floor(normLat / 10);
      const sqLonIdx = Math.floor((normLon % 20) / 2);
      const sqLatIdx = Math.floor((normLat % 10) / 1);
      const subLonIdx = Math.floor(((normLon % 2) / 2) * 24);
      const subLatIdx = Math.floor(((normLat % 1) / 1) * 24);

      const label =
        String.fromCharCode(65 + fieldLonIdx) +
        String.fromCharCode(65 + fieldLatIdx) +
        sqLonIdx.toString() +
        sqLatIdx.toString() +
        String.fromCharCode(97 + subLonIdx) +
        String.fromCharCode(97 + subLatIdx);

      subsquares.push({
        label,
        lonStart: rLon,
        latStart: rLat,
        lonCenter: rLon + SUBSQUARE_LON_STEP / 2,
        latCenter: rLat + SUBSQUARE_LAT_STEP / 2,
      });
    }
  }

  return subsquares;
}

// ---------------------------------------------------------------------------
// Viewport-culled grid lines for squares and subsquares
// ---------------------------------------------------------------------------

/**
 * Get longitude grid lines at 2° intervals within the given bounds.
 * Lines are generated from the first 2°-aligned value >= lonMin
 * through the last 2°-aligned value <= lonMax.
 */
export function getSquareLonLines(lonMin: number, lonMax: number): number[] {
  const lines: number[] = [];
  const start = Math.ceil(lonMin / 2) * 2;
  const end = Math.floor(lonMax / 2) * 2;
  for (let lon = start; lon <= end; lon += 2) {
    lines.push(lon);
  }
  return lines;
}

/**
 * Get latitude grid lines at 1° intervals within the given bounds.
 */
export function getSquareLatLines(latMin: number, latMax: number): number[] {
  const lines: number[] = [];
  const start = Math.ceil(latMin);
  const end = Math.floor(latMax);
  for (let lat = start; lat <= end; lat += 1) {
    lines.push(lat);
  }
  return lines;
}

/**
 * Get longitude grid lines at 5' (1/12°) intervals within the given bounds.
 */
export function getSubsquareLonLines(lonMin: number, lonMax: number): number[] {
  const lines: number[] = [];
  const step = SUBSQUARE_LON_STEP;
  const start = Math.ceil(lonMin / step) * step;
  const end = Math.floor(lonMax / step) * step;
  for (let lon = start; lon <= end + step / 2; lon += step) {
    // Round to avoid floating-point drift
    const rounded = Math.round(lon * 12) / 12;
    if (rounded > lonMax) break;
    lines.push(rounded);
  }
  return lines;
}

/**
 * Get latitude grid lines at 2.5' (1/24°) intervals within the given bounds.
 */
export function getSubsquareLatLines(latMin: number, latMax: number): number[] {
  const lines: number[] = [];
  const step = SUBSQUARE_LAT_STEP;
  const start = Math.ceil(latMin / step) * step;
  const end = Math.floor(latMax / step) * step;
  for (let lat = start; lat <= end + step / 2; lat += step) {
    // Round to avoid floating-point drift
    const rounded = Math.round(lat * 24) / 24;
    if (rounded > latMax) break;
    lines.push(rounded);
  }
  return lines;
}
