/**
 * Frozen reference surface for model forecast snapshots (#296).
 *
 * A fixed set of 11 "hub" grid squares spanning every continent. The model
 * snapshot job asks the Railway inference service for a prediction on every
 * directed pair of hubs (origin != target) so the eval harness always scores
 * the model against the exact same 110-path surface, hour over hour.
 *
 * Frozen on purpose: changing REFERENCE_SURFACE_ID, the hub list, or the
 * path order changes what every future snapshot means. Bump the id (e.g.
 * "hubs11-v2") instead of editing the hubs in place.
 */

export const REFERENCE_SURFACE_ID = "hubs11-v1";

export interface ReferenceHub {
  grid4: string;
  continent: string;
}

/**
 * 11 hub grids, one per major ham continent bucket (EU gets three — it
 * carries the most HF traffic). Order is deterministic and part of the
 * surface contract: referencePaths() iterates in this order.
 */
export const REFERENCE_HUBS: readonly ReferenceHub[] = Object.freeze([
  Object.freeze({ grid4: "FN31", continent: "NA" }),
  Object.freeze({ grid4: "EM12", continent: "NA" }),
  Object.freeze({ grid4: "CN87", continent: "NA" }),
  Object.freeze({ grid4: "GG66", continent: "SA" }),
  Object.freeze({ grid4: "JO21", continent: "EU" }),
  Object.freeze({ grid4: "JN58", continent: "EU" }),
  Object.freeze({ grid4: "KO85", continent: "EU" }),
  Object.freeze({ grid4: "JF96", continent: "AF" }),
  Object.freeze({ grid4: "MK82", continent: "AS" }),
  Object.freeze({ grid4: "PM95", continent: "AS" }),
  Object.freeze({ grid4: "QF56", continent: "OC" }),
]);

const CONTINENT_BY_GRID: ReadonlyMap<string, string> = new Map(
  REFERENCE_HUBS.map((hub) => [hub.grid4, hub.continent]),
);

/** Continent tag for a reference hub grid4. Throws on an unknown grid. */
export function continentOf(grid4: string): string {
  const continent = CONTINENT_BY_GRID.get(grid4);
  if (!continent) throw new Error(`Unknown reference hub grid: ${grid4}`);
  return continent;
}

export interface ReferencePath {
  origin_grid4: string;
  target_grid4: string;
}

/**
 * All 11×10 = 110 directed ordered pairs over the hub list, origin != target.
 * Deterministic order (outer loop origin, inner loop target, both in
 * REFERENCE_HUBS order) so repeated calls and repeated ticks build the same
 * request body.
 */
export function referencePaths(): ReferencePath[] {
  const paths: ReferencePath[] = [];
  for (const origin of REFERENCE_HUBS) {
    for (const target of REFERENCE_HUBS) {
      if (origin.grid4 === target.grid4) continue;
      paths.push({ origin_grid4: origin.grid4, target_grid4: target.grid4 });
    }
  }
  return paths;
}

/**
 * HF bands the model's band one-hot supports — mirrors
 * src/lib/propagation/coreFeatureBuilder.ts HF_MODEL_BANDS (read-only
 * confirmed 2026-09-06; the collector package cannot import across the
 * src/ boundary, so this list is kept in sync by hand). No 6m: the model
 * has no VHF one-hot, same reason forecastSnapshot.ts's SNAPSHOT_BANDS
 * excludes it.
 */
export const REFERENCE_BANDS = [
  "160m",
  "80m",
  "60m",
  "40m",
  "30m",
  "20m",
  "17m",
  "15m",
  "12m",
  "10m",
] as const;

export type ReferenceBand = (typeof REFERENCE_BANDS)[number];
