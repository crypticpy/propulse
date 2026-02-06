/**
 * InsightsBar Component
 *
 * A single dense horizontal strip with 4 inline data groups:
 * CLUSTER | LOG | BANDS | HISTORY
 *
 * Merges SpotStatsDashboard and the old card-based InsightsBar into
 * one unified strip separated by subtle vertical dividers.
 */

import { useState, useMemo, useEffect } from "react";
import { useDXStore } from "@/stores/dxStore";
import { useLogbook } from "@/hooks/useLogbook";
import { useSolarFlux, useKIndex } from "@/hooks/useSolarData";
import { calculateBandConditions, getConditionColor } from "@/lib/utils/bands";
import { getEntityFromCallsign } from "@/lib/utils/gridUtils";
import { getBandColor, getBandFromFrequency } from "@/lib/utils/spotColors";
import { LogStatsDetailModal } from "./modals/LogStatsDetailModal";
import { HistoryDetailModal } from "./modals/HistoryDetailModal";
import { ClusterPulseDetailModal } from "./modals/ClusterPulseDetailModal";
import { BandConditionsModal } from "@/components/solar/modals/BandConditionsModal";
import type { DXSpot } from "@/types/dxcluster";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface InsightsBarProps {
  /** Current display time for time-sensitive data (reserved for future use) */
  displayTime: Date;
  /** Additional CSS classes */
  className?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getSpotAgeMinutes(spot: DXSpot): number {
  const nowMs = Date.now();
  const spotMs =
    spot.time instanceof Date
      ? spot.time.getTime()
      : new Date(spot.time).getTime();
  return Math.max(0, (nowMs - spotMs) / 60_000);
}

function isMatchingMonthDay(entryDate: string, today: Date): boolean {
  const entryMonth = parseInt(entryDate.slice(5, 7), 10);
  const entryDay = parseInt(entryDate.slice(8, 10), 10);
  return entryMonth === today.getMonth() + 1 && entryDay === today.getDate();
}

/** Abbreviate band condition for compact display */
function abbreviateCondition(condition: string): string {
  switch (condition) {
    case "Excellent":
      return "Exc";
    case "Aurora":
      return "Aur";
    default:
      return condition;
  }
}

// ---------------------------------------------------------------------------
// Vertical divider
// ---------------------------------------------------------------------------

function Divider() {
  return <div className="w-px h-5 bg-white/10 mx-3 flex-shrink-0" />;
}

// ---------------------------------------------------------------------------
// Keyboard handler for accessible clickable sections
// ---------------------------------------------------------------------------

function sectionKeyDown(e: React.KeyboardEvent, handler: () => void) {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    handler();
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function InsightsBar({
  displayTime: _displayTime,
  className = "",
}: InsightsBarProps) {
  // Reserved for future time-machine feature
  void _displayTime;

  // ---- Modal state ----
  const [activeModal, setActiveModal] = useState<
    "logStats" | "bandConditions" | "history" | "clusterPulse" | null
  >(null);

  // Tick counter to keep time-sensitive computations (rate, age) fresh
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  // ---- Data sources ----
  const spots = useDXStore((state) => state.spots);
  const { entries } = useLogbook();
  const { data: kIndexData } = useKIndex();
  const { data: solarFluxData } = useSolarFlux();

  const currentKp = kIndexData?.[kIndexData.length - 1]?.kp_index ?? null;
  const currentSfi = solarFluxData?.[solarFluxData.length - 1]?.flux ?? null;

  // =====================================================================
  // CLUSTER section computations
  // =====================================================================
  const clusterStats = useMemo(() => {
    const total = spots.length;
    const uniqueCalls = new Set(spots.map((s) => s.dx)).size;
    const uniqueGrids = new Set(spots.map((s) => s.dxGrid).filter(Boolean))
      .size;

    // Rate: spots in last 5 minutes / 5
    const fiveMinAgo = Date.now() - 5 * 60_000;
    const recentCount = spots.filter((s) => {
      const t =
        s.time instanceof Date ? s.time.getTime() : new Date(s.time).getTime();
      return t >= fiveMinAgo;
    }).length;
    const rate = recentCount / 5;

    // Median age
    let medianAge = 0;
    if (total > 0) {
      const ages = spots.map(getSpotAgeMinutes).sort((a, b) => a - b);
      const mid = Math.floor(ages.length / 2);
      medianAge =
        ages.length % 2 === 0 ? (ages[mid - 1] + ages[mid]) / 2 : ages[mid];
    }

    // Peak band
    const bandCounts: Record<string, number> = {};
    for (const s of spots) {
      const band = s.band || getBandFromFrequency(s.frequency);
      if (band && band !== "unknown") {
        bandCounts[band] = (bandCounts[band] || 0) + 1;
      }
    }
    let peakBand = "";
    let peakCount = 0;
    for (const [band, count] of Object.entries(bandCounts)) {
      if (count > peakCount) {
        peakBand = band;
        peakCount = count;
      }
    }

    return { total, uniqueCalls, uniqueGrids, rate, medianAge, peakBand };
  }, [spots, tick]);

  // Rate color
  const rateColor =
    clusterStats.rate >= 2
      ? "text-signal-green"
      : clusterStats.rate >= 0.5
        ? "text-yellow-400"
        : "text-alert-red";

  // =====================================================================
  // LOG section computations
  // =====================================================================
  const logStats = useMemo(() => {
    const today = new Date();
    const todayStr = today.toISOString().slice(0, 10);

    const dayOfWeek = today.getDay();
    const mondayOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const monday = new Date(today);
    monday.setDate(today.getDate() - mondayOffset);
    const weekStr = monday.toISOString().slice(0, 10);

    let todayCount = 0;
    let weekCount = 0;
    const entitySet = new Set<string>();

    for (const entry of entries) {
      if (entry.date === todayStr) todayCount++;
      if (entry.date >= weekStr) weekCount++;

      const entity = getEntityFromCallsign(entry.callsign);
      if (entity) entitySet.add(entity.name);
    }

    return { todayCount, weekCount, entities: entitySet.size };
  }, [entries]);

  // =====================================================================
  // BANDS section computations
  // =====================================================================
  const goodBands = useMemo(() => {
    if (currentKp === null || currentSfi === null) return [];
    const allBands = calculateBandConditions(currentKp, currentSfi);
    return allBands.filter(
      (b) =>
        b.dayCondition === "Good" ||
        b.dayCondition === "Excellent" ||
        b.nightCondition === "Good" ||
        b.nightCondition === "Excellent",
    );
  }, [currentKp, currentSfi]);

  // =====================================================================
  // HISTORY section computations
  // =====================================================================
  const historyInfo = useMemo(() => {
    const today = new Date();
    const thisYear = today.getFullYear();

    const matches = entries.filter(
      (e) =>
        isMatchingMonthDay(e.date, today) &&
        parseInt(e.date.slice(0, 4), 10) !== thisYear,
    );

    if (matches.length === 0) return "No DX on this date";

    const uniqueCalls = Array.from(new Set(matches.map((m) => m.callsign)));
    const preview = uniqueCalls.slice(0, 3).join(", ");
    const suffix = uniqueCalls.length > 3 ? ` +${uniqueCalls.length - 3}` : "";
    return `${preview}${suffix}`;
  }, [entries]);

  // =====================================================================
  // Render
  // =====================================================================
  return (
    <div
      className={`
        flex items-center h-10 bg-white/[0.02] backdrop-blur-sm
        border border-white/5 rounded-2xl px-4 overflow-x-auto
        scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent
        ${className}
      `}
    >
      {/* ---- CLUSTER ---- */}
      <div
        className="flex items-center gap-2 cursor-pointer hover:bg-white/5 rounded px-2 py-1 transition-colors flex-shrink-0"
        onClick={() => setActiveModal("clusterPulse")}
        onKeyDown={(e) =>
          sectionKeyDown(e, () => setActiveModal("clusterPulse"))
        }
        role="button"
        tabIndex={0}
        title="DX Cluster activity"
      >
        <span className="text-[9px] font-semibold text-gray-500 uppercase tracking-wider">
          Cluster
        </span>
        <span className="text-sm font-bold font-mono text-white tabular-nums">
          {clusterStats.total}
        </span>
        <span className="text-[10px] text-gray-500">spots</span>
        <span className="text-sm font-bold font-mono text-white tabular-nums">
          {clusterStats.uniqueCalls}
        </span>
        <span className="text-[10px] text-gray-500">calls</span>
        <span className="text-sm font-bold font-mono text-white tabular-nums">
          {clusterStats.uniqueGrids}
        </span>
        <span className="text-[10px] text-gray-500">grids</span>
        <span
          className={`text-sm font-bold font-mono tabular-nums ${rateColor}`}
        >
          {clusterStats.rate.toFixed(1)}/min
        </span>
        <span className="text-sm font-bold font-mono text-white tabular-nums">
          {Math.round(clusterStats.medianAge)}m
        </span>
        {clusterStats.peakBand && (
          <span
            className="text-sm font-bold font-mono tabular-nums"
            style={{ color: getBandColor(clusterStats.peakBand) }}
          >
            {clusterStats.peakBand}
          </span>
        )}
      </div>

      <Divider />

      {/* ---- LOG ---- */}
      <div
        className="flex items-center gap-2 cursor-pointer hover:bg-white/5 rounded px-2 py-1 transition-colors flex-shrink-0"
        onClick={() => setActiveModal("logStats")}
        onKeyDown={(e) => sectionKeyDown(e, () => setActiveModal("logStats"))}
        role="button"
        tabIndex={0}
        title="Logbook statistics"
      >
        <span className="text-[9px] font-semibold text-gray-500 uppercase tracking-wider">
          Log
        </span>
        <span className="text-sm font-bold font-mono text-white tabular-nums">
          {logStats.todayCount}
        </span>
        <span className="text-[10px] text-gray-500">today</span>
        <span className="text-sm font-bold font-mono text-white tabular-nums">
          {logStats.weekCount}
        </span>
        <span className="text-[10px] text-gray-500">week</span>
        <span
          className={`text-sm font-bold font-mono tabular-nums ${
            logStats.entities > 0 ? "text-plasma-orange" : "text-white"
          }`}
        >
          {logStats.entities}
        </span>
        <span className="text-[10px] text-gray-500">DXCC</span>
      </div>

      <Divider />

      {/* ---- BANDS ---- */}
      <div
        className="flex items-center gap-2 cursor-pointer hover:bg-white/5 rounded px-2 py-1 transition-colors flex-shrink-0"
        onClick={() => setActiveModal("bandConditions")}
        onKeyDown={(e) =>
          sectionKeyDown(e, () => setActiveModal("bandConditions"))
        }
        role="button"
        tabIndex={0}
        title="Band conditions (Good+)"
      >
        <span className="text-[9px] font-semibold text-gray-500 uppercase tracking-wider">
          Bands
        </span>
        {goodBands.length === 0 ? (
          <span className="text-[10px] text-gray-500 italic">
            {currentKp === null || currentSfi === null ? "N/A" : "none good"}
          </span>
        ) : (
          goodBands.map((b) => {
            const bestCondition =
              b.dayCondition === "Excellent" || b.nightCondition === "Excellent"
                ? "Excellent"
                : "Good";
            return (
              <span key={b.name} className="flex items-center gap-0.5">
                <span
                  className="text-xs font-bold font-mono"
                  style={{ color: getBandColor(b.name) }}
                >
                  {b.name}
                </span>
                <span
                  className="text-[10px] font-medium"
                  style={{ color: getConditionColor(bestCondition) }}
                >
                  {abbreviateCondition(bestCondition)}
                </span>
              </span>
            );
          })
        )}
      </div>

      <Divider />

      {/* ---- HISTORY ---- */}
      <div
        className="flex items-center gap-2 cursor-pointer hover:bg-white/5 rounded px-2 py-1 transition-colors flex-shrink-0 min-w-0"
        onClick={() => setActiveModal("history")}
        onKeyDown={(e) => sectionKeyDown(e, () => setActiveModal("history"))}
        role="button"
        tabIndex={0}
        title="This day in DX history"
      >
        <span className="text-[9px] font-semibold text-gray-500 uppercase tracking-wider">
          History
        </span>
        <span className="text-[10px] text-gray-400 truncate max-w-[200px]">
          {historyInfo}
        </span>
      </div>

      {/* ---- Detail Modals ---- */}
      <ClusterPulseDetailModal
        isOpen={activeModal === "clusterPulse"}
        onClose={() => setActiveModal(null)}
      />
      <LogStatsDetailModal
        isOpen={activeModal === "logStats"}
        onClose={() => setActiveModal(null)}
      />
      <BandConditionsModal
        isOpen={activeModal === "bandConditions"}
        onClose={() => setActiveModal(null)}
        kIndex={currentKp}
        solarFlux={currentSfi}
      />
      <HistoryDetailModal
        isOpen={activeModal === "history"}
        onClose={() => setActiveModal(null)}
      />
    </div>
  );
}

export default InsightsBar;
