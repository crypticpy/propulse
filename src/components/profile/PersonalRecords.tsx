/**
 * PersonalRecords -- Horizontal scrollable row of personal best cards.
 *
 * Displays personal bests computed from the operator's logbook:
 * furthest QSO, best single day, most active band, current streak,
 * and peak operating hour (UTC).
 */

import { useMemo } from "react";
import { useLogbookStats } from "@/hooks/useLogbookStats";
import { useLogbook } from "@/hooks/useLogbook";
import { useProfileStore } from "@/stores/profileStore";
import { lookupEntity } from "@/lib/data/dxccEntities";
import { computeAdvancedStats } from "@/lib/profile/statsComputation";
import { gridDistance, isValidGrid } from "@/lib/utils/grid";

// ─── SVG Icons (inline, stroke-based, 16px) ────────────────────────────────

function IconTarget() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-white/20"
    >
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="6" />
      <circle cx="12" cy="12" r="2" />
    </svg>
  );
}

function IconTrophy() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-white/20"
    >
      <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
      <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
      <path d="M4 22h16" />
      <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
      <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
      <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
    </svg>
  );
}

function IconBolt() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-white/20"
    >
      <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
    </svg>
  );
}

function IconFlame() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-white/20"
    >
      <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" />
    </svg>
  );
}

function IconClock() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-white/20"
    >
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

// ─── Record Card ────────────────────────────────────────────────────────────

function RecordCard({
  icon,
  value,
  label,
  detail,
}: {
  icon: React.ReactNode;
  value: string;
  label: string;
  detail?: string;
}) {
  return (
    <div className="flex-shrink-0 w-40 bg-white/[0.03] border border-white/10 rounded-xl p-3">
      <div className="mb-2">{icon}</div>
      <div className="font-mono text-lg font-bold text-white">{value}</div>
      <div className="text-[10px] text-gray-500 uppercase tracking-wider">
        {label}
      </div>
      {detail && <div className="text-xs text-gray-400 mt-0.5">{detail}</div>}
    </div>
  );
}

// ─── Loading skeleton ───────────────────────────────────────────────────────

function SkeletonRecord() {
  return (
    <div className="flex-shrink-0 w-40 bg-white/[0.03] border border-white/10 rounded-xl p-3 animate-pulse">
      <div className="h-4 w-4 bg-white/10 rounded mb-2" />
      <div className="h-5 w-16 bg-white/10 rounded mb-1" />
      <div className="h-2.5 w-20 bg-white/5 rounded" />
    </div>
  );
}

// ─── Empty state ────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="flex items-center justify-center py-6 px-4">
      <p className="text-sm text-gray-500">
        Import your logbook to unlock personal records
      </p>
    </div>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatHourUtc(hour: number): string {
  return `${String(hour).padStart(2, "0")}:00z`;
}

function getTopBandName(qsosByBand: Record<string, number>): {
  band: string;
  count: number;
} {
  const entries = Object.entries(qsosByBand);
  if (entries.length === 0) return { band: "--", count: 0 };
  entries.sort(([, a], [, b]) => b - a);
  return { band: entries[0][0], count: entries[0][1] };
}

// ─── Component ──────────────────────────────────────────────────────────────

interface PersonalRecordsProps {
  className?: string;
}

export function PersonalRecords({ className }: PersonalRecordsProps) {
  const stats = useLogbookStats();
  const { entries } = useLogbook();
  const station = useProfileStore((s) => s.station);

  // Derive home country for advanced stats
  const homeCountry = useMemo(() => {
    const cs = station?.callsign?.toUpperCase().trim();
    if (!cs) return undefined;
    const result = lookupEntity(cs);
    return result?.entity.name;
  }, [station?.callsign]);

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

  // Compute furthest QSO with callsign
  const furthestQSO = useMemo(() => {
    if (!station?.grid || !isValidGrid(station.grid)) return null;
    let maxDist = 0;
    let maxCallsign = "";
    for (const entry of entries) {
      if (entry.grid && isValidGrid(entry.grid)) {
        try {
          const dist = gridDistance(station.grid, entry.grid);
          if (Number.isFinite(dist) && dist > maxDist) {
            maxDist = dist;
            maxCallsign = entry.callsign;
          }
        } catch {
          // skip invalid grids
        }
      }
    }
    return maxDist > 0 ? { distance: maxDist, callsign: maxCallsign } : null;
  }, [entries, station?.grid]);

  const topBand = useMemo(
    () => getTopBandName(stats.qsosByBand),
    [stats.qsosByBand],
  );

  // Loading
  if (stats.isLoading) {
    return (
      <div className={`flex gap-3 overflow-x-auto pb-2 ${className ?? ""}`}>
        {Array.from({ length: 5 }).map((_, i) => (
          <SkeletonRecord key={i} />
        ))}
      </div>
    );
  }

  // Empty state
  if (stats.totalQSOs === 0) {
    return <EmptyState />;
  }

  return (
    <div
      className={`flex gap-3 overflow-x-auto pb-2 scrollbar-hide ${className ?? ""}`}
    >
      {/* Furthest QSO */}
      <RecordCard
        icon={<IconTarget />}
        value={
          furthestQSO
            ? `${Math.round(furthestQSO.distance).toLocaleString()} km`
            : "\u2014"
        }
        label="Furthest QSO"
        detail={furthestQSO?.callsign || undefined}
      />

      {/* Best Single Day */}
      <RecordCard
        icon={<IconTrophy />}
        value={
          advancedStats.bestSingleDay.count > 0
            ? `${advancedStats.bestSingleDay.count} QSOs`
            : "\u2014"
        }
        label="Best Single Day"
        detail={
          advancedStats.bestSingleDay.date !== "--"
            ? advancedStats.bestSingleDay.date
            : undefined
        }
      />

      {/* Most Active Band */}
      <RecordCard
        icon={<IconBolt />}
        value={topBand.band}
        label="Most Active Band"
        detail={
          topBand.count > 0
            ? `${topBand.count.toLocaleString()} QSOs`
            : undefined
        }
      />

      {/* Current Streak */}
      <RecordCard
        icon={<IconFlame />}
        value={
          advancedStats.currentStreak > 0
            ? `${advancedStats.currentStreak} days`
            : "\u2014"
        }
        label="Current Streak"
      />

      {/* Peak Operating Hour */}
      <RecordCard
        icon={<IconClock />}
        value={
          stats.totalQSOs > 0
            ? formatHourUtc(advancedStats.peakHourUtc)
            : "\u2014"
        }
        label="Peak Hour (UTC)"
      />
    </div>
  );
}
