import React from "react";
import { MetricCard } from "./MetricCard";
import { getKIndexColor, getKIndexDescription } from "@/lib/utils/bands";

export interface PrimaryMetricsProps {
  /** Current K-index value (0-9) */
  kIndex: number;
  /** Solar Flux Index (typically 70-300 sfu) */
  solarFlux: number;
  /** Daily sunspot number */
  sunspotNumber: number;
  /** A-index (24-hour geomagnetic activity) */
  aIndex?: number;
  /** Show loading state */
  loading?: boolean;
}

/**
 * Get color for Solar Flux Index value
 * Higher SFI = better HF propagation
 *
 * @param sfi - Solar Flux Index value
 * @returns Hex color code
 */
function getSFIColor(sfi: number): string {
  if (sfi >= 150) return "#00ff88"; // Excellent - signal-green
  if (sfi >= 100) return "#ffaa00"; // Fair - caution-amber
  return "#ff4455"; // Poor - alert-red
}

/**
 * Get description for Solar Flux Index value
 *
 * @param sfi - Solar Flux Index value
 * @returns Human-readable description
 */
function getSFIDescription(sfi: number): string {
  if (sfi >= 200) return "Very High";
  if (sfi >= 150) return "High";
  if (sfi >= 100) return "Moderate";
  if (sfi >= 80) return "Low";
  return "Very Low";
}

/**
 * Get color for A-index value
 * Similar scale to K-index coloring
 *
 * @param aIndex - A-index value
 * @returns Hex color code
 */
function getAIndexColor(aIndex: number): string {
  if (aIndex <= 7) return "#00ff88"; // Quiet - signal-green
  if (aIndex <= 15) return "#44dd66"; // Unsettled - good
  if (aIndex <= 29) return "#ffaa00"; // Active - caution-amber
  if (aIndex <= 49) return "#ff7700"; // Minor storm
  if (aIndex <= 99) return "#ff4455"; // Major storm - alert-red
  return "#ff0088"; // Severe storm
}

/**
 * Get description for A-index value
 *
 * @param aIndex - A-index value
 * @returns Human-readable description
 */
function getAIndexDescription(aIndex: number): string {
  if (aIndex <= 7) return "Quiet";
  if (aIndex <= 15) return "Unsettled";
  if (aIndex <= 29) return "Active";
  if (aIndex <= 49) return "Minor Storm";
  if (aIndex <= 99) return "Major Storm";
  return "Severe Storm";
}

/**
 * Get color for Sunspot Number
 * Uses blue tones as sunspots indicate solar activity
 *
 * @param ssn - Sunspot Number
 * @returns Hex color code
 */
function getSSNColor(ssn: number): string {
  if (ssn >= 150) return "#3a86ff"; // High activity - sunspot-blue
  if (ssn >= 100) return "#44ddff"; // Moderate - cosmic-cyan
  if (ssn >= 50) return "#44ddff"; // Low-moderate
  return "#888899"; // Low activity
}

/**
 * Get description for Sunspot Number
 *
 * @param ssn - Sunspot Number
 * @returns Human-readable description
 */
function getSSNDescription(ssn: number): string {
  if (ssn >= 150) return "Very Active";
  if (ssn >= 100) return "Active";
  if (ssn >= 50) return "Moderate";
  return "Quiet";
}

/**
 * PrimaryMetrics Component
 *
 * Displays a grid of 4 primary solar metrics: SFI, K-Index, SSN, and A-Index.
 * Responsive layout: 4 columns on desktop, 2 on tablet, 1 on mobile.
 *
 * @example
 * ```tsx
 * <PrimaryMetrics
 *   kIndex={2.3}
 *   solarFlux={145}
 *   sunspotNumber={120}
 *   aIndex={8}
 * />
 * ```
 */
export const PrimaryMetrics: React.FC<PrimaryMetricsProps> = ({
  kIndex,
  solarFlux,
  sunspotNumber,
  aIndex = 0,
  loading = false,
}) => {
  // Format values for display
  const formattedKIndex = kIndex.toFixed(1);
  const formattedSFI = Math.round(solarFlux);
  const formattedSSN = Math.round(sunspotNumber);
  const formattedAIndex = Math.round(aIndex);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {/* Solar Flux Index */}
      <MetricCard
        label="SOLAR FLUX"
        value={formattedSFI}
        unit="sfu"
        description={getSFIDescription(solarFlux)}
        color={getSFIColor(solarFlux)}
        delay={0}
        loading={loading}
      />

      {/* K-Index */}
      <MetricCard
        label="K-INDEX"
        value={formattedKIndex}
        unit="Kp"
        description={getKIndexDescription(kIndex)}
        color={getKIndexColor(kIndex)}
        delay={100}
        loading={loading}
      />

      {/* Sunspot Number */}
      <MetricCard
        label="SUNSPOT NUMBER"
        value={formattedSSN}
        unit="SSN"
        description={getSSNDescription(sunspotNumber)}
        color={getSSNColor(sunspotNumber)}
        delay={200}
        loading={loading}
      />

      {/* A-Index */}
      <MetricCard
        label="A-INDEX"
        value={formattedAIndex}
        unit="A"
        description={getAIndexDescription(aIndex)}
        color={getAIndexColor(aIndex)}
        delay={300}
        loading={loading}
      />
    </div>
  );
};

PrimaryMetrics.displayName = "PrimaryMetrics";

export default PrimaryMetrics;
