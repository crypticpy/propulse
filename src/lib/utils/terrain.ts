/**
 * Terrain Classification Module
 *
 * Simplified land-water classification using bounding boxes for major
 * landmasses and islands. Used to compute terrain-dependent ground
 * reflection losses in the multi-hop ray trace model.
 *
 * Sea bounce: ~1 dB loss (smooth reflector)
 * Land bounce: ~3 dB loss (rough surface scatter)
 * Coastal: ~2 dB loss (intermediate)
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TerrainType = "sea" | "land" | "coastal";

interface BoundingBox {
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
}

// ---------------------------------------------------------------------------
// Landmass bounding boxes (simplified continental outlines)
// ---------------------------------------------------------------------------

const LANDMASS_BOXES: BoundingBox[] = [
  // North America
  { minLat: 25, maxLat: 50, minLon: -130, maxLon: -60 },
  { minLat: 50, maxLat: 72, minLon: -145, maxLon: -55 },
  { minLat: 15, maxLat: 25, minLon: -118, maxLon: -85 },
  { minLat: 60, maxLat: 72, minLon: -170, maxLon: -145 }, // Alaska

  // Central America
  { minLat: 7, maxLat: 18, minLon: -92, maxLon: -77 },

  // South America
  { minLat: -5, maxLat: 12, minLon: -82, maxLon: -34 },
  { minLat: -25, maxLat: -5, minLon: -75, maxLon: -35 },
  { minLat: -56, maxLat: -25, minLon: -76, maxLon: -48 },

  // Europe
  { minLat: 36, maxLat: 60, minLon: -10, maxLon: 40 },
  { minLat: 56, maxLat: 71, minLon: 5, maxLon: 32 }, // Scandinavia
  { minLat: 35, maxLat: 42, minLon: -10, maxLon: 3 }, // Iberia

  // Africa
  { minLat: 18, maxLat: 37, minLon: -17, maxLon: 40 },
  { minLat: -5, maxLat: 18, minLon: -18, maxLon: 52 },
  { minLat: -35, maxLat: -5, minLon: 10, maxLon: 52 },

  // Asia
  { minLat: 40, maxLat: 55, minLon: 40, maxLon: 140 },
  { minLat: 55, maxLat: 75, minLon: 40, maxLon: 180 }, // Siberia
  { minLat: 20, maxLat: 45, minLon: 60, maxLon: 135 },
  { minLat: 5, maxLat: 20, minLon: 68, maxLon: 92 }, // India
  { minLat: 25, maxLat: 42, minLon: 25, maxLon: 60 }, // Middle East
  { minLat: 12, maxLat: 25, minLon: 42, maxLon: 55 }, // Arabia

  // Australia/Oceania
  { minLat: -45, maxLat: -10, minLon: 113, maxLon: 155 },
  { minLat: -8, maxLat: -1, minLon: 130, maxLon: 150 }, // Papua

  // Antarctica
  { minLat: -90, maxLat: -60, minLon: -180, maxLon: 180 },

  // Major islands
  { minLat: 60, maxLat: 84, minLon: -73, maxLon: -12 }, // Greenland
  { minLat: 50, maxLat: 59, minLon: -11, maxLon: 2 }, // UK/Ireland
  { minLat: 30, maxLat: 46, minLon: 128, maxLon: 146 }, // Japan
  { minLat: -26, maxLat: -12, minLon: 43, maxLon: 50 }, // Madagascar
  { minLat: -47, maxLat: -34, minLon: 166, maxLon: 179 }, // New Zealand
  { minLat: -8, maxLat: 6, minLon: 95, maxLon: 141 }, // Indonesia
  { minLat: 5, maxLat: 20, minLon: 117, maxLon: 127 }, // Philippines
  { minLat: 6, maxLat: 10, minLon: 79, maxLon: 82 }, // Sri Lanka
  { minLat: 22, maxLat: 26, minLon: 120, maxLon: 122 }, // Taiwan
  { minLat: 63, maxLat: 67, minLon: -25, maxLon: -13 }, // Iceland
];

/** Margin in degrees for coastal classification */
const COASTAL_MARGIN_DEG = 1.0;

// ---------------------------------------------------------------------------
// Classification logic
// ---------------------------------------------------------------------------

function isInsideLandmass(lat: number, lon: number): boolean {
  for (const box of LANDMASS_BOXES) {
    if (
      lat >= box.minLat &&
      lat <= box.maxLat &&
      lon >= box.minLon &&
      lon <= box.maxLon
    ) {
      return true;
    }
  }
  return false;
}

function isNearLandmassEdge(lat: number, lon: number): boolean {
  for (const box of LANDMASS_BOXES) {
    // Check if inside expanded box
    const inExpanded =
      lat >= box.minLat - COASTAL_MARGIN_DEG &&
      lat <= box.maxLat + COASTAL_MARGIN_DEG &&
      lon >= box.minLon - COASTAL_MARGIN_DEG &&
      lon <= box.maxLon + COASTAL_MARGIN_DEG;
    if (!inExpanded) continue;

    // Check if inside shrunken box (deep interior)
    const inShrunk =
      lat >= box.minLat + COASTAL_MARGIN_DEG &&
      lat <= box.maxLat - COASTAL_MARGIN_DEG &&
      lon >= box.minLon + COASTAL_MARGIN_DEG &&
      lon <= box.maxLon - COASTAL_MARGIN_DEG;
    if (!inShrunk) return true;
  }
  return false;
}

/**
 * Classify a geographic point as sea, land, or coastal.
 */
export function classifyTerrain(lat: number, lon: number): TerrainType {
  const inside = isInsideLandmass(lat, lon);
  const edge = isNearLandmassEdge(lat, lon);
  if (inside) return edge ? "coastal" : "land";
  return edge ? "coastal" : "sea";
}

/**
 * Classify terrain at each ground bounce point along a path.
 */
export function classifyPathTerrain(
  points: Array<{ lat: number; lon: number }>,
): TerrainType[] {
  return points.map((p) => classifyTerrain(p.lat, p.lon));
}

// ---------------------------------------------------------------------------
// Loss calculations
// ---------------------------------------------------------------------------

const TERRAIN_LOSS_DB: Record<TerrainType, number> = {
  sea: 1,
  land: 3,
  coastal: 2,
};

/**
 * Get ground reflection loss for a single bounce.
 */
export function getGroundReflectionLoss(
  terrain: TerrainType,
  _frequencyMHz: number,
): number {
  return TERRAIN_LOSS_DB[terrain];
}

/**
 * Sum ground reflection losses for all bounce points.
 */
export function getPathTerrainLoss(
  terrainTypes: TerrainType[],
  frequencyMHz: number,
): number {
  return terrainTypes.reduce(
    (sum, t) => sum + getGroundReflectionLoss(t, frequencyMHz),
    0,
  );
}

// ---------------------------------------------------------------------------
// Display helpers
// ---------------------------------------------------------------------------

export function getTerrainIcon(terrain: TerrainType): string {
  switch (terrain) {
    case "sea":
      return "\u{1F30A}";
    case "land":
      return "\u{1F332}";
    case "coastal":
      return "\u{1F3D6}\uFE0F";
  }
}

export function getTerrainLabel(terrain: TerrainType): string {
  switch (terrain) {
    case "sea":
      return "Sea";
    case "land":
      return "Land";
    case "coastal":
      return "Coastal";
  }
}
