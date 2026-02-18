/**
 * FT8/FT4 band frequency presets.
 *
 * Standard dial frequencies for FT8 and FT4 on all HF amateur bands.
 * These are the VFO frequencies — FT8 signals span 0-3000 Hz above the dial.
 */

export interface Ft8BandPreset {
  /** Band label, e.g. "20m" */
  band: string;
  /** VFO dial frequency in Hz */
  dialFreqHz: number;
  /** Digital mode */
  mode: "FT8" | "FT4";
  /** Human-readable label, e.g. "20m FT8" */
  label: string;
  /** Lower audio passband bound in Hz */
  audioRangeLow: number;
  /** Upper audio passband bound in Hz */
  audioRangeHigh: number;
}

export const FT8_BAND_PRESETS: Ft8BandPreset[] = [
  // FT8 frequencies (ITU Region 1/2/3 standard dial frequencies)
  {
    band: "160m",
    dialFreqHz: 1840000,
    mode: "FT8",
    label: "160m FT8",
    audioRangeLow: 200,
    audioRangeHigh: 3000,
  },
  {
    band: "80m",
    dialFreqHz: 3573000,
    mode: "FT8",
    label: "80m FT8",
    audioRangeLow: 200,
    audioRangeHigh: 3000,
  },
  {
    band: "60m",
    dialFreqHz: 5357000,
    mode: "FT8",
    label: "60m FT8",
    audioRangeLow: 200,
    audioRangeHigh: 3000,
  },
  {
    band: "40m",
    dialFreqHz: 7074000,
    mode: "FT8",
    label: "40m FT8",
    audioRangeLow: 200,
    audioRangeHigh: 3000,
  },
  {
    band: "30m",
    dialFreqHz: 10136000,
    mode: "FT8",
    label: "30m FT8",
    audioRangeLow: 200,
    audioRangeHigh: 3000,
  },
  {
    band: "20m",
    dialFreqHz: 14074000,
    mode: "FT8",
    label: "20m FT8",
    audioRangeLow: 200,
    audioRangeHigh: 3000,
  },
  {
    band: "17m",
    dialFreqHz: 18100000,
    mode: "FT8",
    label: "17m FT8",
    audioRangeLow: 200,
    audioRangeHigh: 3000,
  },
  {
    band: "15m",
    dialFreqHz: 21074000,
    mode: "FT8",
    label: "15m FT8",
    audioRangeLow: 200,
    audioRangeHigh: 3000,
  },
  {
    band: "12m",
    dialFreqHz: 24915000,
    mode: "FT8",
    label: "12m FT8",
    audioRangeLow: 200,
    audioRangeHigh: 3000,
  },
  {
    band: "10m",
    dialFreqHz: 28074000,
    mode: "FT8",
    label: "10m FT8",
    audioRangeLow: 200,
    audioRangeHigh: 3000,
  },
  {
    band: "6m",
    dialFreqHz: 50313000,
    mode: "FT8",
    label: "6m FT8",
    audioRangeLow: 200,
    audioRangeHigh: 3000,
  },
  {
    band: "2m",
    dialFreqHz: 144174000,
    mode: "FT8",
    label: "2m FT8",
    audioRangeLow: 200,
    audioRangeHigh: 3000,
  },
  // FT4 frequencies
  {
    band: "80m",
    dialFreqHz: 3575000,
    mode: "FT4",
    label: "80m FT4",
    audioRangeLow: 200,
    audioRangeHigh: 3000,
  },
  {
    band: "40m",
    dialFreqHz: 7047500,
    mode: "FT4",
    label: "40m FT4",
    audioRangeLow: 200,
    audioRangeHigh: 3000,
  },
  {
    band: "30m",
    dialFreqHz: 10140000,
    mode: "FT4",
    label: "30m FT4",
    audioRangeLow: 200,
    audioRangeHigh: 3000,
  },
  {
    band: "20m",
    dialFreqHz: 14080000,
    mode: "FT4",
    label: "20m FT4",
    audioRangeLow: 200,
    audioRangeHigh: 3000,
  },
  {
    band: "17m",
    dialFreqHz: 18104000,
    mode: "FT4",
    label: "17m FT4",
    audioRangeLow: 200,
    audioRangeHigh: 3000,
  },
  {
    band: "15m",
    dialFreqHz: 21140000,
    mode: "FT4",
    label: "15m FT4",
    audioRangeLow: 200,
    audioRangeHigh: 3000,
  },
  {
    band: "12m",
    dialFreqHz: 24919000,
    mode: "FT4",
    label: "12m FT4",
    audioRangeLow: 200,
    audioRangeHigh: 3000,
  },
  {
    band: "10m",
    dialFreqHz: 28180000,
    mode: "FT4",
    label: "10m FT4",
    audioRangeLow: 200,
    audioRangeHigh: 3000,
  },
  {
    band: "6m",
    dialFreqHz: 50318000,
    mode: "FT4",
    label: "6m FT4",
    audioRangeLow: 200,
    audioRangeHigh: 3000,
  },
];

/** Get all FT8 presets (no FT4) */
export function getFt8Presets(): Ft8BandPreset[] {
  return FT8_BAND_PRESETS.filter((p) => p.mode === "FT8");
}

/** Get all FT4 presets */
export function getFt4Presets(): Ft8BandPreset[] {
  return FT8_BAND_PRESETS.filter((p) => p.mode === "FT4");
}

/** Get presets for a specific mode */
export function getPresetsForMode(mode: "FT8" | "FT4"): Ft8BandPreset[] {
  return FT8_BAND_PRESETS.filter((p) => p.mode === mode);
}

/** Find the band preset matching a dial frequency (±1 kHz tolerance) */
export function findPresetByFrequency(
  freqHz: number,
  mode?: "FT8" | "FT4",
): Ft8BandPreset | undefined {
  const candidates = mode
    ? FT8_BAND_PRESETS.filter((p) => p.mode === mode)
    : FT8_BAND_PRESETS;
  return candidates.find((p) => Math.abs(p.dialFreqHz - freqHz) < 1000);
}

/** Derive band string from frequency in Hz */
export function freqToBand(freqHz: number): string | undefined {
  if (freqHz < 2000000) return "160m";
  if (freqHz < 4000000) return "80m";
  if (freqHz < 6000000) return "60m";
  if (freqHz < 8000000) return "40m";
  if (freqHz < 11000000) return "30m";
  if (freqHz < 15000000) return "20m";
  if (freqHz < 19000000) return "17m";
  if (freqHz < 22000000) return "15m";
  if (freqHz < 25500000) return "12m";
  if (freqHz < 30000000) return "10m";
  if (freqHz < 54000000) return "6m";
  if (freqHz < 148000000) return "2m";
  return undefined;
}
