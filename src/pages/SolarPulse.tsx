import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
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
import { formatUTC } from "@/lib/utils/time";

export function SolarPulse() {
  const [currentTime, setCurrentTime] = useState(new Date());

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

  // Update current time every second
  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

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
      {/* Header */}
      <header className="glass-panel sticky top-0 z-50 px-4 md:px-8 py-4 md:py-5">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-3 md:gap-4">
            <Link to="/" className="text-3xl md:text-4xl animate-pulse-glow">
              ☀️
            </Link>
            <div>
              <h1 className="font-orbitron text-xl md:text-2xl font-black text-gradient-orange tracking-wider">
                SOLAR PULSE
              </h1>
              <p className="text-[10px] md:text-xs text-gray-500 uppercase tracking-wider">
                Real-time solar conditions
              </p>
            </div>
          </div>
          <div className="text-right">
            <div className="font-mono text-base md:text-lg text-signal-green font-semibold">
              {formatUTC(currentTime)}
            </div>
            <div className="text-[10px] md:text-xs text-gray-500">
              {kError ? "Demo data" : "Live updates"}
            </div>
          </div>
        </div>
      </header>

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

          {/* Band Conditions - takes more space on larger screens */}
          <div className="lg:col-span-1">
            <BandConditions
              kIndex={currentKp}
              solarFlux={currentFlux}
              loading={isLoading}
            />
          </div>
        </div>

        {/* Full-width band conditions on desktop for better readability */}
        <div className="hidden xl:block">
          {/* Reserved for future expanded view */}
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
