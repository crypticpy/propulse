/**
 * Satellite Utility Functions & Constants
 *
 * Shared formatting helpers and category metadata for satellite UI components.
 * Extracted from SatellitePanel to enable reuse across LayersPopover submenus,
 * SatelliteDetailModal, and future satellite views.
 */

import type { SatelliteCategory } from "@/types/satellite";

// ---------------------------------------------------------------------------
// Category Display Metadata
// ---------------------------------------------------------------------------

/** Visual styling for each satellite category */
export const CATEGORY_META: Record<
  SatelliteCategory,
  { label: string; color: string; bg: string }
> = {
  iss: { label: "ISS", color: "text-white", bg: "bg-white/20" },
  fm: { label: "FM", color: "text-green-400", bg: "bg-green-400/20" },
  linear: { label: "LIN", color: "text-cyan-400", bg: "bg-cyan-400/20" },
  digital: { label: "DIG", color: "text-orange-400", bg: "bg-orange-400/20" },
  weather: { label: "WX", color: "text-purple-400", bg: "bg-purple-400/20" },
  other: { label: "OTH", color: "text-gray-400", bg: "bg-gray-400/20" },
};

// ---------------------------------------------------------------------------
// Formatting Helpers
// ---------------------------------------------------------------------------

/** Format azimuth degrees to compass bearing string (e.g. "135deg SE") */
export function formatAzimuth(az: number): string {
  const directions = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  const index = Math.round(az / 45) % 8;
  return `${Math.round(az)}\u00B0 ${directions[index]}`;
}

/** Format frequency in Hz to a human-readable string (MHz or GHz) */
export function formatFreqMHz(hz: number): string {
  if (hz >= 1_000_000_000) {
    return `${(hz / 1_000_000_000).toFixed(3)} GHz`;
  }
  return `${(hz / 1_000_000).toFixed(3)} MHz`;
}

/** Format Doppler shift for display with +/- prefix and unit */
export function formatShift(hz: number): string {
  const prefix = hz >= 0 ? "+" : "";
  if (Math.abs(hz) >= 1000) {
    return `${prefix}${(hz / 1000).toFixed(1)} kHz`;
  }
  return `${prefix}${Math.round(hz)} Hz`;
}

/** Format lat/lon pair to a display string (e.g. "34.1degN 118.2degW") */
export function formatLatLon(lat: number, lon: number): string {
  const latDir = lat >= 0 ? "N" : "S";
  const lonDir = lon >= 0 ? "E" : "W";
  return `${Math.abs(lat).toFixed(1)}\u00B0${latDir} ${Math.abs(lon).toFixed(1)}\u00B0${lonDir}`;
}
