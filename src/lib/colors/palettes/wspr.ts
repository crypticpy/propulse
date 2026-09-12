/**
 * Band-to-color mapping for WSPR path overlays, shared by the 3D globe
 * (WSPROverlay3D) and the 2D flat map (FlatMapView.drawWsprPaths) so both
 * views render WSPR paths with identical colors -- the same precedent as
 * qsoBandColors.ts.
 *
 * The ladder is ordered lowest band first and keyed by the *upper* frequency
 * bound in MHz, so a lookup is the first entry whose `maxMHz` exceeds the
 * spot's frequency.
 */

export interface WsprBandColor {
  /** Upper frequency bound in MHz (exclusive) for this band. */
  maxMHz: number;
  /** Display label, e.g. "20m". */
  label: string;
  /** Hex color. */
  color: string;
}

export const WSPR_BAND_COLORS: ReadonlyArray<WsprBandColor> = [
  { maxMHz: 2.5, label: "160m", color: "#8b0000" }, // dark red
  { maxMHz: 5.0, label: "80m", color: "#cc2222" }, // red
  { maxMHz: 8.5, label: "40m", color: "#ff6600" }, // orange
  { maxMHz: 12.0, label: "30m", color: "#ddcc00" }, // yellow
  { maxMHz: 16.0, label: "20m", color: "#22cc44" }, // green
  { maxMHz: 20.0, label: "17m", color: "#00cccc" }, // cyan
  { maxMHz: 23.0, label: "15m", color: "#2266ff" }, // blue
  { maxMHz: 26.0, label: "12m", color: "#4400cc" }, // indigo
  { maxMHz: Infinity, label: "10m", color: "#9922cc" }, // purple
];

/** Resolve the WSPR band color for a frequency in MHz. */
export function getWsprBandColor(freqMHz: number): string {
  const entry =
    WSPR_BAND_COLORS.find((band) => freqMHz < band.maxMHz) ??
    WSPR_BAND_COLORS[WSPR_BAND_COLORS.length - 1];
  return entry.color;
}
