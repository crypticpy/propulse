/**
 * SporadicELayer Component
 *
 * Map overlay visualizing detected sporadic E (Es) cloud regions.
 * Renders as an absolutely-positioned SVG overlay that sits above the map.
 *
 * Features:
 * - Semi-transparent magenta/purple circle at detected Es cloud center
 * - Pulsing animation when Es is active
 * - Label with "Es Active" and estimated MUF
 * - Seasonal forecast indicator (probability badge)
 * - Lightweight: SVG + Tailwind, no heavy dependencies
 */

import { useMemo } from "react";
import type { EsDetection, EsForecast } from "@/lib/utils/sporadicE";

// =============================================================================
// TYPES
// =============================================================================

interface SporadicELayerProps {
  /** Current Es detection (null if no active opening) */
  detection: EsDetection | null;
  /** Optional forecast data for probability display */
  forecast?: EsForecast;
  /** Map dimensions for coordinate projection */
  mapWidth: number;
  mapHeight: number;
  /** Map center longitude (for flat map viewport offset) */
  centerLon?: number;
  /** Zoom level (1 = full extent) */
  zoom?: number;
  /** Additional CSS class */
  className?: string;
}

// =============================================================================
// CONSTANTS
// =============================================================================

/** Es cloud visualization colors */
const ES_COLORS = {
  /** Primary fill color - magenta/purple with transparency */
  fill: "rgba(192, 38, 211, 0.15)",
  /** Outer ring stroke */
  stroke: "rgba(192, 38, 211, 0.6)",
  /** Inner pulse color */
  pulse: "rgba(192, 38, 211, 0.3)",
  /** Label background */
  labelBg: "rgba(30, 10, 40, 0.85)",
  /** Label text */
  labelText: "#e879f9",
  /** Confidence indicator - high */
  confidenceHigh: "#a855f7",
  /** Confidence indicator - medium */
  confidenceMed: "#c084fc",
  /** Confidence indicator - low */
  confidenceLow: "#e9d5ff",
} as const;

/** Maximum visual radius in SVG units to prevent oversized circles */
const MAX_VISUAL_RADIUS_PX = 120;
/** Minimum visual radius to keep the indicator visible */
const MIN_VISUAL_RADIUS_PX = 20;

// =============================================================================
// COORDINATE PROJECTION
// =============================================================================

/**
 * Project lat/lon to pixel coordinates on an equirectangular map.
 */
function projectToMap(
  lat: number,
  lon: number,
  mapWidth: number,
  mapHeight: number,
  centerLon: number = 0,
  zoom: number = 1,
): { x: number; y: number } {
  // Normalize longitude relative to center
  let dLon = lon - centerLon;
  if (dLon > 180) dLon -= 360;
  if (dLon < -180) dLon += 360;

  const x = mapWidth / 2 + (dLon / 360) * mapWidth * zoom;
  const y = mapHeight / 2 - (lat / 180) * mapHeight * zoom;

  return { x, y };
}

/**
 * Convert a km radius to approximate pixel radius on the map.
 * Earth circumference ~40,030 km = full map width.
 */
function kmToPixelRadius(
  radiusKm: number,
  mapWidth: number,
  zoom: number = 1,
): number {
  const earthCircumferenceKm = 40030;
  const degreesPerKm = 360 / earthCircumferenceKm;
  const radiusDeg = radiusKm * degreesPerKm;
  const pixelRadius = (radiusDeg / 360) * mapWidth * zoom;

  return Math.max(
    MIN_VISUAL_RADIUS_PX,
    Math.min(MAX_VISUAL_RADIUS_PX, pixelRadius),
  );
}

// =============================================================================
// SUB-COMPONENTS
// =============================================================================

/**
 * Get the confidence color based on detection confidence level.
 */
function getConfidenceColor(confidence: number): string {
  if (confidence >= 0.8) return ES_COLORS.confidenceHigh;
  if (confidence >= 0.6) return ES_COLORS.confidenceMed;
  return ES_COLORS.confidenceLow;
}

/**
 * Format duration from seconds to a readable string.
 */
function formatDuration(seconds: number): string {
  if (seconds < 60) return "< 1 min";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainingMin = minutes % 60;
  return remainingMin > 0 ? `${hours}h ${remainingMin}m` : `${hours}h`;
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export function SporadicELayer({
  detection,
  forecast,
  mapWidth,
  mapHeight,
  centerLon = 0,
  zoom = 1,
  className = "",
}: SporadicELayerProps) {
  // Project detection center to map coordinates
  const projected = useMemo(() => {
    if (!detection) return null;

    const pos = projectToMap(
      detection.centerLat,
      detection.centerLon,
      mapWidth,
      mapHeight,
      centerLon,
      zoom,
    );
    const radius = kmToPixelRadius(detection.radiusKm, mapWidth, zoom);

    return { ...pos, radius };
  }, [detection, mapWidth, mapHeight, centerLon, zoom]);

  // Nothing to render if no detection and no forecast
  if (!detection && !forecast) {
    return null;
  }

  return (
    <div
      className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`}
      style={{ zIndex: 15 }}
    >
      <svg
        width={mapWidth}
        height={mapHeight}
        viewBox={`0 0 ${mapWidth} ${mapHeight}`}
        className="absolute inset-0"
      >
        {/* SVG Definitions: pulse animation, glow filter */}
        <defs>
          {/* Radial gradient for the Es cloud fill */}
          <radialGradient id="es-cloud-gradient" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="rgba(192, 38, 211, 0.25)" />
            <stop offset="60%" stopColor="rgba(192, 38, 211, 0.1)" />
            <stop offset="100%" stopColor="rgba(192, 38, 211, 0)" />
          </radialGradient>

          {/* Glow filter for the active indicator */}
          <filter id="es-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Active Es detection visualization */}
        {detection && projected && (
          <g>
            {/* Outer cloud area - radial gradient fill */}
            <circle
              cx={projected.x}
              cy={projected.y}
              r={projected.radius}
              fill="url(#es-cloud-gradient)"
              stroke={ES_COLORS.stroke}
              strokeWidth={1.5}
              strokeDasharray="6 3"
              opacity={0.8}
            />

            {/* Pulsing ring animation */}
            <circle
              cx={projected.x}
              cy={projected.y}
              r={projected.radius * 0.6}
              fill="none"
              stroke={ES_COLORS.pulse}
              strokeWidth={2}
              opacity={0.7}
            >
              <animate
                attributeName="r"
                values={`${projected.radius * 0.4};${projected.radius * 0.9};${projected.radius * 0.4}`}
                dur="3s"
                repeatCount="indefinite"
              />
              <animate
                attributeName="opacity"
                values="0.7;0.2;0.7"
                dur="3s"
                repeatCount="indefinite"
              />
            </circle>

            {/* Inner active core */}
            <circle
              cx={projected.x}
              cy={projected.y}
              r={Math.max(4, projected.radius * 0.15)}
              fill={getConfidenceColor(detection.confidence)}
              filter="url(#es-glow)"
              opacity={0.9}
            />
          </g>
        )}
      </svg>

      {/* Label overlay (HTML for better text rendering) */}
      {detection && projected && (
        <div
          className="absolute flex flex-col items-center gap-1"
          style={{
            left: projected.x,
            top: projected.y - projected.radius - 8,
            transform: "translate(-50%, -100%)",
          }}
        >
          {/* Main label */}
          <div
            className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-semibold whitespace-nowrap"
            style={{
              backgroundColor: ES_COLORS.labelBg,
              color: ES_COLORS.labelText,
              border: `1px solid ${ES_COLORS.stroke}`,
            }}
          >
            {/* Active indicator dot */}
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{
                backgroundColor: getConfidenceColor(detection.confidence),
                boxShadow: `0 0 4px ${getConfidenceColor(detection.confidence)}`,
              }}
            />
            <span>Es Active</span>
            <span className="text-purple-300/70">|</span>
            <span>MUF &gt; {detection.estimatedMUFMHz} MHz</span>
          </div>

          {/* Sub-label with bands and duration */}
          <div
            className="flex items-center gap-1.5 rounded px-1.5 py-0.5 text-[10px] whitespace-nowrap"
            style={{
              backgroundColor: "rgba(30, 10, 40, 0.7)",
              color: "rgba(233, 121, 249, 0.7)",
            }}
          >
            <span>{detection.bands.join(", ")}</span>
            <span style={{ color: "rgba(233, 121, 249, 0.4)" }}>
              {"\u00B7"}
            </span>
            <span>{detection.spotCount} spots</span>
            <span style={{ color: "rgba(233, 121, 249, 0.4)" }}>
              {"\u00B7"}
            </span>
            <span>{formatDuration(detection.duration)}</span>
          </div>
        </div>
      )}

      {/* Forecast probability badge (shown when forecast provided but no active detection) */}
      {forecast && !detection && (
        <div
          className="absolute right-3 top-3 flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs"
          style={{
            backgroundColor: ES_COLORS.labelBg,
            color: ES_COLORS.labelText,
            border: `1px solid rgba(192, 38, 211, 0.3)`,
          }}
        >
          <span className="font-semibold">Es Forecast</span>
          <span className="text-purple-300/50">|</span>
          <span>
            {Math.round(forecast.probability * 100)}% ({forecast.season})
          </span>
          {forecast.expectedCeilingMHz > 0 && (
            <>
              <span className="text-purple-300/50">|</span>
              <span>Ceiling ~{forecast.expectedCeilingMHz} MHz</span>
            </>
          )}
        </div>
      )}
    </div>
  );
}
