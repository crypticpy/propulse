/**
 * Map frequency in kHz to HF band string.
 * Returns null for non-HF frequencies (VHF/UHF skipped).
 */
export function frequencyToBand(freqKHz: number): string | null {
  if (freqKHz >= 1800 && freqKHz <= 2000) return "160m";
  if (freqKHz >= 3500 && freqKHz <= 4000) return "80m";
  if (freqKHz >= 5330 && freqKHz <= 5405) return "60m";
  if (freqKHz >= 7000 && freqKHz <= 7300) return "40m";
  if (freqKHz >= 10100 && freqKHz <= 10150) return "30m";
  if (freqKHz >= 14000 && freqKHz <= 14350) return "20m";
  if (freqKHz >= 18068 && freqKHz <= 18168) return "17m";
  if (freqKHz >= 21000 && freqKHz <= 21450) return "15m";
  if (freqKHz >= 24890 && freqKHz <= 24990) return "12m";
  if (freqKHz >= 28000 && freqKHz <= 29700) return "10m";
  return null; // VHF/UHF — skip
}

/** All HF bands in frequency order */
export const HF_BANDS = [
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
