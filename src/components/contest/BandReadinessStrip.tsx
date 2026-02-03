/**
 * BandReadinessStrip - Visual band status indicator for contest operation
 *
 * Shows readiness status for each HF band (160m, 80m, 40m, 20m, 15m, 10m)
 * based on spot density and optional solar indices.
 *
 * Features:
 * - Band status: Open / Marginal / Closed based on spot activity
 * - Spot count badges per band
 * - Optional directional tags (EU/JA/SA/OC) based on spotted DXCC regions
 * - Current band highlighting
 * - Compact mode for tight layouts
 * - Alert indicators for band openings
 *
 * @module components/contest/BandReadinessStrip
 */

import { useMemo, useCallback } from "react";
import { useDXStore, selectSpotCountByBand } from "@/stores/dxStore";
import { useKIndex, useSolarFlux } from "@/hooks/useSolarData";
import type { DXSpot } from "@/types/dxcluster";

// ============================================================================
// Types
// ============================================================================

export interface BandReadinessStripProps {
  /** Currently active band (will be highlighted) */
  currentBand?: string;
  /** Callback when a band is clicked */
  onBandClick?: (band: string) => void;
  /** Show minimal version */
  compact?: boolean;
  /** Additional CSS classes */
  className?: string;
  /** Show directional tags (EU/JA/SA/OC) */
  showDirections?: boolean;
  /** Show alert indicators */
  showAlerts?: boolean;
}

/**
 * Band readiness status
 */
export type BandStatus = "open" | "marginal" | "closed";

/**
 * Direction indicators based on spotted DXCC
 */
export type Direction = "EU" | "JA" | "SA" | "OC" | "AF" | "NA";

/**
 * Band info with computed readiness
 */
interface BandInfo {
  band: string;
  status: BandStatus;
  spotCount: number;
  directions: Direction[];
  isHighBand: boolean;
  trending?: "up" | "stable" | "down";
}

// ============================================================================
// Constants
// ============================================================================

/** HF contest bands in frequency order */
const HF_BANDS = ["160m", "80m", "40m", "20m", "15m", "10m"] as const;

/** High bands (affected by solar conditions) */
const HIGH_BANDS = new Set(["20m", "15m", "10m"]);

/** Spot count thresholds for status determination */
const SPOT_THRESHOLDS = {
  open: 5, // 5+ spots = open
  marginal: 2, // 2-4 spots = marginal
  closed: 0, // 0-1 spots = closed
} as const;

/** Solar flux thresholds for high band enhancement */
const SOLAR_FLUX_THRESHOLDS = {
  good: 120, // Above 120 = good high band conditions
  moderate: 90, // 90-120 = moderate
  poor: 0, // Below 90 = poor
} as const;

/** K-index thresholds (lower is better) */
const K_INDEX_THRESHOLDS = {
  good: 3, // 0-3 = good
  moderate: 5, // 4-5 = moderate
  poor: 9, // 6+ = poor
} as const;

/**
 * Map DXCC prefixes to directions
 * Simplified mapping for common contest DX
 */
const DXCC_DIRECTION_MAP: Record<string, Direction> = {
  // Europe
  DL: "EU",
  G: "EU",
  F: "EU",
  I: "EU",
  EA: "EU",
  PA: "EU",
  ON: "EU",
  SP: "EU",
  OK: "EU",
  OM: "EU",
  HA: "EU",
  OE: "EU",
  HB: "EU",
  LZ: "EU",
  YU: "EU",
  YO: "EU",
  S5: "EU",
  "9A": "EU",
  SM: "EU",
  LA: "EU",
  OH: "EU",
  OZ: "EU",
  GM: "EU",
  GW: "EU",
  GI: "EU",
  UA: "EU",
  UR: "EU",
  ES: "EU",
  YL: "EU",
  LY: "EU",
  // Japan / Asia
  JA: "JA",
  HL: "JA",
  BV: "JA",
  BY: "JA",
  VU: "JA",
  VR: "JA",
  // South America
  PY: "SA",
  LU: "SA",
  CE: "SA",
  CX: "SA",
  HK: "SA",
  YV: "SA",
  OA: "SA",
  // Oceania
  VK: "OC",
  ZL: "OC",
  KH6: "OC",
  FK: "OC",
  YB: "OC",
  DU: "OC",
  // Africa
  ZS: "AF",
  CN: "AF",
  "5N": "AF",
  EA8: "AF",
  EA9: "AF",
  "7X": "AF",
  // North America (excluding US)
  VE: "NA",
  XE: "NA",
  KP4: "NA",
  KP2: "NA",
  "6Y": "NA",
  HI: "NA",
};

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Extract DXCC prefix from callsign
 */
function extractPrefix(callsign: string): string {
  const upper = callsign.toUpperCase();
  const parts = upper.split("/");
  const mainCall =
    parts.length > 1 && parts[0].length <= 3 ? parts[1] : parts[0];

  // Try 3, 2, then 1 character prefixes
  for (const len of [3, 2, 1]) {
    const prefix = mainCall.slice(0, len);
    if (DXCC_DIRECTION_MAP[prefix]) {
      return prefix;
    }
  }

  return mainCall.slice(0, 2);
}

/**
 * Get direction from callsign
 */
function getDirection(callsign: string): Direction | null {
  const prefix = extractPrefix(callsign);

  // Check exact match first
  if (DXCC_DIRECTION_MAP[prefix]) {
    return DXCC_DIRECTION_MAP[prefix];
  }

  // Check shorter prefixes
  for (const len of [2, 1]) {
    const shortPrefix = prefix.slice(0, len);
    if (DXCC_DIRECTION_MAP[shortPrefix]) {
      return DXCC_DIRECTION_MAP[shortPrefix];
    }
  }

  return null;
}

/**
 * Determine band status based on spot count and solar conditions
 */
function determineBandStatus(
  spotCount: number,
  isHighBand: boolean,
  solarFlux: number | null,
  kIndex: number | null,
): BandStatus {
  // Base status from spot count
  let baseStatus: BandStatus;
  if (spotCount >= SPOT_THRESHOLDS.open) {
    baseStatus = "open";
  } else if (spotCount >= SPOT_THRESHOLDS.marginal) {
    baseStatus = "marginal";
  } else {
    baseStatus = "closed";
  }

  // Adjust high bands based on solar conditions
  if (isHighBand && solarFlux !== null) {
    // Good solar flux can upgrade marginal to open
    if (solarFlux >= SOLAR_FLUX_THRESHOLDS.good && baseStatus === "marginal") {
      baseStatus = "open";
    }
    // Poor solar flux can downgrade open to marginal
    if (solarFlux < SOLAR_FLUX_THRESHOLDS.moderate && baseStatus === "open") {
      baseStatus = "marginal";
    }
  }

  // High K-index degrades all bands
  if (kIndex !== null && kIndex >= K_INDEX_THRESHOLDS.poor) {
    if (baseStatus === "open") {
      baseStatus = "marginal";
    } else if (baseStatus === "marginal") {
      baseStatus = "closed";
    }
  }

  return baseStatus;
}

/**
 * Get status color classes
 */
function getStatusColors(status: BandStatus): {
  bg: string;
  text: string;
  border: string;
  glow: string;
} {
  switch (status) {
    case "open":
      return {
        bg: "bg-signal-green/20",
        text: "text-signal-green",
        border: "border-signal-green/50",
        glow: "shadow-[0_0_8px_rgba(0,255,136,0.3)]",
      };
    case "marginal":
      return {
        bg: "bg-yellow-500/20",
        text: "text-yellow-400",
        border: "border-yellow-500/50",
        glow: "",
      };
    case "closed":
      return {
        bg: "bg-gray-600/20",
        text: "text-gray-500",
        border: "border-gray-600/50",
        glow: "",
      };
  }
}

/**
 * Get directions from spots on a band
 */
function getDirectionsFromSpots(
  spots: DXSpot[],
  band: string,
  maxAge: number = 30,
): Direction[] {
  const cutoff = Date.now() - maxAge * 60 * 1000;
  const directions = new Set<Direction>();

  for (const spot of spots) {
    if (spot.band === band && spot.time.getTime() >= cutoff) {
      const dir = getDirection(spot.dx);
      if (dir) {
        directions.add(dir);
      }
    }
  }

  // Return sorted by priority (EU/JA first as most common DX targets)
  const priorityOrder: Direction[] = ["EU", "JA", "SA", "OC", "AF", "NA"];
  return priorityOrder.filter((d) => directions.has(d));
}

// ============================================================================
// Sub-Components
// ============================================================================

interface BandPillProps {
  info: BandInfo;
  isSelected: boolean;
  compact: boolean;
  showDirections: boolean;
  onClick?: () => void;
}

/**
 * Individual band pill component
 */
function BandPill({
  info,
  isSelected,
  compact,
  showDirections,
  onClick,
}: BandPillProps) {
  const colors = getStatusColors(info.status);

  const baseClasses = [
    "relative flex flex-col items-center justify-center rounded-lg",
    "transition-all duration-200 cursor-pointer",
    "border",
    colors.bg,
    colors.border,
    isSelected ? colors.glow : "",
    isSelected ? "ring-2 ring-plasma-orange/50" : "",
    onClick ? "hover:scale-105" : "",
  ].join(" ");

  const sizeClasses = compact
    ? "px-2 py-1 min-w-[40px]"
    : "px-3 py-2 min-w-[56px]";

  return (
    <button
      type="button"
      onClick={onClick}
      className={`${baseClasses} ${sizeClasses}`}
      title={`${info.band}: ${info.status} (${info.spotCount} spots)`}
    >
      {/* Band label */}
      <span
        className={`font-mono font-bold ${compact ? "text-xs" : "text-sm"} ${colors.text}`}
      >
        {info.band.replace("m", "")}
      </span>

      {/* Spot count badge */}
      {!compact && (
        <span className="text-[9px] text-gray-500 font-mono mt-0.5">
          {info.spotCount}
        </span>
      )}

      {/* Status indicator dot */}
      <div
        className={`absolute -top-1 -right-1 w-2 h-2 rounded-full ${
          info.status === "open"
            ? "bg-signal-green"
            : info.status === "marginal"
              ? "bg-yellow-400"
              : "bg-gray-600"
        }`}
      />

      {/* Direction tags */}
      {showDirections && !compact && info.directions.length > 0 && (
        <div className="flex items-center gap-0.5 mt-1">
          {info.directions.slice(0, 2).map((dir) => (
            <span
              key={dir}
              className="text-[7px] px-1 py-0.5 rounded bg-white/10 text-gray-400 font-mono"
            >
              {dir}
            </span>
          ))}
        </div>
      )}

      {/* Trending indicator */}
      {info.trending === "up" && (
        <div className="absolute -top-1 -left-1 text-signal-green text-[10px]">
          +
        </div>
      )}
    </button>
  );
}

/**
 * Solar conditions badge
 */
function SolarBadge({
  solarFlux,
  kIndex,
  compact,
}: {
  solarFlux: number | null;
  kIndex: number | null;
  compact: boolean;
}) {
  if (compact || (solarFlux === null && kIndex === null)) {
    return null;
  }

  const sfiColor =
    solarFlux !== null && solarFlux >= SOLAR_FLUX_THRESHOLDS.good
      ? "text-signal-green"
      : solarFlux !== null && solarFlux >= SOLAR_FLUX_THRESHOLDS.moderate
        ? "text-yellow-400"
        : "text-gray-500";

  const kColor =
    kIndex !== null && kIndex <= K_INDEX_THRESHOLDS.good
      ? "text-signal-green"
      : kIndex !== null && kIndex <= K_INDEX_THRESHOLDS.moderate
        ? "text-yellow-400"
        : "text-alert-red";

  return (
    <div className="flex items-center gap-2 px-2 py-1 rounded bg-white/5 border border-white/10">
      {solarFlux !== null && (
        <div className="flex items-center gap-1">
          <span className="text-[9px] text-gray-500">SFI</span>
          <span className={`text-[10px] font-mono font-bold ${sfiColor}`}>
            {solarFlux}
          </span>
        </div>
      )}
      {kIndex !== null && (
        <div className="flex items-center gap-1">
          <span className="text-[9px] text-gray-500">K</span>
          <span className={`text-[10px] font-mono font-bold ${kColor}`}>
            {kIndex}
          </span>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

/**
 * BandReadinessStrip component
 *
 * Displays a horizontal strip of band status indicators for quick
 * contest band awareness during operation.
 */
export function BandReadinessStrip({
  currentBand,
  onBandClick,
  compact = false,
  className = "",
  showDirections = true,
  // showAlerts is reserved for future alert indicator feature
  showAlerts: _showAlerts = true,
}: BandReadinessStripProps) {
  // Get spots from store
  const spots = useDXStore((state) => state.spots);
  const spotCountByBand = useDXStore(selectSpotCountByBand);

  // Note: _showAlerts reserved for future alert indicator integration
  void _showAlerts;

  // Get solar data (optional enhancement)
  const kIndexQuery = useKIndex();
  const solarFluxQuery = useSolarFlux();

  // Extract latest values
  const latestKIndex = useMemo(() => {
    const data = kIndexQuery.data;
    if (!data || data.length === 0) return null;
    return data[data.length - 1].kp_index;
  }, [kIndexQuery.data]);

  const latestSolarFlux = useMemo(() => {
    const data = solarFluxQuery.data;
    if (!data || data.length === 0) return null;
    return data[data.length - 1].flux;
  }, [solarFluxQuery.data]);

  // Compute band info
  const bandInfos = useMemo((): BandInfo[] => {
    return HF_BANDS.map((band) => {
      const spotCount = spotCountByBand[band] ?? 0;
      const isHighBand = HIGH_BANDS.has(band);
      const status = determineBandStatus(
        spotCount,
        isHighBand,
        latestSolarFlux,
        latestKIndex,
      );
      const directions = showDirections
        ? getDirectionsFromSpots(spots, band)
        : [];

      return {
        band,
        status,
        spotCount,
        directions,
        isHighBand,
      };
    });
  }, [spotCountByBand, spots, latestSolarFlux, latestKIndex, showDirections]);

  // Handle band click
  const handleBandClick = useCallback(
    (band: string) => {
      if (onBandClick) {
        onBandClick(band);
      }
    },
    [onBandClick],
  );

  // Count open bands for summary
  const openCount = bandInfos.filter((b) => b.status === "open").length;
  const marginalCount = bandInfos.filter((b) => b.status === "marginal").length;

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {/* Band pills */}
      <div className="flex items-center gap-1">
        {bandInfos.map((info) => (
          <BandPill
            key={info.band}
            info={info}
            isSelected={currentBand === info.band}
            compact={compact}
            showDirections={showDirections}
            onClick={onBandClick ? () => handleBandClick(info.band) : undefined}
          />
        ))}
      </div>

      {/* Solar conditions badge */}
      {!compact && (
        <SolarBadge
          solarFlux={latestSolarFlux}
          kIndex={latestKIndex}
          compact={compact}
        />
      )}

      {/* Summary (non-compact only) */}
      {!compact && (
        <div className="flex items-center gap-2 text-[10px] text-gray-500 ml-2">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-signal-green" />
            {openCount}
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-yellow-400" />
            {marginalCount}
          </span>
        </div>
      )}
    </div>
  );
}

export default BandReadinessStrip;
