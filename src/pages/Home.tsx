import { useCallback, useState } from "react";
import { useAllSolarData, useMagnetometer } from "@/hooks/useSolarData";
import { oldestKnownTimestamp } from "@/hooks/projectSolarResource";
import { useDXCluster } from "@/hooks/useDXCluster";
import { PrimaryMetrics } from "@/components/solar/PrimaryMetrics";
import { PropagationIndex } from "@/components/solar/PropagationIndex";
import { BandConditions } from "@/components/solar/BandConditions";
import { ClusterPulseCard } from "@/components/dx/ClusterPulseCard";
import { LogStatsCard } from "@/components/dx/LogStatsCard";
import { PredictionsCard } from "@/components/dx/PredictionsCard";
import { HistoryCard } from "@/components/dx/HistoryCard";
import { BandVerdictPanel } from "@/components/dx/BandVerdictPanel";
import {
  DashboardHeader,
  AlertsSummary,
  QuickActions,
  ContestWeatherCard,
  MoonCard,
  PlanetsCard,
  WorldClocksCard,
  CountdownsCard,
  TidesCard,
  EnvironmentCard,
  MetarCard,
  QthScopeCard,
  VolcanoCard,
  DxpeditionsCard,
  NewsFeedCard,
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
import { HelpTooltip } from "@/components/help/HelpTooltip";
import { NearbyActivityExplorer } from "@/components/activity/NearbyActivityExplorer";

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
    dataUpdatedAt,
    isRefetching,
    refetchAll,
  } = useAllSolarData();
  const magnetometerQuery = useMagnetometer();
  const {
    data: magnetometerData,
    dataUpdatedAt: magUpdatedAt,
    isLoading: magnetometerLoading,
    isRefetching: magnetometerRefetching,
    refetch: refetchMagnetometer,
  } = magnetometerQuery;

  // Ensure DX cluster spots are fetched for ClusterPulseCard
  useDXCluster();

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

  const combinedUpdatedAt = oldestKnownTimestamp([
    dataUpdatedAt,
    magUpdatedAt,
  ]);
  const coreLoading = kIndexQuery.isLoading || solarFluxQuery.isLoading;
  const metricLoadingStates = {
    kp: kIndexQuery.isLoading,
    sfi: solarFluxQuery.isLoading,
    ssn: sunspotQuery.isLoading,
    bz: magnetometerLoading,
  };
  const refreshAllVisible = useCallback(() => {
    refetchAll();
    void refetchMagnetometer();
  }, [refetchAll, refetchMagnetometer]);
  const refreshingVisible = isRefetching || magnetometerRefetching;

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
          isLoading={coreLoading}
          metricLoadingStates={metricLoadingStates}
          combinedUpdatedAt={combinedUpdatedAt}
          isRefetching={refreshingVisible}
          refetchAll={refreshAllVisible}
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
        <div className="flex items-center gap-2">
          <DashboardHeader dataUpdatedAt={combinedUpdatedAt} />
          <HelpTooltip
            section="dashboard"
            tooltip="Learn more about the Dashboard"
          />
        </div>

        <div className="flex justify-end -mt-3">
          <DataFreshnessIndicator
            dataUpdatedAt={combinedUpdatedAt}
            onRefresh={refreshAllVisible}
            isRefetching={refreshingVisible}
          />
        </div>

        {/* Section 2: Alerts Summary */}
        <AlertsSummary />

        {/* Section 2.5: Contest Weather */}
        <ContestWeatherCard />

        {/* Section 3: Band Conditions + Global Conditions Score */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <BandConditions
              kIndex={currentKp}
              solarFlux={currentFlux}
              loading={coreLoading}
              onExpand={() => setActiveModal("bands")}
            />
          </div>
          <PropagationIndex
            solarFlux={currentFlux}
            kIndex={currentKp}
            bz={currentBz}
            loading={coreLoading}
            onExpand={() => setActiveModal("propagation")}
            onExpandSummary={() => setActiveModal("summary")}
          />
        </div>

        {/* Section 4: Solar Metrics */}
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

        {/* Section 5: Four-column activity cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <ClusterPulseCard onClick={() => setActiveModal("cluster")} />
          <LogStatsCard onClick={() => setActiveModal("logStats")} />
          <PredictionsCard />
          <HistoryCard onClick={() => setActiveModal("history")} />
        </div>

        <NearbyActivityExplorer />

        {/* Section 6: Band Verdict */}
        <BandVerdictPanel />

        {/* Section 7: Sky & time */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <MoonCard />
          <PlanetsCard />
          <WorldClocksCard />
          <CountdownsCard />
        </div>

        {/* Section 7b: Local environment (E6) */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <QthScopeCard />
          <TidesCard />
          <EnvironmentCard />
          <MetarCard />
        </div>

        {/* Section 7c: DX news & watches (E6) */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <DxpeditionsCard />
          <NewsFeedCard />
          <VolcanoCard />
        </div>

        {/* Section 8: Quick Actions */}
        <QuickActions />
      </main>

      {/* Section 9: Detail Modals */}
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
