import { useState } from "react";
import { useAllSolarData, useMagnetometer } from "@/hooks/useSolarData";
import { kpToAp } from "@/lib/utils/solarConversions";
import { PrimaryMetrics } from "@/components/solar/PrimaryMetrics";
import { PropagationIndex } from "@/components/solar/PropagationIndex";
import { SolarSummary } from "@/components/solar/SolarSummary";
import { BandConditions } from "@/components/solar/BandConditions";
import { ClusterPulseCard } from "@/components/dx/ClusterPulseCard";
import { LogStatsCard } from "@/components/dx/LogStatsCard";
import { PredictionsCard } from "@/components/dx/PredictionsCard";
import { HistoryCard } from "@/components/dx/HistoryCard";
import {
  DashboardHeader,
  AlertsSummary,
  QuickActions,
} from "@/components/dashboard";
import { DataFreshnessIndicator } from "@/components/ui";
import { PropagationIndexModal } from "@/components/solar/modals/PropagationIndexModal";
import { SolarSummaryModal } from "@/components/solar/modals/SolarSummaryModal";
import { BandConditionsModal } from "@/components/solar/modals/BandConditionsModal";
import { ClusterPulseDetailModal } from "@/components/dx/modals/ClusterPulseDetailModal";
import { LogStatsDetailModal } from "@/components/dx/modals/LogStatsDetailModal";
import { HistoryDetailModal } from "@/components/dx/modals/HistoryDetailModal";
import { useIsMobile } from "@/hooks/useIsMobile";
import { MobileHome } from "@/components/mobile/MobileHome";

type ActiveModal =
  | "propagation"
  | "summary"
  | "bands"
  | "cluster"
  | "logStats"
  | "history"
  | null;

export function Home() {
  const isMobile = useIsMobile();
  const [activeModal, setActiveModal] = useState<ActiveModal>(null);

  // --- Data fetching (same pattern as SolarPulse.tsx) ---
  const {
    kIndex: kIndexQuery,
    solarFlux: solarFluxQuery,
    sunspots: sunspotQuery,
    isLoading,
    dataUpdatedAt,
    isRefetching,
    refetchAll,
  } = useAllSolarData();
  const { data: magnetometerData, dataUpdatedAt: magUpdatedAt } =
    useMagnetometer();

  const kIndexData = kIndexQuery.data;
  const fluxData = solarFluxQuery.data;
  const sunspotData = sunspotQuery.data;

  const currentKp = kIndexData?.[kIndexData.length - 1]?.kp_index ?? null;
  const currentFlux = fluxData?.[fluxData.length - 1]?.flux ?? null;
  const currentSsn = sunspotData?.[sunspotData.length - 1]?.ssn ?? null;
  const currentBz =
    magnetometerData
      ?.slice()
      .reverse()
      .find((d) => typeof d.bz_gsm === "number" && Number.isFinite(d.bz_gsm))
      ?.bz_gsm ?? null;

  const combinedUpdatedAt =
    Math.max(dataUpdatedAt || 0, magUpdatedAt || 0) || undefined;

  if (isMobile) {
    return (
      <>
        <MobileHome
          currentKp={currentKp}
          currentFlux={currentFlux}
          currentSsn={currentSsn}
          currentBz={currentBz}
          fluxData={fluxData}
          magnetometerData={magnetometerData}
          isLoading={isLoading}
          combinedUpdatedAt={combinedUpdatedAt}
          isRefetching={isRefetching}
          refetchAll={refetchAll}
          onExpandPropagation={() => setActiveModal("propagation")}
          onExpandSummary={() => setActiveModal("summary")}
          onExpandBands={() => setActiveModal("bands")}
          onExpandCluster={() => setActiveModal("cluster")}
          onExpandLogStats={() => setActiveModal("logStats")}
          onExpandHistory={() => setActiveModal("history")}
        />
        {/* Modals render as overlays — keep in parent */}
        <PropagationIndexModal
          isOpen={activeModal === "propagation"}
          onClose={() => setActiveModal(null)}
          solarFlux={currentFlux}
          kIndex={currentKp}
          bz={currentBz}
        />
        <SolarSummaryModal
          isOpen={activeModal === "summary"}
          onClose={() => setActiveModal(null)}
          kIndex={currentKp}
          solarFlux={currentFlux}
        />
        <BandConditionsModal
          isOpen={activeModal === "bands"}
          onClose={() => setActiveModal(null)}
          kIndex={currentKp}
          solarFlux={currentFlux}
        />
        <ClusterPulseDetailModal
          isOpen={activeModal === "cluster"}
          onClose={() => setActiveModal(null)}
        />
        <LogStatsDetailModal
          isOpen={activeModal === "logStats"}
          onClose={() => setActiveModal(null)}
        />
        <HistoryDetailModal
          isOpen={activeModal === "history"}
          onClose={() => setActiveModal(null)}
        />
      </>
    );
  }

  return (
    <div className="min-h-screen px-4">
      <main className="max-w-7xl mx-auto py-4 space-y-6">
        {/* Section 1: Dashboard Header */}
        <DashboardHeader dataUpdatedAt={combinedUpdatedAt} />

        <div className="flex justify-end -mt-3">
          <DataFreshnessIndicator
            dataUpdatedAt={combinedUpdatedAt}
            onRefresh={refetchAll}
            isRefetching={isRefetching}
          />
        </div>

        {/* Section 2: Alerts Summary */}
        <AlertsSummary />

        {/* Section 3: Primary Solar Metrics */}
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

        {/* Section 4: Three-column operational view */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <PropagationIndex
            solarFlux={currentFlux}
            kIndex={currentKp}
            bz={currentBz}
            loading={isLoading}
            onExpand={() => setActiveModal("propagation")}
          />
          <SolarSummary
            kIndex={currentKp}
            solarFlux={currentFlux}
            loading={isLoading}
            onExpand={() => setActiveModal("summary")}
          />
          <BandConditions
            kIndex={currentKp}
            solarFlux={currentFlux}
            loading={isLoading}
            onExpand={() => setActiveModal("bands")}
          />
        </div>

        {/* Section 5: Four-column activity cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <ClusterPulseCard onClick={() => setActiveModal("cluster")} />
          <LogStatsCard onClick={() => setActiveModal("logStats")} />
          <PredictionsCard />
          <HistoryCard onClick={() => setActiveModal("history")} />
        </div>

        {/* Section 6: Quick Actions */}
        <QuickActions />
      </main>

      {/* Section 7: Detail Modals */}
      <PropagationIndexModal
        isOpen={activeModal === "propagation"}
        onClose={() => setActiveModal(null)}
        solarFlux={currentFlux}
        kIndex={currentKp}
        bz={currentBz}
      />
      <SolarSummaryModal
        isOpen={activeModal === "summary"}
        onClose={() => setActiveModal(null)}
        kIndex={currentKp}
        solarFlux={currentFlux}
      />
      <BandConditionsModal
        isOpen={activeModal === "bands"}
        onClose={() => setActiveModal(null)}
        kIndex={currentKp}
        solarFlux={currentFlux}
      />
      <ClusterPulseDetailModal
        isOpen={activeModal === "cluster"}
        onClose={() => setActiveModal(null)}
      />
      <LogStatsDetailModal
        isOpen={activeModal === "logStats"}
        onClose={() => setActiveModal(null)}
      />
      <HistoryDetailModal
        isOpen={activeModal === "history"}
        onClose={() => setActiveModal(null)}
      />
    </div>
  );
}
