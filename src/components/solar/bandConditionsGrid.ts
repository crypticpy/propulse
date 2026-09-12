/**
 * Shared grid tracks for the BandConditions column header and BandRow rows.
 * From sm upward, the first track is 4rem so a BandPill at size="md" fits "160m" (rule +
 * padding) at the largest Settings → Text Size (`data-text-scale="xl"`).
 * Narrow screens give the band and Best For full rows, leaving room for
 * full condition words at the largest text scale.
 */
export const BAND_CONDITIONS_GRID_TEMPLATE =
  "grid-cols-2 sm:grid-cols-[4rem_repeat(3,minmax(0,1fr))] md:grid-cols-[4rem_80px_90px_90px_1fr] lg:grid-cols-[4rem_80px_90px_90px_70px_1fr]";
