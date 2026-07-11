import React, { useState } from "react";
import { MetricCard } from "./MetricCard";
import { getKIndexColor, getKIndexDescription } from "@/lib/utils/bands";
import {
  SolarFluxModal,
  KIndexModal,
  SunspotModal,
  AIndexModal,
  BzModal,
  type BzDataPoint,
} from "./modals";

export interface SolarFluxDataPoint {
  time_tag: string;
  flux: number;
}

export interface PrimaryMetricsProps {
  /** Current K-index value (0-9) */
  kIndex: number;
  /** Solar Flux Index (typically 70-300 sfu) */
  solarFlux: number;
  /** Daily sunspot number */
  sunspotNumber: number;
  /** A-index (24-hour geomagnetic activity) */
  aIndex?: number;
  /** IMF Bz component in nT (null if unavailable) */
  bz?: number | null;
  /** Bz historical data for the modal chart */
  bzData?: BzDataPoint[];
  /** Show loading state */
  loading?: boolean;
  /** Solar flux historical data for the modal chart */
  solarFluxData?: SolarFluxDataPoint[];
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
 * Get color for IMF Bz value
 * Northward (positive) is quiet, southward (negative) is active
 *
 * @param bz - Bz component in nT
 * @returns Hex color code
 */
function getBzColor(bz: number | null): string {
  if (bz === null) return "#888899"; // No data
  if (bz > 0) return "#00ff88"; // Northward - quiet - signal-green
  if (bz > -5) return "#ffaa00"; // Weakly south - caution-amber
  return "#ff4455"; // Strongly south - alert-red
}

/**
 * Get description for IMF Bz value
 *
 * @param bz - Bz component in nT
 * @returns Human-readable description
 */
function getBzDescription(bz: number | null): string {
  if (bz === null) return "No Data";
  if (bz > 0) return "Northward";
  if (bz > -5) return "Weakly South";
  return "Southward";
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
 * Each metric card can be clicked to open a detailed modal.
 *
 * @example
 * ```tsx
 * <PrimaryMetrics
 *   kIndex={2.3}
 *   solarFlux={145}
 *   sunspotNumber={120}
 *   aIndex={8}
 *   solarFluxData={[{ time_tag: '2024-01-01', flux: 120 }, ...]}
 * />
 * ```
 */
export const PrimaryMetrics: React.FC<PrimaryMetricsProps> = ({
  kIndex,
  solarFlux,
  sunspotNumber,
  aIndex = 0,
  bz = null,
  bzData = [],
  loading = false,
  solarFluxData = [],
}) => {
  // Modal state for each metric
  const [solarFluxModalOpen, setSolarFluxModalOpen] = useState(false);
  const [kIndexModalOpen, setKIndexModalOpen] = useState(false);
  const [sunspotModalOpen, setSunspotModalOpen] = useState(false);
  const [aIndexModalOpen, setAIndexModalOpen] = useState(false);
  const [bzModalOpen, setBzModalOpen] = useState(false);

  // Format values for display
  const formattedKIndex = kIndex.toFixed(1);
  const formattedSFI = Math.round(solarFlux);
  const formattedSSN = Math.round(sunspotNumber);
  const formattedAIndex = Math.round(aIndex);
  const formattedBz = bz !== null ? bz.toFixed(1) : "N/A";

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {/* Solar Flux Index */}
        <MetricCard
          label="SOLAR FLUX"
          value={formattedSFI}
          unit="sfu"
          description={getSFIDescription(solarFlux)}
          color={getSFIColor(solarFlux)}
          delay={0}
          loading={loading}
          onClick={() => setSolarFluxModalOpen(true)}
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
          onClick={() => setKIndexModalOpen(true)}
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
          onClick={() => setSunspotModalOpen(true)}
        />

        {/* Ap Equivalent (instantaneous, not 24hr average) */}
        <MetricCard
          label="Ap (INSTANT)"
          value={formattedAIndex}
          unit="Ap"
          description={getAIndexDescription(aIndex)}
          color={getAIndexColor(aIndex)}
          delay={300}
          loading={loading}
          onClick={() => setAIndexModalOpen(true)}
        />

        {/* IMF Bz */}
        <MetricCard
          label="IMF Bz"
          value={formattedBz}
          unit="nT"
          description={getBzDescription(bz)}
          color={getBzColor(bz)}
          delay={400}
          loading={loading}
          onClick={() => setBzModalOpen(true)}
        />
      </div>

      {/* Modals */}
      <SolarFluxModal
        isOpen={solarFluxModalOpen}
        onClose={() => setSolarFluxModalOpen(false)}
        currentValue={Math.round(solarFlux)}
        data={solarFluxData}
      />

      <KIndexModal
        isOpen={kIndexModalOpen}
        onClose={() => setKIndexModalOpen(false)}
        currentValue={kIndex}
      />

      <SunspotModal
        isOpen={sunspotModalOpen}
        onClose={() => setSunspotModalOpen(false)}
        currentValue={Math.round(sunspotNumber)}
      />

      <AIndexModal
        isOpen={aIndexModalOpen}
        onClose={() => setAIndexModalOpen(false)}
        currentValue={aIndex}
        kIndex={kIndex}
      />

      <BzModal
        isOpen={bzModalOpen}
        onClose={() => setBzModalOpen(false)}
        currentValue={bz}
        data={bzData}
      />
    </>
  );
};

PrimaryMetrics.displayName = "PrimaryMetrics";

export default PrimaryMetrics;
