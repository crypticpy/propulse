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
    <div className="min-h-screen px-3 pb-20">
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
