/**
 * Approximate-only country anchors for ISO codes that Natural Earth 110m omits.
 * Prefix-catalog centroids stay approximate; they are never reported points,
 * states, or Maidenhead cells.
 */
export interface AtlasGapCountry {
  name: string;
  anchor: { lat: number; lon: number };
  provenance: "atlas-gap-prefix";
  reason: string;
}

export const ATLAS_GAP_COUNTRIES: Record<string, AtlasGapCountry> = {
  SG: {
    name: "Singapore",
    anchor: { lat: 1.3, lon: 103.8 },
    provenance: "atlas-gap-prefix",
    reason: "Natural Earth 110m omits Singapore; 9V prefix-catalog centroid",
  },
  GU: {
    name: "Guam",
    anchor: { lat: 13.4, lon: 144.8 },
    provenance: "atlas-gap-prefix",
    reason: "Natural Earth 110m omits Guam; KH2 prefix-catalog centroid",
  },
  VI: {
    name: "US Virgin Islands",
    anchor: { lat: 18.3, lon: -64.9 },
    provenance: "atlas-gap-prefix",
    reason: "Natural Earth 110m omits the US Virgin Islands; KP2 prefix-catalog centroid",
  },
};
