import { useEffect } from "react";
import {
  PrimaryMetrics,
  SolarSummary,
  BandConditions,
  KIndexChart,
  FlareProbability,
  SolarFluxChart,
  EventAlert,
} from "@/components/solar";
import {
  useKIndex,
  useSolarFlux,
  useProbabilities,
  useSunspots,
} from "@/hooks/useSolarData";
import { useSolarStore } from "@/stores/solarStore";

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

  // Store state
  const { setLastUpdate, setIsLive } = useSolarStore();

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

  const isLoading = kLoading || fluxLoading || probLoading || sunspotLoading;

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
          aIndex={Math.round(currentKp * 4)} // Approximate A from Kp
          loading={isLoading}
        />

        {/* Summary */}
        <SolarSummary
          kIndex={currentKp}
          solarFlux={currentFlux}
          loading={isLoading}
        />

        {/* Two-column layout for charts */}
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
          />

          {/* Solar Flux Chart */}
          <SolarFluxChart
            data={
              fluxData?.map((d) => ({
                time_tag: d.time_tag,
                flux: d.flux,
              })) ?? []
            }
            loading={fluxLoading}
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
          />

          {/* Band Conditions */}
          <BandConditions
            kIndex={currentKp}
            solarFlux={currentFlux}
            loading={isLoading}
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
    </div>
  );
}
