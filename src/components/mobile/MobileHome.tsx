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
import { AlertsSummary } from "@/components/dashboard";
import { DataFreshnessIndicator } from "@/components/ui";
import { kpToAp } from "@/lib/utils/solarConversions";
import type { SolarFluxData, MagnetometerData } from "@/lib/api/types";

export interface MobileHomeProps {
  currentKp: number | null;
  currentFlux: number | null;
  currentSsn: number | null;
  currentBz: number | null;
  fluxData: SolarFluxData[] | undefined;
  magnetometerData: MagnetometerData[] | undefined;
  isLoading: boolean;
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

        {/* Primary Metrics - full width, card-like */}
        <PrimaryMetrics
          kIndex={currentKp}
          solarFlux={currentFlux}
          sunspotNumber={currentSsn}
          aIndex={currentKp !== null ? kpToAp(currentKp) : undefined}
          bz={currentBz}
          bzData={
            magnetometerData?.map((d) => ({
              time_tag: d.time_tag,
              bz_gsm: d.bz_gsm,
            })) ?? []
          }
          loading={isLoading}
          solarFluxData={
            fluxData?.map((d) => ({
              time_tag: d.time_tag,
              flux: d.flux,
            })) ?? []
          }
        />

        {/* Horizontal scrollable row: Propagation (with summary), Bands */}
        <div className="flex overflow-x-auto gap-3 snap-x snap-mandatory -mx-3 px-3 pb-2 scrollbar-thin">
          <div className="min-w-[280px] flex-shrink-0 snap-start">
            <PropagationIndex
              solarFlux={currentFlux}
              kIndex={currentKp}
              bz={currentBz}
              loading={isLoading}
              onExpand={onExpandPropagation}
              onExpandSummary={onExpandSummary}
            />
          </div>
          <div className="min-w-[280px] flex-shrink-0 snap-start">
            <BandConditions
              kIndex={currentKp}
              solarFlux={currentFlux}
              loading={isLoading}
              onExpand={onExpandBands}
            />
          </div>
        </div>

        {/* Vertical stack of activity cards */}
        <div className="space-y-3">
          <ClusterPulseCard onClick={onExpandCluster} />
          <LogStatsCard onClick={onExpandLogStats} />
          <PredictionsCard />
          <HistoryCard onClick={onExpandHistory} />
        </div>
      </main>
    </div>
  );
}
