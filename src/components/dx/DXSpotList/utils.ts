/**
 * DXSpotList Utility Functions
 *
 * Helper functions for formatting, calculations, and data transformation.
 */

import type { SpotRowProps } from "./types";

/**
 * Format time for display (HH:MM UTC)
 */
export function formatTime(date: Date): string {
  return date.toISOString().substring(11, 16);
}

/**
 * Format frequency for display
 * @param freqKHz - Frequency in kHz
 * @param format - Display format ('mhz' or 'khz')
 * @returns Formatted frequency string
 */
export function formatFrequency(
  freqKHz: number,
  format: "mhz" | "khz" = "mhz",
): string {
  if (format === "mhz") {
    return (freqKHz / 1000).toFixed(3); // "14.195"
  }
  return freqKHz.toFixed(1); // "14195.0"
}

/**
 * Calculate minutes ago from now
 */
export function getMinutesAgo(date: Date): number {
  return Math.floor((Date.now() - date.getTime()) / 60000);
}

/**
 * Format distance for display (e.g., "1,234 km" or "12,345 km")
 */
export function formatDistance(km: number | null): string {
  if (km === null) return "---";
  if (km < 1000) return `${Math.round(km)} km`;
  return `${Math.round(km / 100) / 10}k km`;
}

/**
 * Comparison function for SpotRow memo
 * Only re-render when relevant data changes
 *
 * Note: Callback props (onSelect, onHover, onContextMenu, etc.) are intentionally
 * not compared because they are expected to be stable references created via
 * useCallback in useDXSpotListState. If inline callbacks are passed, memoization
 * will still work but the callbacks may reference stale closures.
 */
export function spotRowPropsAreEqual(
  prevProps: SpotRowProps,
  nextProps: SpotRowProps,
): boolean {
  return (
    prevProps.spot.id === nextProps.spot.id &&
    prevProps.spot.frequency === nextProps.spot.frequency &&
    prevProps.spot.time.getTime() === nextProps.spot.time.getTime() &&
    prevProps.spot.comment === nextProps.spot.comment && // For split indicator
    prevProps.index === nextProps.index &&
    prevProps.isSelected === nextProps.isSelected &&
    prevProps.isHovered === nextProps.isHovered &&
    prevProps.workedStatus.isWorked === nextProps.workedStatus.isWorked &&
    prevProps.workedStatus.workedOnBand ===
      nextProps.workedStatus.workedOnBand &&
    prevProps.workedStatus.workedBands.length ===
      nextProps.workedStatus.workedBands.length &&
    prevProps.isAlertMatch === nextProps.isAlertMatch &&
    prevProps.isNeeded === nextProps.isNeeded &&
    prevProps.distanceKm === nextProps.distanceKm &&
    prevProps.showAgeColumn === nextProps.showAgeColumn &&
    prevProps.ageVisualizationEnabled === nextProps.ageVisualizationEnabled &&
    prevProps.activeBandFilter === nextProps.activeBandFilter &&
    prevProps.isHighlighted === nextProps.isHighlighted
  );
}
