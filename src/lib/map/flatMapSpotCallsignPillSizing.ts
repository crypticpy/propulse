import { screenPxToCanvas } from "@/lib/map/projection";

/** Pill width / measured-text width for flat-map DX callsign labels. */
export function flatMapDxCallsignPillWidthRatio(
  measuredTextWidth: number,
  zoomScale: number,
): number {
  const horizontalPadding = screenPxToCanvas(6, zoomScale);
  return (measuredTextWidth + horizontalPadding) / measuredTextWidth;
}
