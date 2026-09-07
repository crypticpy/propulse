/**
 * Licensed/pinned geography for SP-05 grouping.
 *
 * | Dataset | Source | License | Pinned artifact |
 * | --- | --- | --- | --- |
 * | Countries | Natural Earth 110m via world-atlas 2.0.2 | public domain (NE) | `src/lib/data/worldCountries.generated.ts` (2026-02-04) |
 * | US states | US Census Bureau via us-atlas 3.0.1 10m | public domain (Census TIGER) | `src/lib/data/usStates.generated.ts` (2026-02-05) |
 * | CA provinces | Click That Hood Canada GeoJSON (OSM-derived) | public dataset | `src/lib/data/canadaProvinces.generated.ts` regenerate with `node scripts/generate-canada-data.mjs` |
 *
 * Gaps:
 * - Simplified exterior rings only; holes (lakes) and many coastal islands are omitted.
 * - 110m countries miss small territories; a point in a hole/gap falls back to no country.
 * - Region-only / approximate prefix membership cannot create a state or Maidenhead placement.
 * - DXCC entities are not used for boundary membership.
 * - Camera/projection never participates in grouping.
 * - NE 110m coastal simplification leaves holes; synthetic Norway fixtures at
 *   63°N,7°E and 59°N,10°E stay ungrouped rather than being forced into Norway.
 */
export const SPOT_GEOGRAPHY_VERSION = "sp05-ne110-us10m-ca-v1";
