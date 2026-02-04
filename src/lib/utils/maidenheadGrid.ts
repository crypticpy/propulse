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
export function getMaidenheadFields(): MaidenheadField[] {
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
