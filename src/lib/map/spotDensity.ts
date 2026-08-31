/**
 * Spot density levels.
 *
 * How much live-spot activity the map draws. Until now every source was
 * hardcoded to 50 spots, which is thin on a quiet band and unreadable during a
 * contest -- the right amount is a matter of what the operator is doing, so it
 * belongs to them.
 *
 * The limit applies *per source* (PSKReporter, RBN, WSJT-X), because that is
 * the granularity the fetchers and the edge routes work in. The edge handlers
 * clamp `limit` to 200 (`api/_lib/handlers/spots.ts`), so `max` sits exactly at
 * that ceiling rather than asking for more than the server will ever return.
 */

export type SpotDensity = "low" | "medium" | "high" | "max";

export const DEFAULT_SPOT_DENSITY: SpotDensity = "medium";

interface SpotDensitySpec {
  /** Spots requested from each source. */
  perSource: number;
  /** Control label. */
  label: string;
  /** One-line explanation for the control's tooltip. */
  description: string;
}

export const SPOT_DENSITY_SPECS: Record<SpotDensity, SpotDensitySpec> = {
  low: {
    perSource: 25,
    label: "Low",
    description: "25 spots per source — keeps the map readable on busy bands.",
  },
  medium: {
    perSource: 50,
    label: "Medium",
    description: "50 spots per source — the long-standing default.",
  },
  high: {
    perSource: 100,
    label: "High",
    description: "100 spots per source — more activity, busier map.",
  },
  max: {
    perSource: 200,
    label: "Max",
    description:
      "200 spots per source — everything the spot API will return. Heaviest to render.",
  },
};

/** Density levels in ascending order, for rendering the control. */
export const SPOT_DENSITY_ORDER: readonly SpotDensity[] = [
  "low",
  "medium",
  "high",
  "max",
];

/**
 * Spots to request from each source at this density.
 *
 * Tolerates an unknown/missing value so a stale persisted preference degrades
 * to the default instead of requesting `undefined` spots.
 */
export function getSpotFetchLimit(density: SpotDensity | undefined): number {
  return (
    SPOT_DENSITY_SPECS[density as SpotDensity] ??
    SPOT_DENSITY_SPECS[DEFAULT_SPOT_DENSITY]
  ).perSource;
}
