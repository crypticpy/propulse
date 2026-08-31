/**
 * Station-centered coverage presets for the live map ticker.
 *
 * Solar indices, space-weather alerts, and DX spot activity remain global.
 * These radii only decide which weather alerts and lightning strikes are
 * relevant enough to interrupt the ticker for the operator's current QTH.
 */
export type TickerCoverageArea = "nearby" | "regional" | "wide";

export interface TickerCoveragePreset {
  label: string;
  description: string;
  lightningKm: number;
  weatherKm: number;
}

export const TICKER_COVERAGE_PRESETS: Record<
  TickerCoverageArea,
  TickerCoveragePreset
> = {
  nearby: {
    label: "Nearby",
    description: "Local operating area",
    lightningKm: 150,
    weatherKm: 300,
  },
  regional: {
    label: "Regional",
    description: "Balanced default coverage",
    lightningKm: 500,
    weatherKm: 800,
  },
  wide: {
    label: "Wide",
    description: "Broad situational awareness",
    lightningKm: 1_200,
    weatherKm: 1_600,
  },
};

/** Return a safe preset even if older persisted settings contain bad data. */
export function getTickerCoveragePreset(
  area: TickerCoverageArea | null | undefined,
): TickerCoveragePreset {
  return area && area in TICKER_COVERAGE_PRESETS
    ? TICKER_COVERAGE_PRESETS[area]
    : TICKER_COVERAGE_PRESETS.regional;
}
