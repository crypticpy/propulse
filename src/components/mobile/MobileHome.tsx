/**
 * MobileHome - Mobile-optimized dashboard layout for the Home page.
 *
 * Receives the same data that Home.tsx derives from its hooks and renders
 * a single-column, touch-friendly layout.  Modals are NOT rendered here
 * -- the parent (Home.tsx) keeps them so overlays work at any viewport.
 */

import { PrimaryMetrics } from "@/components/solar/PrimaryMetrics";
import { PropagationIndex } from "@/components/solar/PropagationIndex";
import { BandConditions } from "@/components/solar/BandConditions";
import { ClusterPulseCard } from "@/components/dx/ClusterPulseCard";
import { LogStatsCard } from "@/components/dx/LogStatsCard";
import { PredictionsCard } from "@/components/dx/PredictionsCard";
import { HistoryCard } from "@/components/dx/HistoryCard";
import { BandVerdictPanel } from "@/components/dx/BandVerdictPanel";
import {
  AlertsSummary,
  ContestWeatherCard,
  MoonCard,
  WorldClocksCard,
  EnvironmentCard,
  DxpeditionsCard,
} from "@/components/dashboard";
import { DataFreshnessIndicator } from "@/components/ui";
import type { SolarFluxData, MagnetometerData } from "@/lib/api/types";

export interface MobileHomeProps {
  currentKp: number | null;
  currentFlux: number | null;
  currentSsn: number | null;
  currentBz: number | null;
  fluxData: SolarFluxData[] | undefined;
  magnetometerData: MagnetometerData[] | undefined;
  isLoading: boolean;
  metricLoadingStates: {
    kp: boolean;
    sfi: boolean;
    ssn: boolean;
    bz: boolean;
  };
  combinedUpdatedAt: number | undefined;
  isRefetching: boolean;
  refetchAll: () => void;
  onExpandPropagation: () => void;
  onExpandSummary: () => void;
  onExpandBands: () => void;
  onExpandCluster: () => void;
  onExpandLogStats: () => void;
  onExpandHistory: () => void;
}

export function MobileHome({
  currentKp,
  currentFlux,
  currentSsn,
  currentBz,
  fluxData,
  magnetometerData,
  isLoading,
  metricLoadingStates,
  combinedUpdatedAt,
  isRefetching,
  refetchAll,
  onExpandPropagation,
  onExpandSummary,
  onExpandBands,
  onExpandCluster,
  onExpandLogStats,
  onExpandHistory,
}: MobileHomeProps) {
  return (
    <div className="min-h-screen px-3">
      <main className="max-w-lg mx-auto py-3 space-y-4">
        {/* Compact freshness indicator */}
        <div className="flex justify-end">
          <DataFreshnessIndicator
            dataUpdatedAt={combinedUpdatedAt}
            onRefresh={refetchAll}
            isRefetching={isRefetching}
          />
        </div>

        {/* Alerts */}
        <AlertsSummary />

        {/* Contest Weather */}
        <ContestWeatherCard />

        {/* Band Conditions — what operators check first */}
        <BandConditions
          kIndex={currentKp}
          solarFlux={currentFlux}
          loading={isLoading}
          onExpand={onExpandBands}
        />

        {/* Global Conditions Score */}
        <PropagationIndex
          solarFlux={currentFlux}
          kIndex={currentKp}
          bz={currentBz}
          loading={isLoading}
          onExpand={onExpandPropagation}
          onExpandSummary={onExpandSummary}
        />

        {/* Solar Metrics */}
        <PrimaryMetrics
          kIndex={currentKp}
          solarFlux={currentFlux}
          sunspotNumber={currentSsn}
          bz={currentBz}
          bzData={
            magnetometerData?.map((d) => ({
              time_tag: d.time_tag,
              bz_gsm: d.bz_gsm,
            })) ?? []
          }
          loadingStates={metricLoadingStates}
          solarFluxData={
            fluxData?.map((d) => ({
              time_tag: d.time_tag,
              flux: d.flux,
            })) ?? []
          }
        />

        {/* Band Verdict */}
        <BandVerdictPanel />

        {/* Vertical stack of activity cards */}
        <div className="space-y-3">
          <ClusterPulseCard onClick={onExpandCluster} />
          <LogStatsCard onClick={onExpandLogStats} />
          <PredictionsCard />
          <HistoryCard onClick={onExpandHistory} />
        </div>

        {/* Sky & time (curated subset for mobile) */}
        <div className="space-y-3">
          <MoonCard />
          <WorldClocksCard />
          <EnvironmentCard />
          <DxpeditionsCard />
        </div>
      </main>
    </div>
  );
}
