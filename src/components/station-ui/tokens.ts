/**
 * The station palette now lives in `@/lib/themes/stationTokens` so the app
 * theme layer can emit the same `--su-*` variables on the document root
 * without importing from a component folder. This module stays the public
 * entry point for station-ui consumers.
 */

export {
  stationPalettes,
  stationContrast,
  stationTokens,
  type StationTokenStyle,
} from "@/lib/themes/stationTokens";

export type StationTextSize = "standard" | "large" | "extra-large";
export type StationDensity = "comfortable" | "compact";
export type { StationTone } from "@/lib/themes/treatments";
