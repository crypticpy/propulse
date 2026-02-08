/**
 * Full stats tab composing all stat cards, charts, and the activity heatmap.
 * Consumes useLogbookStats for all aggregated data.
 */

import { useMemo } from "react";
import { useLogbookStats } from "@/hooks/useLogbookStats";
import { useLogbook } from "@/hooks/useLogbook";
import { useProfileStore } from "@/stores/profileStore";
import { lookupEntity } from "@/lib/data/dxccEntities";
import { computeAdvancedStats } from "@/lib/profile/statsComputation";
import { StatCard } from "./StatCard";
import { ActivityHeatmap } from "./ActivityHeatmap";
import { QSOByModeChart } from "./QSOByModeChart";
import { QSOByBandChart } from "./QSOByBandChart";

function SkeletonCard() {
  return (
    <div className="bg-panel/30 border border-white/5 rounded-lg p-4 animate-pulse">
      <div className="h-7 w-16 bg-white/10 rounded mx-auto mb-2" />
      <div className="h-3 w-20 bg-white/5 rounded mx-auto" />
    </div>
  );
}

function SkeletonBlock({ className = "" }: { className?: string }) {
  return (
    <div
      className={`bg-panel/30 border border-white/5 rounded-lg p-6 animate-pulse ${className}`}
    >
      <div className="h-4 w-32 bg-white/10 rounded mb-4" />
      <div className="h-32 bg-white/5 rounded" />
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <svg
        className="w-12 h-12 text-gray-600 mx-auto mb-4"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M3 13h2v8H3zM9 9h2v12H9zM15 5h2v16h-2zM21 1h2v20h-2z"
        />
      </svg>
      <h3 className="text-lg font-semibold text-gray-300 mb-2">
        No QSOs Logged Yet
      </h3>
      <p className="text-sm text-gray-500 max-w-md">
        Start logging contacts in the Logbook to see your operating statistics,
        activity heatmap, and mode/band distributions here.
      </p>
    </div>
  );
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "--";
  const d = new Date(dateStr + "T00:00:00");
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function getTopEntry(record: Record<string, number>): string {
  const entries = Object.entries(record);
  if (entries.length === 0) return "--";
  entries.sort(([, a], [, b]) => b - a);
  return entries[0][0];
}

function formatRatio(ratio: number): string {
  if (ratio <= 0) return "0% DX";
  return `${Math.round(ratio * 100)}% DX`;
}

export function StatsTab() {
  const stats = useLogbookStats();
  const { entries } = useLogbook();
  const station = useProfileStore((s) => s.station);

  // Derive home country from operator's callsign via DXCC lookup
  const homeCountry = useMemo(() => {
    const cs = station?.callsign?.toUpperCase().trim();
    if (!cs) return undefined;
    const result = lookupEntity(cs);
    return result?.entity.name;
  }, [station?.callsign]);

  // Compute advanced stats
  const advancedStats = useMemo(
    () =>
      computeAdvancedStats(
        entries,
        stats.qsosByDate,
        homeCountry,
        station?.grid,
      ),
    [entries, stats.qsosByDate, homeCountry, station?.grid],
  );

  // Loading state
  if (stats.isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
        <SkeletonBlock />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <SkeletonBlock />
          <SkeletonBlock />
        </div>
      </div>
    );
  }

  // Empty state
  if (stats.totalQSOs === 0) {
    return <EmptyState />;
  }

  const activeDays = Object.keys(stats.qsosByDate).length;

  return (
    <div className="space-y-6">
      {/* Top row: stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard value={stats.totalQSOs.toLocaleString()} label="Total QSOs" />
        <StatCard
          value={stats.uniqueCallsigns.toLocaleString()}
          label="Unique Callsigns"
        />
        <StatCard
          value={stats.uniqueCountries.toLocaleString()}
          label="Countries"
          subtitle="DXCC entities"
        />
        <StatCard value={activeDays.toLocaleString()} label="Active Days" />
      </div>

      {/* Activity Heatmap */}
      <div className="bg-panel/30 border border-white/5 rounded-lg p-4">
        <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">
          Activity (Last 365 Days)
        </h3>
        <ActivityHeatmap qsosByDate={stats.qsosByDate} />
      </div>

      {/* Charts: Mode + Band side by side on desktop */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-panel/30 border border-white/5 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">
            QSOs by Mode
          </h3>
          <QSOByModeChart data={stats.qsosByMode} />
        </div>
        <div className="bg-panel/30 border border-white/5 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">
            QSOs by Band
          </h3>
          <QSOByBandChart data={stats.qsosByBand} />
        </div>
      </div>

      {/* Records & Ratios */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard
          value={formatRatio(advancedStats.dxDomesticRatio)}
          label="DX Ratio"
        />
        <StatCard
          value={`${advancedStats.longestStreak}d`}
          label="Longest Streak"
        />
        <StatCard
          value={`${advancedStats.currentStreak}d`}
          label="Current Streak"
        />
        <StatCard
          value={`${advancedStats.peakHourUtc}:00z`}
          label="Peak Hour (UTC)"
        />
      </div>

      {/* Additional stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard value={formatDate(stats.firstQSODate)} label="First QSO" />
        <StatCard value={formatDate(stats.lastQSODate)} label="Last QSO" />
        <StatCard
          value={getTopEntry(stats.qsosByBand)}
          label="Most Active Band"
        />
        <StatCard
          value={getTopEntry(stats.qsosByMode)}
          label="Most Active Mode"
        />
      </div>
    </div>
  );
}
