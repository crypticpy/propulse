/**
 * Shared grid tracks for the BandConditions column header and BandRow rows.
 * The first track is 4rem so a BandPill at size="md" fits "160m" (rule +
 * padding) at the largest Settings → Text Size (`data-text-scale="xl"`).
 */
export const BAND_CONDITIONS_GRID_TEMPLATE =
  "grid-cols-[4rem_1fr_1fr_1fr] md:grid-cols-[4rem_80px_90px_90px_1fr] lg:grid-cols-[4rem_80px_90px_90px_70px_1fr]";
