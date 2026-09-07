/**
 * Licensed/pinned geography for SP-05 grouping.
 *
 * | Dataset | Source | License | Pinned artifact |
 * | --- | --- | --- | --- |
 * | Countries | Natural Earth 110m via world-atlas 2.0.2 | public domain (NE) | `src/lib/data/worldCountries.generated.ts` (2026-02-04) |
 * | US states | US Census Bureau via us-atlas 3.0.1 10m | public domain (Census TIGER) | `src/lib/data/usStates.generated.ts` (2026-02-05) |
 * | CA provinces | Click That Hood Canada GeoJSON commit `fb1c363b3624a256d42f00788fca96d9faf43a45` | MIT (Code for America); OSM-derived ODbL | `src/lib/data/canadaProvinces.generated.ts` regenerate with `node scripts/generate-canada-data.mjs` |
 *
 * Gaps:
 * - Canadian rings use Ramer–Douglas–Peucker (not every-Nth-vertex) plus a 0.03° outward
 *   coast buffer so harbor cities remain inside the source's ~2 km generalized shoreline.
 * - Interior rings are preserved when the source has holes; this pin currently has none.
 * - 110m countries miss small territories (SG/GU/VI). Approximate reports still form
 *   country groups from prefix-catalog centroids with `atlas-gap-prefix` provenance.
 *   Those centroids are never reported points, states, or Maidenhead cells.
 * - Region-only / approximate prefix membership cannot create a state or Maidenhead placement.
 * - DXCC entities are not used for boundary membership.
 * - Camera/projection never participates in grouping.
 * - NE 110m coastal simplification leaves holes; synthetic Norway fixtures at
 *   63°N,7°E and 59°N,10°E stay ungrouped rather than being forced into Norway.
 *
 * Bump this label whenever boundary geometry or atlas-gap anchors change.
 */
export const SPOT_GEOGRAPHY_VERSION = "sp05-ne110-us10m-ca-v2";
export const CANADA_SOURCE_COMMIT = "fb1c363b3624a256d42f00788fca96d9faf43a45";
