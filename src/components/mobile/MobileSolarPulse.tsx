/**
 * MobileSolarPulse - Mobile-optimized layout for the SolarPulse page.
 *
 * Uses native `<details>/<summary>` accordion sections to pack all key solar
 * data into a scrollable single-column view.  Skips SWPC image galleries,
 * DraggablePanel, and ModelAccuracyPanel (desktop-oriented features).
 */

import { PrimaryMetrics } from "@/components/solar/PrimaryMetrics";
import { PropagationIndex } from "@/components/solar/PropagationIndex";
import { SolarSummary } from "@/components/solar/SolarSummary";
import { BandConditions } from "@/components/solar/BandConditions";
import { KIndexChart } from "@/components/solar/KIndexChart";
import { SolarFluxChart } from "@/components/solar/SolarFluxChart";
import { BzChart } from "@/components/solar/BzChart";
import { FlareProbability } from "@/components/solar/FlareProbability";
import { SolarCycleContext } from "@/components/solar/SolarCycleContext";
import { DataFreshnessIndicator } from "@/components/ui";
import { kpToAp } from "@/lib/utils/solarConversions";
import {
  useProtonFlux,
  useDstIndex,
  useFluxForecast,
} from "@/hooks/useSolarExpanded";
import { CMEAnalysisPanel } from "@/components/solar/CMEAnalysisPanel";
import type {
  KIndexData,
  SolarFluxData,
  SolarProbabilities,
  MagnetometerData,
} from "@/lib/api/types";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface MobileSolarPulseProps {
  // Current scalar values
  currentKp: number | null;
  currentFlux: number | null;
  currentSsn: number | null;
  currentBz: number | null;

  // Raw query data arrays
  kIndexData: KIndexData[] | undefined;
  fluxData: SolarFluxData[] | undefined;
  magnetometerData: MagnetometerData[] | undefined;
  probData: SolarProbabilities | undefined;

  // Loading / fetching flags
  isLoading: boolean;
  kLoading: boolean;
  fluxLoading: boolean;
  magLoading: boolean;
  probLoading: boolean;

  // Freshness
  solarDataUpdatedAt: number | undefined;
  solarIsRefetching: boolean;
  refetchAllSolar: () => void;

  // Expand callbacks (open modals in parent)
  onExpandPropagation: () => void;
  onExpandSummary: () => void;
  onExpandBandConditions: () => void;
  onExpandKIndexChart: () => void;
  onExpandSolarFluxChart: () => void;
  onExpandBzChart: () => void;
  onExpandFlareProb: () => void;
}

// ---------------------------------------------------------------------------
// Chevron icon shared by every accordion header
// ---------------------------------------------------------------------------

function ChevronDown() {
  return (
    <svg
      className="w-4 h-4 text-gray-400 transition-transform group-open:rotate-180"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      viewBox="0 0 24 24"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function MobileSolarPulse({
  currentKp,
  currentFlux,
  currentSsn,
  currentBz,
  kIndexData,
  fluxData,
  magnetometerData,
  probData,
  isLoading,
  kLoading,
  fluxLoading,
  magLoading,
  probLoading,
  solarDataUpdatedAt,
  solarIsRefetching,
  refetchAllSolar,
  onExpandPropagation,
  onExpandSummary,
  onExpandBandConditions,
  onExpandKIndexChart,
  onExpandSolarFluxChart,
  onExpandBzChart,
  onExpandFlareProb,
}: MobileSolarPulseProps) {
  // --- Expanded solar data hooks ---
  const { data: protonFluxData, isLoading: protonLoading } = useProtonFlux();
  const { data: dstIndexData, isLoading: dstLoading } = useDstIndex();
  // CME data is fetched internally by CMEAnalysisPanel
  const { data: fluxForecastData, isLoading: forecastLoading } =
    useFluxForecast();

  // --- Proton flux derived ---
  const latestProton = protonFluxData?.[protonFluxData.length - 1] ?? null;
  const protonPfu = latestProton?.flux ?? null;
  const protonSScale =
    protonPfu === null
      ? null
      : protonPfu >= 100_000
        ? "S5"
        : protonPfu >= 10_000
          ? "S4"
          : protonPfu >= 1_000
            ? "S3"
            : protonPfu >= 100
              ? "S2"
              : protonPfu >= 10
                ? "S1"
                : null;
  const protonColor =
    protonPfu === null
      ? "text-gray-500"
      : protonPfu >= 1_000
        ? "text-alert-red"
        : protonPfu >= 100
          ? "text-plasma-orange"
          : protonPfu >= 10
            ? "text-caution-amber"
            : "text-signal-green";

  // --- Dst index derived ---
  const latestDst = dstIndexData?.[dstIndexData.length - 1] ?? null;
  const dstValue = latestDst?.dst ?? null;
  const dstClassification =
    dstValue === null
      ? null
      : dstValue < -200
        ? "Severe Storm"
        : dstValue < -100
          ? "Storm"
          : dstValue < -50
            ? "Active"
            : dstValue < -30
              ? "Moderate"
              : "Quiet";
  const dstColor =
    dstValue === null
      ? "text-gray-500"
      : dstValue < -100
        ? "text-alert-red"
        : dstValue < -50
          ? "text-plasma-orange"
          : dstValue < -30
            ? "text-caution-amber"
            : "text-signal-green";

  // --- Forecast derived ---
  const forecastDays = fluxForecastData?.forecast ?? [];
  const sfiColor = (sfi: number) =>
    sfi > 100
      ? "text-signal-green"
      : sfi > 80
        ? "text-caution-amber"
        : sfi > 70
          ? "text-plasma-orange"
          : "text-alert-red";

  // Mapped chart data (same transforms SolarPulse.tsx uses inline)
  const kChartData =
    kIndexData?.map((d) => ({ time_tag: d.time_tag, kp_index: d.kp_index })) ??
    [];

  const fluxChartData =
    fluxData?.map((d) => ({ time_tag: d.time_tag, flux: d.flux })) ?? [];

  const bzChartData =
    magnetometerData?.flatMap((d) =>
      typeof d.bz_gsm === "number" && Number.isFinite(d.bz_gsm)
        ? [{ time_tag: d.time_tag, bz_gsm: d.bz_gsm }]
        : [],
    ) ?? [];

  const bzMapData =
    magnetometerData?.map((d) => ({
      time_tag: d.time_tag,
      bz_gsm: d.bz_gsm,
    })) ?? [];

  const fluxMapData =
    fluxData?.map((d) => ({ time_tag: d.time_tag, flux: d.flux })) ?? [];

  return (
    <div className="min-h-screen px-3">
      <main className="max-w-lg mx-auto py-3 space-y-4">
        {/* Freshness indicator */}
        <div className="flex justify-end">
          <DataFreshnessIndicator
            dataUpdatedAt={solarDataUpdatedAt}
            onRefresh={refetchAllSolar}
            isRefetching={solarIsRefetching}
          />
        </div>

        {/* Compact metrics strip */}
        <div className="flex items-center justify-around bg-white/[0.03] backdrop-blur-md border border-white/10 rounded-2xl px-3 py-2.5">
          <MetricPill
            label="SFI"
            value={currentFlux}
            color="text-plasma-orange"
          />
          <div className="w-px h-6 bg-white/10" />
          <MetricPill label="Kp" value={currentKp} color="text-caution-amber" />
          <div className="w-px h-6 bg-white/10" />
          <MetricPill
            label="Bz"
            value={currentBz}
            color={
              currentBz !== null && currentBz < 0
                ? "text-alert-red"
                : "text-signal-green"
            }
            suffix=" nT"
          />
        </div>

        {/* 1 - Solar Metrics (open by default) */}
        <AccordionCard title="Solar Metrics" defaultOpen>
          <PrimaryMetrics
            kIndex={currentKp}
            solarFlux={currentFlux}
            sunspotNumber={currentSsn}
            aIndex={currentKp !== null ? kpToAp(currentKp) : undefined}
            bz={currentBz}
            bzData={bzMapData}
            loading={isLoading}
            solarFluxData={fluxMapData}
          />
        </AccordionCard>

        {/* 2 - Propagation */}
        <AccordionCard title="Propagation">
          <div className="space-y-3">
            <PropagationIndex
              solarFlux={currentFlux}
              kIndex={currentKp}
              bz={currentBz}
              loading={isLoading}
              onExpand={onExpandPropagation}
            />
            <SolarSummary
              kIndex={currentKp}
              solarFlux={currentFlux}
              loading={isLoading}
              onExpand={onExpandSummary}
            />
          </div>
        </AccordionCard>

        {/* 3 - Band Conditions */}
        <AccordionCard title="Band Conditions">
          <BandConditions
            kIndex={currentKp}
            solarFlux={currentFlux}
            loading={isLoading}
            onExpand={onExpandBandConditions}
          />
        </AccordionCard>

        {/* 4 - Charts */}
        <AccordionCard title="Charts">
          <div className="space-y-4">
            <KIndexChart
              data={kChartData}
              loading={kLoading}
              onExpand={onExpandKIndexChart}
            />
            <SolarFluxChart
              data={fluxChartData}
              loading={fluxLoading}
              onExpand={onExpandSolarFluxChart}
            />
            <BzChart
              data={bzChartData}
              loading={magLoading}
              onExpand={onExpandBzChart}
            />
          </div>
        </AccordionCard>

        {/* 5 - Flare Probability */}
        <AccordionCard title="Flare Probability">
          <FlareProbability
            cProb={probData?.c_prob ?? 0}
            mProb={probData?.m_prob ?? 0}
            xProb={probData?.x_prob ?? 0}
            protonProb={probData?.proton_prob ?? 0}
            loading={probLoading}
            onExpand={onExpandFlareProb}
          />
        </AccordionCard>

        {/* 6 - Solar Cycle */}
        <AccordionCard title="Solar Cycle">
          <SolarCycleContext
            currentSFI={currentFlux}
            recentSFI={fluxData?.map((d) => d.flux)}
            loading={isLoading}
          />
        </AccordionCard>

        {/* 7 - Proton Flux */}
        <AccordionCard title="Proton Flux">
          {protonLoading ? (
            <div className="flex items-center justify-center py-6">
              <div className="w-5 h-5 border-2 border-caution-amber/30 border-t-caution-amber rounded-full animate-spin" />
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs text-gray-400 uppercase tracking-wider">
                    Current Flux
                  </div>
                  <div className={`text-xl font-bold font-mono ${protonColor}`}>
                    {protonPfu !== null ? protonPfu.toFixed(1) : "—"}
                    <span className="text-sm font-normal text-gray-500 ml-1">
                      pfu
                    </span>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-gray-400 uppercase tracking-wider">
                    S-Scale
                  </div>
                  <div className={`text-xl font-bold font-mono ${protonColor}`}>
                    {protonSScale ?? "None"}
                  </div>
                </div>
              </div>
              <div className="text-xs text-gray-500 flex flex-wrap gap-x-3 gap-y-1 font-mono">
                <span>
                  <span className="text-signal-green">S1</span> 10
                </span>
                <span>
                  <span className="text-caution-amber">S2</span> 100
                </span>
                <span>
                  <span className="text-plasma-orange">S3</span> 1K
                </span>
                <span>
                  <span className="text-alert-red">S4</span> 10K
                </span>
                <span>
                  <span className="text-alert-red">S5</span> 100K pfu
                </span>
              </div>
              {latestProton?.time_tag && (
                <div className="text-xs text-gray-500 font-mono">
                  {new Date(latestProton.time_tag).toISOString().slice(11, 16)}Z
                </div>
              )}
            </div>
          )}
        </AccordionCard>

        {/* 8 - Dst Index */}
        <AccordionCard title="Dst Index">
          {dstLoading ? (
            <div className="flex items-center justify-center py-6">
              <div className="w-5 h-5 border-2 border-cosmic-cyan/30 border-t-cosmic-cyan rounded-full animate-spin" />
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs text-gray-400 uppercase tracking-wider">
                    Dst Value
                  </div>
                  <div className={`text-xl font-bold font-mono ${dstColor}`}>
                    {dstValue !== null
                      ? `${dstValue > 0 ? "+" : ""}${dstValue}`
                      : "—"}
                    <span className="text-sm font-normal text-gray-500 ml-1">
                      nT
                    </span>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-gray-400 uppercase tracking-wider">
                    Status
                  </div>
                  <div className={`text-xl font-bold font-mono ${dstColor}`}>
                    {dstClassification ?? "—"}
                  </div>
                </div>
              </div>
              <div className="text-xs text-gray-500 flex flex-wrap gap-x-3 gap-y-1">
                <span>
                  <span className="text-signal-green font-medium">Quiet</span>{" "}
                  &gt;-30
                </span>
                <span>
                  <span className="text-caution-amber font-medium">
                    Moderate
                  </span>{" "}
                  -30..-50
                </span>
                <span>
                  <span className="text-plasma-orange font-medium">Active</span>{" "}
                  -50..-100
                </span>
                <span>
                  <span className="text-alert-red font-medium">Storm</span>{" "}
                  &lt;-100 nT
                </span>
              </div>
              {latestDst?.time_tag && (
                <div className="text-xs text-gray-500 font-mono">
                  {new Date(latestDst.time_tag).toISOString().slice(11, 16)}Z
                </div>
              )}
            </div>
          )}
        </AccordionCard>

        {/* 9 - SFI Forecast */}
        <AccordionCard title="SFI 3-Day Forecast">
          {forecastLoading ? (
            <div className="flex items-center justify-center py-6">
              <div className="w-5 h-5 border-2 border-plasma-orange/30 border-t-plasma-orange rounded-full animate-spin" />
            </div>
          ) : forecastDays.length === 0 ? (
            <div className="text-center py-6 text-gray-500 text-sm">
              No forecast data available
            </div>
          ) : (
            <div className="space-y-3">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/10">
                      <th className="text-left py-1.5 px-2 text-xs text-gray-400 uppercase tracking-wider font-medium">
                        Date
                      </th>
                      <th className="text-center py-1.5 px-2 text-xs text-gray-400 uppercase tracking-wider font-medium">
                        Predicted
                      </th>
                      <th className="text-center py-1.5 px-2 text-xs text-gray-400 uppercase tracking-wider font-medium">
                        Observed
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {forecastDays.map((day) => (
                      <tr key={day.date} className="border-b border-white/5">
                        <td className="py-2 px-2 text-gray-300 font-mono text-xs">
                          {day.date}
                        </td>
                        <td className="py-2 px-2 text-center">
                          <span
                            className={`font-bold font-mono ${sfiColor(day.predicted_flux)}`}
                          >
                            {day.predicted_flux}
                          </span>
                        </td>
                        <td className="py-2 px-2 text-center font-mono text-gray-400">
                          {day.observed_flux != null ? day.observed_flux : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="text-xs text-gray-500 flex flex-wrap gap-x-3 gap-y-1">
                <span>
                  <span className="text-signal-green font-medium">&gt;100</span>{" "}
                  Good
                </span>
                <span>
                  <span className="text-caution-amber font-medium">80-100</span>{" "}
                  Fair
                </span>
                <span>
                  <span className="text-plasma-orange font-medium">70-80</span>{" "}
                  Poor
                </span>
                <span>
                  <span className="text-alert-red font-medium">&lt;70</span>{" "}
                  Very Poor
                </span>
              </div>
            </div>
          )}
        </AccordionCard>

        {/* 10 - CME Analysis — shared KPI widget */}
        <CMEAnalysisPanel />
      </main>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Internal sub-components
// ---------------------------------------------------------------------------

function MetricPill({
  label,
  value,
  color,
  suffix = "",
}: {
  label: string;
  value: number | null;
  color: string;
  suffix?: string;
}) {
  return (
    <div className="flex flex-col items-center">
      <span className="text-[10px] uppercase tracking-wider text-gray-500">
        {label}
      </span>
      <span className={`text-base font-bold font-mono ${color}`}>
        {value !== null ? `${Number(value.toFixed(1))}${suffix}` : "--"}
      </span>
    </div>
  );
}

function AccordionCard({
  title,
  defaultOpen = false,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  return (
    <details
      className="group bg-white/[0.03] backdrop-blur-md border border-white/10 rounded-2xl overflow-hidden"
      open={defaultOpen || undefined}
    >
      <summary className="flex items-center justify-between p-3 cursor-pointer text-sm font-medium text-white select-none">
        <span>{title}</span>
        <ChevronDown />
      </summary>
      <div className="px-3 pb-3">{children}</div>
    </details>
  );
}
