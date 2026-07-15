import React, { useState } from "react";
import { MetricCard } from "./MetricCard";
import { getKIndexColor, getKIndexDescription } from "@/lib/utils/bands";
import {
  SolarFluxModal,
  KIndexModal,
  SunspotModal,
  BzModal,
  type BzDataPoint,
} from "./modals";
import { SOLAR_TOOLTIPS } from "@/constants/tooltips";

export interface SolarFluxDataPoint {
  time_tag: string;
  flux: number;
}

export interface PrimaryMetricsProps {
  /** Current K-index value (0-9), null if unavailable */
  kIndex: number | null;
  /** Solar Flux Index (typically 70-300 sfu), null if unavailable */
  solarFlux: number | null;
  /** Daily sunspot number, null if unavailable */
  sunspotNumber: number | null;
  /** IMF Bz component in nT (null if unavailable) */
  bz?: number | null;
  /** Bz historical data for the modal chart */
  bzData?: BzDataPoint[];
  /** Show loading state */
  loading?: boolean;
  /** Per-product loading state; preferred over the compatibility fallback. */
  loadingStates?: {
    kp?: boolean;
    sfi?: boolean;
    ssn?: boolean;
    bz?: boolean;
  };
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
  if (sfi >= 150) {
    return "#00ff88";
  } // Excellent - signal-green
  if (sfi >= 100) {
    return "#ffaa00";
  } // Fair - caution-amber
  return "#ff4455"; // Poor - alert-red
}

/**
 * Get description for Solar Flux Index value
 *
 * @param sfi - Solar Flux Index value
 * @returns Human-readable description
 */
function getSFIDescription(sfi: number): string {
  if (sfi >= 200) {
    return "Very High";
  }
  if (sfi >= 150) {
    return "High";
  }
  if (sfi >= 100) {
    return "Moderate";
  }
  if (sfi >= 80) {
    return "Low";
  }
  return "Very Low";
}

/**
 * Get color for Sunspot Number
 * Uses blue tones as sunspots indicate solar activity
 *
 * @param ssn - Sunspot Number
 * @returns Hex color code
 */
function getSSNColor(ssn: number): string {
  if (ssn >= 150) {
    return "#3a86ff";
  } // High activity - sunspot-blue
  if (ssn >= 100) {
    return "#44ddff";
  } // Moderate - cosmic-cyan
  if (ssn >= 50) {
    return "#44ddff";
  } // Low-moderate
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
  if (bz === null) {
    return "#888899";
  } // No data
  if (bz > 0) {
    return "#00ff88";
  } // Northward - quiet - signal-green
  if (bz > -5) {
    return "#ffaa00";
  } // Weakly south - caution-amber
  return "#ff4455"; // Strongly south - alert-red
}

/**
 * Get description for IMF Bz value
 *
 * @param bz - Bz component in nT
 * @returns Human-readable description
 */
function getBzDescription(bz: number | null): string {
  if (bz === null) {
    return "No Data";
  }
  if (bz > 0) {
    return "Northward";
  }
  if (bz > -5) {
    return "Weakly South";
  }
  return "Southward";
}

/**
 * Get description for Sunspot Number
 *
 * @param ssn - Sunspot Number
 * @returns Human-readable description
 */
function getSSNDescription(ssn: number): string {
  if (ssn >= 150) {
    return "Very Active";
  }
  if (ssn >= 100) {
    return "Active";
  }
  if (ssn >= 50) {
    return "Moderate";
  }
  return "Low activity";
}

/**
 * PrimaryMetrics Component
 *
 * Displays current observed SFI, Kp, monthly SSN, and IMF Bz. The former
 * pseudo-current A-index card was removed; planetary A appears only in the
 * official forecast product on Solar Pulse.
 * Responsive layout: 4 columns on desktop, 2 on tablet, 1 on mobile.
 * Each metric card can be clicked to open a detailed modal.
 *
 * @example
 * ```tsx
 * <PrimaryMetrics
 *   kIndex={2.3}
 *   solarFlux={145}
 *   sunspotNumber={120}
 *   solarFluxData={[{ time_tag: '2024-01-01', flux: 120 }, ...]}
 * />
 * ```
 */
export const PrimaryMetrics: React.FC<PrimaryMetricsProps> = ({
  kIndex,
  solarFlux,
  sunspotNumber,
  bz = null,
  bzData = [],
  loading = false,
  loadingStates,
  solarFluxData = [],
}) => {
  // Modal state for each metric
  const [solarFluxModalOpen, setSolarFluxModalOpen] = useState(false);
  const [kIndexModalOpen, setKIndexModalOpen] = useState(false);
  const [sunspotModalOpen, setSunspotModalOpen] = useState(false);
  const [bzModalOpen, setBzModalOpen] = useState(false);

  // Format values for display
  const formattedKIndex = kIndex !== null ? kIndex.toFixed(1) : "—";
  const formattedSFI = solarFlux !== null ? Math.round(solarFlux) : "—";
  const formattedSSN = sunspotNumber !== null ? Math.round(sunspotNumber) : "—";
  const formattedBz = bz !== null ? bz.toFixed(1) : "N/A";

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Solar Flux Index */}
        <MetricCard
          label="SOLAR FLUX"
          value={formattedSFI}
          unit="sfu"
          description={
            solarFlux !== null ? getSFIDescription(solarFlux) : "No Data"
          }
          color={solarFlux !== null ? getSFIColor(solarFlux) : "#888899"}
          delay={0}
          loading={loadingStates?.sfi ?? loading}
          onClick={() => setSolarFluxModalOpen(true)}
          tooltip={SOLAR_TOOLTIPS.sfi}
        />

        {/* K-Index */}
        <MetricCard
          label="K-INDEX"
          value={formattedKIndex}
          unit="Kp"
          description={
            kIndex !== null ? getKIndexDescription(kIndex) : "No Data"
          }
          color={kIndex !== null ? getKIndexColor(kIndex) : "#888899"}
          delay={100}
          loading={loadingStates?.kp ?? loading}
          onClick={() => setKIndexModalOpen(true)}
          tooltip={SOLAR_TOOLTIPS.kIndex}
        />

        {/* Sunspot Number */}
        <MetricCard
          label="SUNSPOT NUMBER"
          value={formattedSSN}
          unit="SSN"
          description={
            sunspotNumber !== null
              ? getSSNDescription(sunspotNumber)
              : "No Data"
          }
          color={
            sunspotNumber !== null ? getSSNColor(sunspotNumber) : "#888899"
          }
          delay={200}
          loading={loadingStates?.ssn ?? loading}
          onClick={() => setSunspotModalOpen(true)}
          tooltip={SOLAR_TOOLTIPS.ssn}
        />

        {/* IMF Bz */}
        <MetricCard
          label="IMF Bz"
          value={formattedBz}
          unit="nT"
          description={getBzDescription(bz)}
          color={getBzColor(bz)}
          delay={300}
          loading={loadingStates?.bz ?? loading}
          onClick={() => setBzModalOpen(true)}
          tooltip={SOLAR_TOOLTIPS.bz}
        />
      </div>

      {/* Modals */}
      {solarFlux !== null && (
        <SolarFluxModal
          isOpen={solarFluxModalOpen}
          onClose={() => setSolarFluxModalOpen(false)}
          currentValue={Math.round(solarFlux)}
          data={solarFluxData}
        />
      )}

      {kIndex !== null && (
        <KIndexModal
          isOpen={kIndexModalOpen}
          onClose={() => setKIndexModalOpen(false)}
          currentValue={kIndex}
        />
      )}

      {sunspotNumber !== null && (
        <SunspotModal
          isOpen={sunspotModalOpen}
          onClose={() => setSunspotModalOpen(false)}
          currentValue={Math.round(sunspotNumber)}
        />
      )}

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
