import { useEffect, useState } from "react";
import {
  PrimaryMetrics,
  SolarSummary,
  BandConditions,
  KIndexChart,
  AIndexChart,
  BzChart,
  FlareProbability,
  SolarFluxChart,
  EventAlert,
  PropagationIndex,
  KIndexChartModal,
  AIndexChartModal,
  BzChartModal,
  SolarFluxChartModal,
  SolarSummaryModal,
  FlareProbabilityModal,
  BandConditionsModal,
  PropagationIndexModal,
} from "@/components/solar";
import {
  useKIndex,
  useSolarFlux,
  useProbabilities,
  useSunspots,
  useMagnetometer,
} from "@/hooks/useSolarData";
import { useSolarStore } from "@/stores/solarStore";
import { kpToAp } from "@/lib/utils/solarConversions";

export function SolarPulse() {
  // Fetch all solar data
  const {
    data: kIndexData,
    isLoading: kLoading,
    isError: kError,
  } = useKIndex();
  const { data: fluxData, isLoading: fluxLoading } = useSolarFlux();
  const { data: probData, isLoading: probLoading } = useProbabilities();
  const { data: sunspotData, isLoading: sunspotLoading } = useSunspots();
  const { data: magnetometerData, isLoading: magLoading } = useMagnetometer();

  // Store state
  const { setLastUpdate, setIsLive } = useSolarStore();

  // Modal states for chart/summary modals
  const [kIndexChartOpen, setKIndexChartOpen] = useState(false);
  const [aIndexChartOpen, setAIndexChartOpen] = useState(false);
  const [bzChartOpen, setBzChartOpen] = useState(false);
  const [solarFluxChartOpen, setSolarFluxChartOpen] = useState(false);
  const [propagationIndexOpen, setPropagationIndexOpen] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [flareProbOpen, setFlareProbOpen] = useState(false);
  const [bandConditionsOpen, setBandConditionsOpen] = useState(false);

  // Update store when data changes
  useEffect(() => {
    if (kIndexData && !kError) {
      setLastUpdate(new Date());
      setIsLive(true);
    } else if (kError) {
      setIsLive(false);
    }
  }, [kIndexData, kError, setLastUpdate, setIsLive]);

  // Extract current values
  const currentKp = kIndexData?.[kIndexData.length - 1]?.kp_index ?? 3;
  const currentFlux = fluxData?.[fluxData.length - 1]?.flux ?? 100;
  const currentSsn = sunspotData?.[sunspotData.length - 1]?.ssn ?? 0;
  const currentBz =
    magnetometerData
      ?.slice()
      .reverse()
      .find((d) => typeof d.bz_gsm === "number" && Number.isFinite(d.bz_gsm))
      ?.bz_gsm ?? null;

  const isLoading =
    kLoading || fluxLoading || probLoading || sunspotLoading || magLoading;

  return (
    <div className="min-h-screen">
      {/* Main content */}
      <main className="max-w-7xl mx-auto p-4 md:p-6 space-y-6">
        {/* Event Alert (conditional) */}
        <EventAlert
          eventType={null} // TODO: detect from X-ray data
          severity="minor"
          message=""
        />

        {/* Primary Metrics */}
        <PrimaryMetrics
          kIndex={currentKp}
          solarFlux={currentFlux}
          sunspotNumber={currentSsn}
          aIndex={kpToAp(currentKp)}
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

        {/* Propagation Index - Hero Metric */}
        <PropagationIndex
          solarFlux={currentFlux}
          kIndex={currentKp}
          bz={currentBz}
          loading={isLoading}
          onExpand={() => setPropagationIndexOpen(true)}
        />

        {/* Summary */}
        <SolarSummary
          kIndex={currentKp}
          solarFlux={currentFlux}
          loading={isLoading}
          onExpand={() => setSummaryOpen(true)}
        />

        {/* Two-column layout for K-index and A-index charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* K-Index Chart */}
          <KIndexChart
            data={
              kIndexData?.map((d) => ({
                time_tag: d.time_tag,
                kp_index: d.kp_index,
              })) ?? []
            }
            loading={kLoading}
            onExpand={() => setKIndexChartOpen(true)}
          />

          {/* A-Index Chart */}
          <AIndexChart
            data={
              kIndexData?.map((d) => ({
                time_tag: d.time_tag,
                kp_index: d.kp_index,
              })) ?? []
            }
            loading={kLoading}
            onExpand={() => setAIndexChartOpen(true)}
          />
        </div>

        {/* Two-column layout for Solar Flux and IMF Bz */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Solar Flux Chart */}
          <SolarFluxChart
            data={
              fluxData?.map((d) => ({
                time_tag: d.time_tag,
                flux: d.flux,
              })) ?? []
            }
            loading={fluxLoading}
            onExpand={() => setSolarFluxChartOpen(true)}
          />

          {/* IMF Bz Chart */}
          <BzChart
            data={
              magnetometerData
                ?.flatMap((d) =>
                  typeof d.bz_gsm === "number" && Number.isFinite(d.bz_gsm)
                    ? [{ time_tag: d.time_tag, bz_gsm: d.bz_gsm }]
                    : [],
                ) ?? []
            }
            loading={magLoading}
            onExpand={() => setBzChartOpen(true)}
          />
        </div>

        {/* Two-column layout for probability and bands */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Flare Probability */}
          <FlareProbability
            cProb={probData?.c_prob ?? 0}
            mProb={probData?.m_prob ?? 0}
            xProb={probData?.x_prob ?? 0}
            protonProb={probData?.proton_prob ?? 0}
            loading={probLoading}
            onExpand={() => setFlareProbOpen(true)}
          />

          {/* Band Conditions */}
          <BandConditions
            kIndex={currentKp}
            solarFlux={currentFlux}
            loading={isLoading}
            onExpand={() => setBandConditionsOpen(true)}
          />
        </div>
      </main>

      {/* Footer */}
      <footer className="max-w-7xl mx-auto px-4 md:px-6 py-8 text-center text-xs text-gray-500">
        <p>
          Data sourced from{" "}
          <a
            href="https://www.swpc.noaa.gov/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-plasma-orange hover:underline"
          >
            NOAA Space Weather Prediction Center
          </a>
        </p>
        <p className="mt-1">Propulse — The ionosphere, visualized</p>
      </footer>

      {/* Chart/Summary Modals */}
      <KIndexChartModal
        isOpen={kIndexChartOpen}
        onClose={() => setKIndexChartOpen(false)}
        data={
          kIndexData?.map((d) => ({
            time_tag: d.time_tag,
            kp_index: d.kp_index,
          })) ?? []
        }
      />

      <AIndexChartModal
        isOpen={aIndexChartOpen}
        onClose={() => setAIndexChartOpen(false)}
        data={
          kIndexData?.map((d) => ({
            time_tag: d.time_tag,
            kp_index: d.kp_index,
          })) ?? []
        }
      />

      <BzChartModal
        isOpen={bzChartOpen}
        onClose={() => setBzChartOpen(false)}
        data={
          magnetometerData
            ?.flatMap((d) =>
              typeof d.bz_gsm === "number" && Number.isFinite(d.bz_gsm)
                ? [{ time_tag: d.time_tag, bz_gsm: d.bz_gsm }]
                : [],
            ) ?? []
        }
      />

      <SolarFluxChartModal
        isOpen={solarFluxChartOpen}
        onClose={() => setSolarFluxChartOpen(false)}
        data={
          fluxData?.map((d) => ({
            time_tag: d.time_tag,
            flux: d.flux,
          })) ?? []
        }
      />

      <SolarSummaryModal
        isOpen={summaryOpen}
        onClose={() => setSummaryOpen(false)}
        kIndex={currentKp}
        solarFlux={currentFlux}
      />

      <PropagationIndexModal
        isOpen={propagationIndexOpen}
        onClose={() => setPropagationIndexOpen(false)}
        solarFlux={currentFlux}
        kIndex={currentKp}
        bz={currentBz}
      />

      <FlareProbabilityModal
        isOpen={flareProbOpen}
        onClose={() => setFlareProbOpen(false)}
        cProb={probData?.c_prob ?? 0}
        mProb={probData?.m_prob ?? 0}
        xProb={probData?.x_prob ?? 0}
        protonProb={probData?.proton_prob ?? 0}
      />

      <BandConditionsModal
        isOpen={bandConditionsOpen}
        onClose={() => setBandConditionsOpen(false)}
        kIndex={currentKp}
        solarFlux={currentFlux}
      />
    </div>
  );
}
