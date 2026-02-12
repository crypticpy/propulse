/**
 * HeroStatsBlock -- "Baseball card" grid of 6 hero stat cards.
 *
 * Displays at-a-glance operator statistics: total QSOs, countries worked,
 * grids activated, furthest contact, longest streak, and favorite band.
 * Numbers tint with the operator's rank accent color via CSS custom properties.
 */

import { useMemo } from "react";
import { useLogbookStats } from "@/hooks/useLogbookStats";
import { useLogbook } from "@/hooks/useLogbook";
import { useProfileStore } from "@/stores/profileStore";
import { computeAdvancedStats } from "@/lib/profile/statsComputation";
import { lookupEntity } from "@/lib/data/dxccEntities";
import { gridDistance, isValidGrid } from "@/lib/utils/grid";

// ─── SVG Icons (inline, stroke-based, 20px) ────────────────────────────────

function IconRadio() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-white/[0.07]"
    >
      <path d="M4.9 19.1C1 15.2 1 8.8 4.9 4.9" />
      <path d="M7.8 16.2c-2.3-2.3-2.3-6.1 0-8.4" />
      <circle cx="12" cy="12" r="2" />
      <path d="M16.2 7.8c2.3 2.3 2.3 6.1 0 8.4" />
      <path d="M19.1 4.9C23 8.8 23 15.2 19.1 19.1" />
    </svg>
  );
}

function IconGlobe() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-white/[0.07]"
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M2 12h20" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  );
}

function IconGrid() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-white/[0.07]"
    >
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  );
}

function IconSignal() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-white/[0.07]"
    >
      <path d="M12 20V10" />
      <path d="M18 20V4" />
      <path d="M6 20v-4" />
    </svg>
  );
}

function IconCalendar() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-white/[0.07]"
    >
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4" />
      <path d="M8 2v4" />
      <path d="M3 10h18" />
    </svg>
  );
}

function IconAntenna() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-white/[0.07]"
    >
      <path d="M12 2v20" />
      <path d="M5 7l7-5 7 5" />
      <path d="M7 12h10" />
      <path d="M9 17h6" />
    </svg>
  );
}

// ─── Stat Card ──────────────────────────────────────────────────────────────

function HeroCard({
  value,
  label,
  subtitle,
  icon,
  progress,
}: {
  value: string | number;
  label: string;
  subtitle?: string;
  icon: React.ReactNode;
  /** Optional 0-1 progress bar fraction */
  progress?: number;
}) {
  return (
    <div className="relative bg-white/[0.03] border border-white/10 rounded-xl p-4 overflow-hidden">
      {/* Icon in top-right */}
      <div className="absolute top-3 right-3">{icon}</div>

      {/* Value */}
      <div
        className="font-mono text-2xl font-bold"
        style={{ color: "var(--rank-accent, #ffffff)" }}
      >
        {value}
      </div>

      {/* Label */}
      <div className="text-xs text-gray-500 uppercase tracking-wider mt-1">
        {label}
      </div>

      {/* Optional subtitle */}
      {subtitle && (
        <div className="text-[10px] text-gray-500 mt-0.5">{subtitle}</div>
      )}

      {/* Optional progress bar */}
      {progress != null && progress > 0 && (
        <div className="mt-2 h-1 w-full rounded-full bg-white/[0.06]">
          <div
            className="h-1 rounded-full transition-all duration-500"
            style={{
              width: `${Math.min(progress * 100, 100)}%`,
              backgroundColor: "var(--rank-accent, #4ade80)",
              opacity: 0.6,
            }}
          />
        </div>
      )}
    </div>
  );
}

// ─── Loading skeleton ───────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="bg-white/[0.03] border border-white/10 rounded-xl p-4 animate-pulse">
      <div className="h-7 w-16 bg-white/10 rounded mb-2" />
      <div className="h-3 w-20 bg-white/5 rounded" />
    </div>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const TOTAL_DXCC_COUNTRIES = 340;

function getTopBand(qsosByBand: Record<string, number>): {
  band: string;
  count: number;
} {
  const entries = Object.entries(qsosByBand);
  if (entries.length === 0) return { band: "--", count: 0 };
  entries.sort(([, a], [, b]) => b - a);
  return { band: entries[0][0], count: entries[0][1] };
}

// ─── Component ──────────────────────────────────────────────────────────────

interface HeroStatsBlockProps {
  className?: string;
}

export function HeroStatsBlock({ className }: HeroStatsBlockProps) {
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

  // Compute unique grids from logbook entries
  const uniqueGrids = useMemo(() => {
    const grids = new Set<string>();
    for (const entry of entries) {
      const g = entry.grid?.trim().toUpperCase();
      if (g && isValidGrid(g)) {
        // Normalize to 4-char grid square
        grids.add(g.slice(0, 4));
      }
    }
    return grids.size;
  }, [entries]);

  // Compute furthest contact distance
  const furthestContact = useMemo(() => {
    if (!station?.grid || !isValidGrid(station.grid)) return null;
    let maxDist = 0;
    for (const entry of entries) {
      if (entry.grid && isValidGrid(entry.grid)) {
        try {
          const dist = gridDistance(station.grid, entry.grid);
          if (Number.isFinite(dist) && dist > maxDist) {
            maxDist = dist;
          }
        } catch {
          // skip invalid grids
        }
      }
    }
    return maxDist > 0 ? maxDist : null;
  }, [entries, station?.grid]);

  // Top band
  const topBand = useMemo(
    () => getTopBand(stats.qsosByBand),
    [stats.qsosByBand],
  );

  // Primary mode (first entry of qsosByMode, already sorted desc)
  const topMode = useMemo(() => {
    const entries = Object.entries(stats.qsosByMode);
    if (entries.length === 0) return null;
    const [mode, count] = entries[0];
    return { mode, count };
  }, [stats.qsosByMode]);

  // Loading state
  if (stats.isLoading) {
    return (
      <div
        className={`grid grid-cols-2 md:grid-cols-3 gap-3 ${className ?? ""}`}
      >
        {Array.from({ length: 6 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    );
  }

  // Format furthest contact
  const furthestDisplay = furthestContact
    ? `${Math.round(furthestContact).toLocaleString()} km`
    : "\u2014";

  return (
    <div>
      <div
        className={`grid grid-cols-2 md:grid-cols-3 gap-3 ${className ?? ""}`}
      >
        <HeroCard
          value={stats.totalQSOs.toLocaleString()}
          label="Total QSOs"
          icon={<IconRadio />}
        />

        <HeroCard
          value={`${stats.uniqueCountries} / ${TOTAL_DXCC_COUNTRIES}`}
          label="Countries Worked"
          icon={<IconGlobe />}
          progress={stats.uniqueCountries / TOTAL_DXCC_COUNTRIES}
        />

        <HeroCard
          value={
            uniqueGrids > 0
              ? uniqueGrids.toLocaleString()
              : stats.uniqueCallsigns.toLocaleString()
          }
          label={uniqueGrids > 0 ? "Grids Activated" : "Unique Callsigns"}
          icon={<IconGrid />}
        />

        <HeroCard
          value={furthestDisplay}
          label="Furthest Contact"
          icon={<IconSignal />}
        />

        <HeroCard
          value={
            advancedStats.longestStreak > 0
              ? `${advancedStats.longestStreak} days`
              : "\u2014"
          }
          label="Longest Streak"
          icon={<IconCalendar />}
        />

        <HeroCard
          value={topBand.band}
          label="Favorite Band"
          subtitle={
            topBand.count > 0
              ? `${topBand.count.toLocaleString()} QSOs`
              : undefined
          }
          icon={<IconAntenna />}
        />
      </div>

      {topMode && (
        <div className="mt-3 text-center">
          <span className="text-[11px] text-gray-500 uppercase tracking-wider">
            Primary Mode
          </span>
          <span
            className="ml-2 text-sm font-mono font-medium"
            style={{ color: "var(--rank-accent, #e5e7eb)" }}
          >
            {topMode.mode}
          </span>
          <span className="ml-1 text-xs text-gray-500">
            ({topMode.count.toLocaleString()} QSOs)
          </span>
        </div>
      )}
    </div>
  );
}
