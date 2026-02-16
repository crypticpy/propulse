// ---------------------------------------------------------------------------
// eqTypes — Unified EQ band type definitions for parametric equalizer system
// ---------------------------------------------------------------------------

// -- Types ------------------------------------------------------------------

/** Filter type names — maps to Web Audio BiquadFilterNode.type */
export type EqFilterType =
  | "bell"
  | "notch"
  | "lowshelf"
  | "highshelf"
  | "lowpass"
  | "highpass";

/** Category determines default behaviors, color coding, and sidebar grouping */
export type EqBandCategory = "notch" | "eq";

/** Unified EQ band configuration — subsumes the old NotchFilterConfig */
export interface EqBand {
  id: string;
  freqHz: number; // 20–20 000 Hz (audio domain frequency)
  q: number; // 0.1–50
  gainDb: number; // -24 to +24 dB (ignored for notch/lowpass/highpass)
  filterType: EqFilterType;
  category: EqBandCategory;
  enabled: boolean;
}

// -- Constants --------------------------------------------------------------

/** Maximum number of EQ bands (pooled across both categories) */
export const MAX_EQ_BANDS = 16;

/** Maps EqFilterType to Web Audio BiquadFilterNode.type string */
export const EQ_FILTER_TO_BIQUAD: Record<EqFilterType, BiquadFilterType> = {
  bell: "peaking",
  notch: "notch",
  lowshelf: "lowshelf",
  highshelf: "highshelf",
  lowpass: "lowpass",
  highpass: "highpass",
};

/** All available filter types for UI display */
export const EQ_FILTER_TYPES: EqFilterType[] = [
  "bell",
  "notch",
  "lowshelf",
  "highshelf",
  "lowpass",
  "highpass",
];

/** Human-readable labels for each filter type */
export const EQ_FILTER_LABELS: Record<EqFilterType, string> = {
  bell: "Bell",
  notch: "Notch",
  lowshelf: "Low Shelf",
  highshelf: "High Shelf",
  lowpass: "Low Pass",
  highpass: "High Pass",
};

// -- Helpers ----------------------------------------------------------------

/** Whether this filter type uses the gainDb parameter */
export function filterTypeUsesGain(type: EqFilterType): boolean {
  return type === "bell" || type === "lowshelf" || type === "highshelf";
}

/** Create a default EqBand for a given category */
export function createDefaultBand(
  category: EqBandCategory,
  freqHz = 1000,
  gainDb = 0,
): EqBand {
  return {
    id: crypto.randomUUID?.() ?? `eq-${Date.now()}`,
    freqHz,
    q: category === "notch" ? 10 : 1.41, // Narrow Q for notch, Butterworth for EQ
    gainDb: category === "notch" ? 0 : gainDb,
    filterType: category === "notch" ? "notch" : "bell",
    category,
    enabled: true,
  };
}
