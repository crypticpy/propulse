/**
 * ObservedMUFLayer Component
 *
 * Renders a semi-transparent grid overlay showing observed MUF values
 * derived from live spot data. Can display in two modes:
 * - "observed": Shows absolute observed MUF with frequency-based coloring
 * - "divergence": Shows difference between model predictions and observations
 *
 * Uses SVG rectangles positioned via an equirectangular projection,
 * suitable for overlay on both 2D flat map and as a HUD reference.
 */

import { useMemo } from "react";
import type {
  ObservedMUFGrid,
  MUFGridCell,
  MUFDivergence,
} from "@/lib/utils/observedMUF";

// ============================================================================
// Types
// ============================================================================

interface ObservedMUFLayerProps {
  /** The observed MUF grid data to render */
  grid: ObservedMUFGrid | null;
  /** Display mode: absolute observed MUF or model divergence */
  mode: "observed" | "divergence";
  /** Divergence data (required when mode is "divergence") */
  divergences?: MUFDivergence[];
  /** Additional CSS class name */
  className?: string;
}

// ============================================================================
// Color helpers
// ============================================================================

/** Minimum spots in a cell for full opacity */
const MAX_CONFIDENCE_SPOTS = 15;

/** Base opacity for cells with minimal data */
const MIN_OPACITY = 0.15;

/** Maximum opacity for high-confidence cells */
const MAX_OPACITY = 0.65;

/**
 * Get color for an observed MUF value (frequency-based).
 * More saturated than the model MUF overlay to visually distinguish.
 */
function getObservedMUFColor(mufMHz: number): string {
  if (mufMHz >= 50) return "#e91e90"; // Magenta -- Es territory
  if (mufMHz >= 28) return "#f97316"; // Orange -- 10m+
  if (mufMHz >= 21) return "#eab308"; // Yellow -- 15m
  if (mufMHz >= 14) return "#22c55e"; // Green -- 20m
  if (mufMHz >= 7) return "#3b82f6"; // Blue -- 40m
  return "#1e3a8a"; // Dark blue -- 80m/160m
}

/**
 * Get color for a divergence cell.
 * Green = observed better than model, orange = worse, gray = matches.
 */
function getDivergenceColor(status: MUFDivergence["status"]): string {
  switch (status) {
    case "better":
      return "#22c55e"; // Green
    case "worse":
      return "#f97316"; // Orange
    case "matches":
      return "#6b7280"; // Gray
    case "no_data":
      return "#374151"; // Dark gray
  }
}

/**
 * Compute cell opacity based on spot count (confidence).
 * More spots = higher confidence = more opaque.
 */
function getConfidenceOpacity(spotCount: number): number {
  const t = Math.min(spotCount / MAX_CONFIDENCE_SPOTS, 1);
  return MIN_OPACITY + t * (MAX_OPACITY - MIN_OPACITY);
}

// ============================================================================
// Projection helpers
// ============================================================================

/**
 * Convert lat/lon to SVG viewport coordinates (equirectangular).
 * SVG viewBox is 360 x 180, origin at top-left (-180 lon, +90 lat).
 */
function latLonToSVG(lat: number, lon: number): { x: number; y: number } {
  return {
    x: lon + 180,
    y: 90 - lat,
  };
}

// ============================================================================
// Sub-components
// ============================================================================

/**
 * Renders a single observed MUF cell as an SVG rectangle.
 */
function ObservedCell({
  cell,
  resolution,
}: {
  cell: MUFGridCell;
  resolution: number;
}) {
  const { x, y } = latLonToSVG(cell.lat, cell.lon);
  const halfRes = resolution / 2;
  const color = getObservedMUFColor(cell.observedMUFMHz);
  const opacity = getConfidenceOpacity(cell.spotCount);

  return (
    <rect
      x={x - halfRes}
      y={y - halfRes}
      width={resolution}
      height={resolution}
      fill={color}
      opacity={opacity}
      rx={0.5}
    >
      <title>
        {`MUF: ${cell.observedMUFMHz.toFixed(1)} MHz (${cell.highestBand})\n`}
        {`Spots: ${cell.spotCount}`}
        {cell.averageSNR != null ? `\nAvg SNR: ${cell.averageSNR} dB` : ""}
      </title>
    </rect>
  );
}

/**
 * Renders a single divergence cell as an SVG rectangle.
 */
function DivergenceCell({
  divergence,
  resolution,
}: {
  divergence: MUFDivergence;
  resolution: number;
}) {
  const { x, y } = latLonToSVG(divergence.lat, divergence.lon);
  const halfRes = resolution / 2;
  const color = getDivergenceColor(divergence.status);

  // Opacity scales with magnitude of divergence
  const magnitude = Math.abs(divergence.divergenceMHz);
  const opacity =
    divergence.status === "no_data"
      ? 0.1
      : MIN_OPACITY + Math.min(magnitude / 15, 1) * (MAX_OPACITY - MIN_OPACITY);

  return (
    <rect
      x={x - halfRes}
      y={y - halfRes}
      width={resolution}
      height={resolution}
      fill={color}
      opacity={opacity}
      rx={0.5}
    >
      <title>
        {divergence.status === "no_data"
          ? "No model data for comparison"
          : `Model: ${divergence.modelMUFMHz.toFixed(1)} MHz\n` +
            `Observed: ${divergence.observedMUFMHz.toFixed(1)} MHz\n` +
            `Divergence: ${divergence.divergenceMHz > 0 ? "+" : ""}${divergence.divergenceMHz.toFixed(1)} MHz\n` +
            `Status: ${divergence.status}`}
      </title>
    </rect>
  );
}

// ============================================================================
// Main component
// ============================================================================

/**
 * Observed MUF grid overlay.
 *
 * Renders colored rectangles on an equirectangular SVG canvas.
 * In "observed" mode, colors represent the highest frequency observed.
 * In "divergence" mode, colors show where reality differs from the model.
 *
 * @example
 * ```tsx
 * <ObservedMUFLayer
 *   grid={observedGrid}
 *   mode="observed"
 *   className="pointer-events-none"
 * />
 * ```
 */
export function ObservedMUFLayer({
  grid,
  mode,
  divergences,
  className = "",
}: ObservedMUFLayerProps) {
  // Memoize cell rendering to avoid re-computing on every render
  const renderedCells = useMemo(() => {
    if (!grid || grid.cells.length === 0) return null;

    if (mode === "divergence" && divergences) {
      return divergences.map((div) => (
        <DivergenceCell
          key={`div-${div.lat}-${div.lon}`}
          divergence={div}
          resolution={grid.resolution}
        />
      ));
    }

    return grid.cells.map((cell) => (
      <ObservedCell
        key={`obs-${cell.lat}-${cell.lon}`}
        cell={cell}
        resolution={grid.resolution}
      />
    ));
  }, [grid, mode, divergences]);

  if (!grid || grid.cells.length === 0) {
    return null;
  }

  return (
    <svg
      viewBox="0 0 360 180"
      preserveAspectRatio="none"
      className={`absolute inset-0 w-full h-full pointer-events-none ${className}`}
      style={{ mixBlendMode: "screen" }}
    >
      {renderedCells}
    </svg>
  );
}

/**
 * Color legend data for the observed MUF layer.
 * Can be used by a legend component elsewhere in the UI.
 */
export const OBSERVED_MUF_LEGEND = [
  { label: "< 7 MHz", color: "#1e3a8a" },
  { label: "7-14 MHz", color: "#3b82f6" },
  { label: "14-21 MHz", color: "#22c55e" },
  { label: "21-28 MHz", color: "#eab308" },
  { label: "28-50 MHz", color: "#f97316" },
  { label: "> 50 MHz", color: "#e91e90" },
] as const;

/**
 * Color legend data for the divergence layer.
 */
export const DIVERGENCE_LEGEND = [
  { label: "Better than predicted", color: "#22c55e" },
  { label: "Matches model", color: "#6b7280" },
  { label: "Worse than predicted", color: "#f97316" },
] as const;
