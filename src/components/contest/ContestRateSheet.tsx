/**
 * ContestRateSheet - Classic contest rate sheet with hourly and 10-minute views
 *
 * Shows QSO rates, points, and running totals in a tabular format with:
 * - Toggle between hourly and 10-minute segment views
 * - Visual inline bar charts for relative rate comparison
 * - Band-by-hour heatmap matrix for activity pattern analysis
 * - Best-rate row highlighting
 *
 * @module components/contest/ContestRateSheet
 */

import { useMemo, useState, memo } from "react";
import { Card } from "@/components/ui";
import { useContestStore, type ContestQSO } from "@/stores/contestStore";

// ============================================================================
// Types
// ============================================================================

interface HourlyRateRow {
  label: string;
  qsoCount: number;
  rate: number;
  points: number;
  runningTotal: number;
}

interface TenMinRateRow {
  label: string;
  qsoCount: number;
  rate: number;
  points: number;
  runningTotal: number;
}

interface BandHourCell {
  hour: number;
  band: string;
  qsoCount: number;
}

type ViewMode = "hourly" | "10min";

// ============================================================================
// Computation Helpers
// ============================================================================

/**
 * Parse a store QSO timestamp into a Date.
 * Handles ISO 8601 strings safely.
 */
function parseTimestamp(timestamp: string): Date {
  const d = new Date(timestamp);
  if (isNaN(d.getTime())) {
    return new Date();
  }
  return d;
}

/**
 * Compute hourly rate rows from store QSOs.
 * Groups by contest hour offset from the first QSO.
 */
function computeHourlyRows(qsos: ContestQSO[]): HourlyRateRow[] {
  if (qsos.length === 0) return [];

  const sorted = [...qsos].sort(
    (a, b) =>
      parseTimestamp(a.timestamp).getTime() -
      parseTimestamp(b.timestamp).getTime(),
  );

  const contestStart = parseTimestamp(sorted[0].timestamp).getTime();
  const hourMap = new Map<number, { qsoCount: number; points: number }>();
  let runningTotal = 0;

  for (const qso of sorted) {
    const elapsed = parseTimestamp(qso.timestamp).getTime() - contestStart;
    const hour = Math.floor(elapsed / (60 * 60 * 1000));

    if (!hourMap.has(hour)) {
      hourMap.set(hour, { qsoCount: 0, points: 0 });
    }

    const data = hourMap.get(hour)!;
    if (!qso.isDupe) {
      data.qsoCount++;
      data.points += qso.points;
    }
  }

  const maxHour = Math.max(...hourMap.keys(), 0);
  const rows: HourlyRateRow[] = [];
  runningTotal = 0;

  for (let h = 0; h <= maxHour; h++) {
    const data = hourMap.get(h) ?? { qsoCount: 0, points: 0 };
    runningTotal += data.qsoCount;

    rows.push({
      label: `Hour ${h + 1}`,
      qsoCount: data.qsoCount,
      rate: data.qsoCount, // QSOs per hour (1 hour window = actual count)
      points: data.points,
      runningTotal,
    });
  }

  return rows;
}

/**
 * Compute 10-minute segment rate rows from store QSOs.
 * Groups by 10-minute buckets from contest start.
 */
function compute10MinRows(qsos: ContestQSO[]): TenMinRateRow[] {
  if (qsos.length === 0) return [];

  const sorted = [...qsos].sort(
    (a, b) =>
      parseTimestamp(a.timestamp).getTime() -
      parseTimestamp(b.timestamp).getTime(),
  );

  const contestStart = parseTimestamp(sorted[0].timestamp).getTime();
  const segmentMap = new Map<number, { qsoCount: number; points: number }>();

  for (const qso of sorted) {
    const elapsed = parseTimestamp(qso.timestamp).getTime() - contestStart;
    const segment = Math.floor(elapsed / (10 * 60 * 1000));

    if (!segmentMap.has(segment)) {
      segmentMap.set(segment, { qsoCount: 0, points: 0 });
    }

    const data = segmentMap.get(segment)!;
    if (!qso.isDupe) {
      data.qsoCount++;
      data.points += qso.points;
    }
  }

  const maxSegment = Math.max(...segmentMap.keys(), 0);
  const rows: TenMinRateRow[] = [];
  let runningTotal = 0;

  for (let s = 0; s <= maxSegment; s++) {
    const data = segmentMap.get(s) ?? { qsoCount: 0, points: 0 };
    runningTotal += data.qsoCount;

    // Compute label as time offset from contest start
    const startMin = s * 10;
    const endMin = startMin + 10;
    const startH = Math.floor(startMin / 60);
    const startM = startMin % 60;
    const endH = Math.floor(endMin / 60);
    const endM = endMin % 60;
    const label = `${String(startH).padStart(2, "0")}:${String(startM).padStart(2, "0")}-${String(endH).padStart(2, "0")}:${String(endM).padStart(2, "0")}`;

    rows.push({
      label,
      qsoCount: data.qsoCount,
      rate: data.qsoCount * 6, // Extrapolate to QSOs/hr (6 segments per hour)
      points: data.points,
      runningTotal,
    });
  }

  return rows;
}

/**
 * Compute band-by-hour matrix for the heatmap.
 */
function computeBandHourMatrix(qsos: ContestQSO[]): {
  cells: BandHourCell[];
  bands: string[];
  hours: number[];
  maxCount: number;
} {
  if (qsos.length === 0) {
    return { cells: [], bands: [], hours: [], maxCount: 0 };
  }

  const sorted = [...qsos].sort(
    (a, b) =>
      parseTimestamp(a.timestamp).getTime() -
      parseTimestamp(b.timestamp).getTime(),
  );

  const contestStart = parseTimestamp(sorted[0].timestamp).getTime();
  const bandOrder = ["160m", "80m", "40m", "20m", "15m", "10m", "6m", "2m"];
  const cellMap = new Map<string, number>();
  const bandSet = new Set<string>();
  const hourSet = new Set<number>();

  for (const qso of sorted) {
    if (qso.isDupe) continue;

    const elapsed = parseTimestamp(qso.timestamp).getTime() - contestStart;
    const hour = Math.floor(elapsed / (60 * 60 * 1000));
    const band = qso.band.toLowerCase();

    const key = `${hour}|${band}`;
    cellMap.set(key, (cellMap.get(key) ?? 0) + 1);
    bandSet.add(band);
    hourSet.add(hour);
  }

  // Sort bands by standard order
  const bands = [...bandSet].sort((a, b) => {
    const ia = bandOrder.indexOf(a);
    const ib = bandOrder.indexOf(b);
    if (ia === -1 && ib === -1) return a.localeCompare(b);
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });

  const hours = [...hourSet].sort((a, b) => a - b);
  let maxCount = 0;
  const cells: BandHourCell[] = [];

  for (const hour of hours) {
    for (const band of bands) {
      const count = cellMap.get(`${hour}|${band}`) ?? 0;
      cells.push({ hour, band, qsoCount: count });
      if (count > maxCount) maxCount = count;
    }
  }

  return { cells, bands, hours, maxCount };
}

// ============================================================================
// Sub-Components
// ============================================================================

/**
 * Toggle button for view mode selection
 */
const ViewToggle = memo(function ViewToggle({
  mode,
  onChange,
}: {
  mode: ViewMode;
  onChange: (mode: ViewMode) => void;
}) {
  return (
    <div className="flex items-center gap-1 bg-void-black rounded-md p-0.5">
      <button
        onClick={() => onChange("hourly")}
        className={`px-2.5 py-1 text-xs font-medium rounded transition-colors ${
          mode === "hourly"
            ? "bg-plasma-orange/20 text-plasma-orange"
            : "text-gray-500 hover:text-gray-300"
        }`}
      >
        Hourly
      </button>
      <button
        onClick={() => onChange("10min")}
        className={`px-2.5 py-1 text-xs font-medium rounded transition-colors ${
          mode === "10min"
            ? "bg-plasma-orange/20 text-plasma-orange"
            : "text-gray-500 hover:text-gray-300"
        }`}
      >
        10-Min
      </button>
    </div>
  );
});

/**
 * Inline bar chart component
 */
const RateBar = memo(function RateBar({
  value,
  maxValue,
  isBest,
}: {
  value: number;
  maxValue: number;
  isBest: boolean;
}) {
  const width = maxValue > 0 ? Math.round((value / maxValue) * 100) : 0;

  return (
    <div className="w-full h-3 bg-void-black rounded-sm overflow-hidden">
      <div
        className={`h-full rounded-sm transition-all duration-300 ${
          isBest ? "bg-signal-green" : "bg-plasma-orange/60"
        }`}
        style={{ width: `${width}%` }}
      />
    </div>
  );
});

/**
 * Rate table row component
 */
const RateRow = memo(function RateRow({
  label,
  qsoCount,
  rate,
  points,
  runningTotal,
  maxRate,
  isBest,
}: {
  label: string;
  qsoCount: number;
  rate: number;
  points: number;
  runningTotal: number;
  maxRate: number;
  isBest: boolean;
}) {
  return (
    <tr
      className={`border-b border-white/5 ${
        isBest ? "bg-signal-green/10" : "hover:bg-white/[0.02]"
      }`}
    >
      <td
        className={`px-2 py-1 text-xs font-mono ${isBest ? "text-signal-green font-bold" : "text-gray-400"}`}
      >
        {label}
      </td>
      <td className="px-2 py-1 text-xs font-mono text-right text-gray-200">
        {qsoCount}
      </td>
      <td
        className={`px-2 py-1 text-xs font-mono text-right ${isBest ? "text-signal-green font-bold" : "text-plasma-orange"}`}
      >
        {rate}/hr
      </td>
      <td className="px-2 py-1 text-xs font-mono text-right text-gray-300">
        {points}
      </td>
      <td className="px-2 py-1 text-xs font-mono text-right text-gray-400">
        {runningTotal}
      </td>
      <td className="px-2 py-1 w-24">
        <RateBar value={rate} maxValue={maxRate} isBest={isBest} />
      </td>
    </tr>
  );
});

/**
 * Band-by-hour heatmap cell
 */
const HeatCell = memo(function HeatCell({
  count,
  maxCount,
}: {
  count: number;
  maxCount: number;
}) {
  if (count === 0) {
    return (
      <td className="px-1 py-0.5 text-center">
        <span className="text-[10px] font-mono text-gray-700">-</span>
      </td>
    );
  }

  // Compute intensity 0.0-1.0
  const intensity = maxCount > 0 ? count / maxCount : 0;

  // Map intensity to opacity of plasma-orange
  // Low activity: dim, high activity: bright
  const opacity = Math.max(0.15, intensity);

  return (
    <td className="px-1 py-0.5 text-center">
      <span
        className="inline-block min-w-[24px] px-1 py-0.5 rounded text-[10px] font-mono font-bold"
        style={{
          backgroundColor: `rgba(255, 170, 0, ${opacity})`,
          color: intensity > 0.5 ? "#1a1a2e" : "#ffa500",
        }}
      >
        {count}
      </span>
    </td>
  );
});

// ============================================================================
// Main Component
// ============================================================================

export interface ContestRateSheetProps {
  /** Additional CSS classes */
  className?: string;
}

const EMPTY_QSOS: ContestQSO[] = [];

/**
 * ContestRateSheet - Classic contest rate sheet with hourly and 10-minute views
 *
 * Shows QSO rates over time with visual bar charts and a band-by-hour heatmap.
 * Only renders when there is an active session with QSOs.
 */
export function ContestRateSheet({ className = "" }: ContestRateSheetProps) {
  const [viewMode, setViewMode] = useState<ViewMode>("hourly");
  const [isExpanded, setIsExpanded] = useState(true);

  // Narrow Zustand selectors
  const qsos = useContestStore((s) => s.activeSession?.qsos) ?? EMPTY_QSOS;

  // Compute rows based on view mode
  const hourlyRows = useMemo(() => computeHourlyRows(qsos), [qsos]);
  const tenMinRows = useMemo(() => compute10MinRows(qsos), [qsos]);
  const rows = viewMode === "hourly" ? hourlyRows : tenMinRows;

  // Find best rate row
  const bestRateIndex = useMemo(() => {
    if (rows.length === 0) return -1;
    let bestIdx = 0;
    let bestRate = 0;
    for (let i = 0; i < rows.length; i++) {
      if (rows[i].rate > bestRate) {
        bestRate = rows[i].rate;
        bestIdx = i;
      }
    }
    return bestRate > 0 ? bestIdx : -1;
  }, [rows]);

  const maxRate = useMemo(() => {
    return rows.reduce((max, r) => Math.max(max, r.rate), 0);
  }, [rows]);

  // Compute band-hour matrix
  const bandHourMatrix = useMemo(() => computeBandHourMatrix(qsos), [qsos]);

  // Don't render if no QSOs
  if (qsos.length === 0) {
    return null;
  }

  return (
    <Card className={`p-3 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center gap-2 group"
        >
          <svg
            className={`w-3.5 h-3.5 text-gray-500 transition-transform ${
              isExpanded ? "rotate-90" : ""
            }`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 5l7 7-7 7"
            />
          </svg>
          <h3 className="text-sm font-orbitron font-bold text-gray-300 group-hover:text-white transition-colors">
            Rate Sheet
          </h3>
          <span className="text-[10px] text-gray-600 font-mono">
            ({qsos.filter((q) => !q.isDupe).length} Qs)
          </span>
        </button>

        {isExpanded && <ViewToggle mode={viewMode} onChange={setViewMode} />}
      </div>

      {isExpanded && (
        <div className="space-y-4">
          {/* Rate Table */}
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="px-2 py-1 text-left text-[10px] uppercase tracking-wider text-gray-500 font-medium">
                    Period
                  </th>
                  <th className="px-2 py-1 text-right text-[10px] uppercase tracking-wider text-gray-500 font-medium">
                    QSOs
                  </th>
                  <th className="px-2 py-1 text-right text-[10px] uppercase tracking-wider text-gray-500 font-medium">
                    Rate
                  </th>
                  <th className="px-2 py-1 text-right text-[10px] uppercase tracking-wider text-gray-500 font-medium">
                    Pts
                  </th>
                  <th className="px-2 py-1 text-right text-[10px] uppercase tracking-wider text-gray-500 font-medium">
                    Total
                  </th>
                  <th className="px-2 py-1 text-[10px] uppercase tracking-wider text-gray-500 font-medium w-24">
                    &nbsp;
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, idx) => (
                  <RateRow
                    key={row.label}
                    label={row.label}
                    qsoCount={row.qsoCount}
                    rate={row.rate}
                    points={row.points}
                    runningTotal={row.runningTotal}
                    maxRate={maxRate}
                    isBest={idx === bestRateIndex}
                  />
                ))}
              </tbody>
            </table>
          </div>

          {/* Summary row */}
          {rows.length > 0 && (
            <div className="flex items-center gap-4 text-[10px] text-gray-500 border-t border-white/5 pt-2">
              <span>
                Total:{" "}
                <span className="text-gray-300 font-mono">
                  {rows.reduce((s, r) => s + r.qsoCount, 0)}
                </span>{" "}
                QSOs
              </span>
              <span>
                Avg:{" "}
                <span className="text-plasma-orange font-mono">
                  {rows.length > 0
                    ? Math.round(
                        rows.reduce((s, r) => s + r.rate, 0) / rows.length,
                      )
                    : 0}
                  /hr
                </span>
              </span>
              {bestRateIndex >= 0 && (
                <span>
                  Best:{" "}
                  <span className="text-signal-green font-mono">
                    {rows[bestRateIndex].rate}/hr
                  </span>{" "}
                  ({rows[bestRateIndex].label})
                </span>
              )}
            </div>
          )}

          {/* Band-by-Hour Heatmap */}
          {bandHourMatrix.bands.length > 1 &&
            bandHourMatrix.hours.length > 0 && (
              <div className="pt-2 border-t border-white/5">
                <h4 className="text-[10px] uppercase tracking-wider text-gray-500 font-medium mb-2">
                  Band x Hour
                </h4>
                <div className="overflow-x-auto">
                  <table className="border-collapse">
                    <thead>
                      <tr>
                        <th className="px-1 py-0.5 text-[10px] text-gray-600 font-medium text-left">
                          &nbsp;
                        </th>
                        {bandHourMatrix.bands.map((band) => (
                          <th
                            key={band}
                            className="px-1 py-0.5 text-[10px] text-gray-500 font-mono font-medium text-center"
                          >
                            {band}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {bandHourMatrix.hours.map((hour) => (
                        <tr key={hour} className="border-b border-white/5">
                          <td className="px-1 py-0.5 text-[10px] text-gray-500 font-mono">
                            Hr {hour + 1}
                          </td>
                          {bandHourMatrix.bands.map((band) => {
                            const cell = bandHourMatrix.cells.find(
                              (c) => c.hour === hour && c.band === band,
                            );
                            return (
                              <HeatCell
                                key={`${hour}-${band}`}
                                count={cell?.qsoCount ?? 0}
                                maxCount={bandHourMatrix.maxCount}
                              />
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
        </div>
      )}
    </Card>
  );
}

export default ContestRateSheet;
