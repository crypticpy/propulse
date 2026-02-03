/**
 * SpotStatsDashboard Component
 *
 * Displays statistics and analytics for DX spots including:
 * - Band distribution chart
 * - Mode distribution chart
 * - Activity timeline (24h)
 * - Top callsigns, grids, and spotters
 * - Summary statistics
 */

import { useMemo, useState } from "react";
import { Card } from "@/components/ui/Card";
import { useDXStore } from "@/stores/dxStore";
import { getBandColor } from "@/lib/api/dxcluster";

export interface SpotStatsDashboardProps {
  className?: string;
  /** Compact mode for smaller displays */
  compact?: boolean;
}

interface BandStats {
  band: string;
  count: number;
  percentage: number;
  color: { color: string; bgColor: string };
}

interface ModeStats {
  mode: string;
  count: number;
  percentage: number;
}

interface HourlyStats {
  hour: number;
  count: number;
  percentage: number;
}

interface TopItem {
  name: string;
  count: number;
}

interface Stats {
  total: number;
  uniqueCallsigns: number;
  uniqueGrids: number;
  avgPerHour: number;
  byBand: BandStats[];
  byMode: ModeStats[];
  byHour: HourlyStats[];
  topCallsigns: TopItem[];
  topGrids: TopItem[];
  topSpotters: TopItem[];
}

/**
 * Calculate comprehensive statistics from spots
 */
function calculateStats(
  spots: Array<{
    dx: string;
    band?: string;
    mode?: string;
    dxGrid?: string;
    spotter: string;
    time: Date;
  }>,
): Stats {
  const bandCounts = new Map<string, number>();
  const modeCounts = new Map<string, number>();
  const hourCounts = new Map<number, number>();
  const callsignCounts = new Map<string, number>();
  const gridCounts = new Map<string, number>();
  const spotterCounts = new Map<string, number>();

  const uniqueCallsigns = new Set<string>();
  const uniqueGrids = new Set<string>();

  for (const spot of spots) {
    // Count by band
    if (spot.band) {
      bandCounts.set(spot.band, (bandCounts.get(spot.band) || 0) + 1);
    }

    // Count by mode
    if (spot.mode) {
      modeCounts.set(spot.mode, (modeCounts.get(spot.mode) || 0) + 1);
    }

    // Count by hour
    const hour = spot.time.getUTCHours();
    hourCounts.set(hour, (hourCounts.get(hour) || 0) + 1);

    // Track unique callsigns and count occurrences
    uniqueCallsigns.add(spot.dx);
    callsignCounts.set(spot.dx, (callsignCounts.get(spot.dx) || 0) + 1);

    // Track unique grids
    if (spot.dxGrid) {
      const grid4 = spot.dxGrid.slice(0, 4);
      uniqueGrids.add(grid4);
      gridCounts.set(grid4, (gridCounts.get(grid4) || 0) + 1);
    }

    // Count spotters
    spotterCounts.set(spot.spotter, (spotterCounts.get(spot.spotter) || 0) + 1);
  }

  const total = spots.length;

  // Band stats with colors
  const byBand: BandStats[] = Array.from(bandCounts.entries())
    .map(([band, count]) => ({
      band,
      count,
      percentage: total > 0 ? (count / total) * 100 : 0,
      color: getBandColor(band),
    }))
    .sort((a, b) => b.count - a.count);

  // Mode stats
  const byMode: ModeStats[] = Array.from(modeCounts.entries())
    .map(([mode, count]) => ({
      mode,
      count,
      percentage: total > 0 ? (count / total) * 100 : 0,
    }))
    .sort((a, b) => b.count - a.count);

  // Hourly stats (0-23)
  const maxHourCount = Math.max(...Array.from(hourCounts.values()), 1);
  const byHour: HourlyStats[] = Array.from({ length: 24 }, (_, i) => {
    const count = hourCounts.get(i) || 0;
    return {
      hour: i,
      count,
      percentage: (count / maxHourCount) * 100,
    };
  });

  // Top lists
  const topCallsigns: TopItem[] = Array.from(callsignCounts.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  const topGrids: TopItem[] = Array.from(gridCounts.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  const topSpotters: TopItem[] = Array.from(spotterCounts.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  return {
    total,
    uniqueCallsigns: uniqueCallsigns.size,
    uniqueGrids: uniqueGrids.size,
    avgPerHour: total > 0 ? total / 24 : 0,
    byBand,
    byMode,
    byHour,
    topCallsigns,
    topGrids,
    topSpotters,
  };
}

/**
 * Horizontal bar chart for band distribution
 */
function BandDistribution({ data }: { data: BandStats[] }) {
  if (data.length === 0) {
    return (
      <div className="text-gray-500 text-xs text-center py-4">No band data</div>
    );
  }

  return (
    <div className="space-y-1.5">
      {data.slice(0, 8).map((item) => (
        <div key={item.band} className="flex items-center gap-2">
          <span
            className="w-12 text-[10px] font-bold px-1.5 py-0.5 rounded text-center"
            style={{
              backgroundColor: item.color.bgColor,
              color: item.color.color,
            }}
          >
            {item.band}
          </span>
          <div className="flex-1 h-4 bg-white/5 rounded overflow-hidden">
            <div
              className="h-full rounded transition-all duration-300"
              style={{
                width: `${item.percentage}%`,
                backgroundColor: item.color.bgColor,
              }}
            />
          </div>
          <span className="text-[10px] text-gray-400 w-10 text-right tabular-nums">
            {item.count}
          </span>
        </div>
      ))}
    </div>
  );
}

/**
 * Simple donut chart for mode distribution
 */
function ModeDistribution({ data }: { data: ModeStats[] }) {
  if (data.length === 0) {
    return (
      <div className="text-gray-500 text-xs text-center py-4">No mode data</div>
    );
  }

  const colors = [
    "#06b6d4",
    "#f97316",
    "#22c55e",
    "#a855f7",
    "#ef4444",
    "#eab308",
  ];
  const total = data.reduce((sum, item) => sum + item.count, 0);
  let cumulativePercent = 0;

  const segments = data.slice(0, 6).map((item, i) => {
    const startPercent = cumulativePercent;
    cumulativePercent += (item.count / total) * 100;
    return {
      ...item,
      color: colors[i % colors.length],
      startPercent,
      endPercent: cumulativePercent,
    };
  });

  return (
    <div className="flex items-center gap-4">
      {/* SVG Donut */}
      <svg viewBox="0 0 36 36" className="w-20 h-20">
        <circle
          cx="18"
          cy="18"
          r="15.9"
          fill="none"
          stroke="rgba(255,255,255,0.05)"
          strokeWidth="3"
        />
        {segments.map((seg) => {
          const circumference = 2 * Math.PI * 15.9;
          const dashArray = `${((seg.endPercent - seg.startPercent) / 100) * circumference} ${circumference}`;
          const rotation = (seg.startPercent / 100) * 360 - 90;
          return (
            <circle
              key={seg.mode}
              cx="18"
              cy="18"
              r="15.9"
              fill="none"
              stroke={seg.color}
              strokeWidth="3"
              strokeDasharray={dashArray}
              transform={`rotate(${rotation} 18 18)`}
              className="transition-all duration-300"
            />
          );
        })}
      </svg>

      {/* Legend */}
      <div className="flex-1 space-y-1">
        {segments.map((item) => (
          <div key={item.mode} className="flex items-center gap-2 text-[10px]">
            <span
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: item.color }}
            />
            <span className="text-gray-300">{item.mode}</span>
            <span className="text-gray-500 ml-auto tabular-nums">
              {item.percentage.toFixed(0)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * 24-hour activity timeline
 */
function ActivityTimeline({
  data,
  currentHour,
}: {
  data: HourlyStats[];
  currentHour: number;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-end gap-0.5 h-12">
        {data.map((item) => (
          <div
            key={item.hour}
            className={`flex-1 rounded-t transition-all duration-300 ${
              item.hour === currentHour
                ? "bg-plasma-orange"
                : "bg-cosmic-cyan/60"
            }`}
            style={{ height: `${Math.max(item.percentage, 4)}%` }}
            title={`${item.hour}:00 UTC - ${item.count} spots`}
          />
        ))}
      </div>
      <div className="flex justify-between text-[8px] text-gray-500">
        <span>00</span>
        <span>06</span>
        <span>12</span>
        <span>18</span>
        <span>24</span>
      </div>
    </div>
  );
}

/**
 * Collapsible top list section
 */
function TopList({
  title,
  items,
  icon,
}: {
  title: string;
  items: TopItem[];
  icon: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const displayItems = expanded ? items : items.slice(0, 5);

  if (items.length === 0) {
    return null;
  }

  return (
    <div>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between text-[10px] text-gray-400 uppercase tracking-wide mb-1 hover:text-white transition-colors"
      >
        <span className="flex items-center gap-1">
          <span>{icon}</span>
          {title}
        </span>
        <span className="text-gray-600">{expanded ? "▲" : "▼"}</span>
      </button>
      <div className="space-y-0.5">
        {displayItems.map((item, i) => (
          <div
            key={item.name}
            className="flex items-center justify-between text-[10px] px-1 py-0.5 rounded hover:bg-white/5"
          >
            <span className="flex items-center gap-1.5">
              <span className="text-gray-600 w-3">{i + 1}.</span>
              <span className="text-gray-300 font-mono">{item.name}</span>
            </span>
            <span className="text-gray-500 tabular-nums">{item.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Summary statistics row
 */
function SummaryStats({ stats }: { stats: Stats }) {
  return (
    <div className="grid grid-cols-4 gap-2 text-center">
      <div className="bg-white/5 rounded-lg p-2">
        <div className="text-lg font-bold text-white tabular-nums">
          {stats.total}
        </div>
        <div className="text-[9px] text-gray-500 uppercase">Total</div>
      </div>
      <div className="bg-white/5 rounded-lg p-2">
        <div className="text-lg font-bold text-cosmic-cyan tabular-nums">
          {stats.uniqueCallsigns}
        </div>
        <div className="text-[9px] text-gray-500 uppercase">Calls</div>
      </div>
      <div className="bg-white/5 rounded-lg p-2">
        <div className="text-lg font-bold text-signal-green tabular-nums">
          {stats.uniqueGrids}
        </div>
        <div className="text-[9px] text-gray-500 uppercase">Grids</div>
      </div>
      <div className="bg-white/5 rounded-lg p-2">
        <div className="text-lg font-bold text-plasma-orange tabular-nums">
          {stats.avgPerHour.toFixed(0)}
        </div>
        <div className="text-[9px] text-gray-500 uppercase">Avg/Hr</div>
      </div>
    </div>
  );
}

/**
 * SpotStatsDashboard Component
 *
 * Displays comprehensive statistics for DX spots.
 */
export function SpotStatsDashboard({
  className = "",
  compact = false,
}: SpotStatsDashboardProps) {
  const spots = useDXStore((state) => state.spots);
  const currentHour = new Date().getUTCHours();

  const stats = useMemo(() => calculateStats(spots), [spots]);

  if (spots.length === 0) {
    return (
      <Card className={`p-4 ${className}`}>
        <div className="text-center text-gray-500 py-8">
          <div className="text-2xl mb-2">📊</div>
          <div className="text-sm">No spots to analyze</div>
          <div className="text-xs text-gray-600">
            Statistics will appear when spots are loaded
          </div>
        </div>
      </Card>
    );
  }

  if (compact) {
    return (
      <Card className={`p-3 ${className}`}>
        <SummaryStats stats={stats} />
      </Card>
    );
  }

  return (
    <Card className={`p-4 space-y-4 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white flex items-center gap-2">
          <span>📊</span>
          Spot Statistics
        </h3>
        <span className="text-[10px] text-gray-500">
          Last {spots.length} spots
        </span>
      </div>

      {/* Summary */}
      <SummaryStats stats={stats} />

      {/* Band Distribution */}
      <div>
        <div className="text-[10px] text-gray-400 uppercase tracking-wide mb-2">
          Band Distribution
        </div>
        <BandDistribution data={stats.byBand} />
      </div>

      {/* Mode Distribution */}
      <div>
        <div className="text-[10px] text-gray-400 uppercase tracking-wide mb-2">
          Mode Distribution
        </div>
        <ModeDistribution data={stats.byMode} />
      </div>

      {/* Activity Timeline */}
      <div>
        <div className="text-[10px] text-gray-400 uppercase tracking-wide mb-2">
          24h Activity (UTC)
        </div>
        <ActivityTimeline data={stats.byHour} currentHour={currentHour} />
      </div>

      {/* Top Lists */}
      <div className="grid grid-cols-1 gap-3 pt-2 border-t border-white/10">
        <TopList title="Top Callsigns" items={stats.topCallsigns} icon="📡" />
        <TopList title="Top Grids" items={stats.topGrids} icon="🗺️" />
        <TopList title="Top Spotters" items={stats.topSpotters} icon="👁️" />
      </div>
    </Card>
  );
}

SpotStatsDashboard.displayName = "SpotStatsDashboard";

export default SpotStatsDashboard;
