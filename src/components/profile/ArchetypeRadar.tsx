/**
 * ArchetypeRadar — D&D-style "Operating Archetype" radar/spider chart.
 *
 * Auto-detects an operator's play style from logbook data and renders it
 * as an 8-axis radar chart (like D&D ability scores). Below the chart,
 * the top 3 archetypes are shown as badge pills.
 *
 * Pure SVG — no external chart libraries.
 */

import { useMemo } from "react";
import { useLogbookStats } from "@/hooks/useLogbookStats";
import { useLogbook } from "@/hooks/useLogbook";

// ─── Archetype Definitions ───────────────────────────────────────────────────

interface Archetype {
  key: string;
  label: string;
  /** Short label for tight SVG placement */
  shortLabel: string;
  icon: string;
}

const ARCHETYPES: Archetype[] = [
  { key: "dxer", label: "DXer", shortLabel: "DXer", icon: "🌍" },
  { key: "contester", label: "Contester", shortLabel: "Contest", icon: "⚡" },
  {
    key: "digital",
    label: "Digital Wizard",
    shortLabel: "Digital",
    icon: "💻",
  },
  { key: "cw", label: "CW Traditionalist", shortLabel: "CW", icon: "🔑" },
  {
    key: "bandExplorer",
    label: "Band Explorer",
    shortLabel: "Bands",
    icon: "🌈",
  },
  { key: "ragchewer", label: "Ragchewer", shortLabel: "Ragchew", icon: "🎙️" },
  { key: "nightOwl", label: "Night Owl", shortLabel: "Night", icon: "🌙" },
  { key: "qrp", label: "QRP Warrior", shortLabel: "QRP", icon: "🔋" },
];

const NUM_AXES = ARCHETYPES.length;

// ─── Chart Constants ─────────────────────────────────────────────────────────

const VIEW_SIZE = 300;
const CX = VIEW_SIZE / 2;
const CY = VIEW_SIZE / 2;
const RADIUS = 110;
const GRID_LEVELS = [0.25, 0.5, 0.75, 1.0];
const LABEL_OFFSET = 22;

// ─── Digital Mode Keys ───────────────────────────────────────────────────────

const DIGITAL_MODES = new Set([
  "FT8",
  "FT4",
  "RTTY",
  "PSK31",
  "PSK63",
  "JT65",
  "JT9",
  "JS8",
  "OLIVIA",
  "MFSK",
  "CONTESTIA",
  "THOR",
  "DOMINO",
  "ROS",
  "WSPR",
  "MSK144",
  "Q65",
  "FST4",
  "FST4W",
]);

// ─── Scoring Logic ───────────────────────────────────────────────────────────

interface ArchetypeScores {
  dxer: number;
  contester: number;
  digital: number;
  cw: number;
  bandExplorer: number;
  ragchewer: number;
  nightOwl: number;
  qrp: number;
}

function computeScores(
  totalQSOs: number,
  uniqueCountries: number,
  qsosByMode: Record<string, number>,
  qsosByBand: Record<string, number>,
  qsosByDate: Record<string, number>,
  hourlyDistribution: number[],
): ArchetypeScores {
  if (totalQSOs === 0) {
    return {
      dxer: 0,
      contester: 0,
      digital: 0,
      cw: 0,
      bandExplorer: 0,
      ragchewer: 0,
      nightOwl: 0,
      qrp: 0,
    };
  }

  // DXer: uniqueCountries / 100 threshold, capped at 100
  const dxer = Math.min(100, Math.round((uniqueCountries / 100) * 100));

  // Contester: max QSOs in a single day / 100 threshold
  const maxDayCount = Math.max(0, ...Object.values(qsosByDate));
  const contester = Math.min(100, Math.round((maxDayCount / 100) * 100));

  // Digital Wizard: digital mode QSOs / total * 100
  let digitalCount = 0;
  for (const [mode, count] of Object.entries(qsosByMode)) {
    if (DIGITAL_MODES.has(mode.toUpperCase())) {
      digitalCount += count;
    }
  }
  const digital = Math.min(100, Math.round((digitalCount / totalQSOs) * 100));

  // CW Traditionalist: CW QSOs / total * 100
  const cwCount = qsosByMode["CW"] || 0;
  const cw = Math.min(100, Math.round((cwCount / totalQSOs) * 100));

  // Band Explorer: unique bands / 12 * 100
  const uniqueBands = Object.keys(qsosByBand).length;
  const bandExplorer = Math.min(100, Math.round((uniqueBands / 12) * 100));

  // Ragchewer: SSB QSOs / total * 100 (proxy for voice)
  const ssbCount =
    (qsosByMode["SSB"] || 0) +
    (qsosByMode["LSB"] || 0) +
    (qsosByMode["USB"] || 0) +
    (qsosByMode["AM"] || 0) +
    (qsosByMode["FM"] || 0);
  const ragchewer = Math.min(100, Math.round((ssbCount / totalQSOs) * 100));

  // Night Owl: QSOs between 00-06 UTC / total * 300 (amplified), requires hourly data
  let nightOwl = 0;
  const totalHourly = hourlyDistribution.reduce((s, v) => s + v, 0);
  if (totalHourly > 0) {
    let nightCount = 0;
    for (let h = 0; h <= 6; h++) {
      nightCount += hourlyDistribution[h];
    }
    nightOwl = Math.min(100, Math.round((nightCount / totalHourly) * 300));
  }

  // QRP Warrior: placeholder (no power data yet)
  const qrp = 0;

  return {
    dxer,
    contester,
    digital,
    cw,
    bandExplorer,
    ragchewer,
    nightOwl,
    qrp,
  };
}

// ─── Coordinate Helpers ──────────────────────────────────────────────────────

function angleForAxis(index: number): number {
  return (index * 2 * Math.PI) / NUM_AXES - Math.PI / 2;
}

function pointOnAxis(
  index: number,
  value: number,
  radius: number = RADIUS,
): { x: number; y: number } {
  const angle = angleForAxis(index);
  const r = (value / 100) * radius;
  return {
    x: CX + r * Math.cos(angle),
    y: CY + r * Math.sin(angle),
  };
}

function polygonPoints(scores: number[], radius: number = RADIUS): string {
  return scores
    .map((score, i) => {
      const pt = pointOnAxis(i, score, radius);
      return `${pt.x.toFixed(2)},${pt.y.toFixed(2)}`;
    })
    .join(" ");
}

// ─── Label Positioning ───────────────────────────────────────────────────────

function labelAnchor(index: number): "start" | "middle" | "end" {
  const angle = angleForAxis(index);
  const cos = Math.cos(angle);
  if (cos > 0.3) return "start";
  if (cos < -0.3) return "end";
  return "middle";
}

function labelDominantBaseline(index: number): "auto" | "middle" | "hanging" {
  const angle = angleForAxis(index);
  const sin = Math.sin(angle);
  if (sin > 0.3) return "hanging";
  if (sin < -0.3) return "auto";
  return "middle";
}

// ─── Component ───────────────────────────────────────────────────────────────

interface ArchetypeRadarProps {
  className?: string;
}

export function ArchetypeRadar({ className }: ArchetypeRadarProps) {
  const stats = useLogbookStats();
  const { entries } = useLogbook();

  // Compute hourly distribution from raw entries (for Night Owl score)
  const hourlyDistribution = useMemo(() => {
    const hourly = new Array<number>(24).fill(0);
    for (const entry of entries) {
      if (entry.timeOn) {
        const h = parseInt(entry.timeOn.split(":")[0], 10);
        if (Number.isFinite(h) && h >= 0 && h <= 23) {
          hourly[h]++;
        }
      }
    }
    return hourly;
  }, [entries]);

  // Compute archetype scores
  const scores = useMemo(
    () =>
      computeScores(
        stats.totalQSOs,
        stats.uniqueCountries,
        stats.qsosByMode,
        stats.qsosByBand,
        stats.qsosByDate,
        hourlyDistribution,
      ),
    [
      stats.totalQSOs,
      stats.uniqueCountries,
      stats.qsosByMode,
      stats.qsosByBand,
      stats.qsosByDate,
      hourlyDistribution,
    ],
  );

  const scoreArray = useMemo(
    () => ARCHETYPES.map((a) => scores[a.key as keyof ArchetypeScores]),
    [scores],
  );

  // Top 3 archetypes sorted by score descending
  const topArchetypes = useMemo(() => {
    const indexed = ARCHETYPES.map((a, i) => ({
      ...a,
      score: scoreArray[i],
    }));
    return indexed
      .slice()
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);
  }, [scoreArray]);

  const isEmpty = stats.totalQSOs === 0;

  return (
    <div
      className={`bg-white/[0.03] border border-white/10 rounded-xl p-4 ${className ?? ""}`}
    >
      {/* Section Header */}
      <h3 className="text-xs text-gray-500 uppercase tracking-wider mb-3">
        Operating Style
      </h3>

      {/* SVG Radar Chart */}
      <div className="relative w-full max-w-[300px] mx-auto">
        <svg
          viewBox={`0 0 ${VIEW_SIZE} ${VIEW_SIZE}`}
          width="100%"
          className="block"
          style={{ aspectRatio: "1 / 1" }}
          role="img"
          aria-label="Operating archetype radar chart"
        >
          {/* Drop-shadow filter for data polygon glow */}
          <defs>
            <filter
              id="radar-glow"
              x="-20%"
              y="-20%"
              width="140%"
              height="140%"
            >
              <feDropShadow
                dx="0"
                dy="0"
                stdDeviation="4"
                floodColor="var(--rank-accent, rgb(0, 200, 220))"
                floodOpacity="0.4"
              />
            </filter>
          </defs>

          {/* Concentric octagon grid lines */}
          {GRID_LEVELS.map((level) => (
            <polygon
              key={level}
              points={polygonPoints(
                new Array(NUM_AXES).fill(level * 100),
                RADIUS,
              )}
              fill="none"
              stroke="rgba(255,255,255,0.06)"
              strokeWidth={1}
            />
          ))}

          {/* Axis lines from center to each vertex */}
          {ARCHETYPES.map((_, i) => {
            const outer = pointOnAxis(i, 100);
            return (
              <line
                key={`axis-${i}`}
                x1={CX}
                y1={CY}
                x2={outer.x}
                y2={outer.y}
                stroke="rgba(255,255,255,0.06)"
                strokeWidth={1}
              />
            );
          })}

          {/* Data polygon (only when there is data) */}
          {!isEmpty && (
            <>
              <polygon
                points={polygonPoints(scoreArray)}
                fill="var(--rank-accent, rgba(0, 200, 220, 0.15))"
                fillOpacity={0.15}
                stroke="var(--rank-accent, rgb(0, 200, 220))"
                strokeWidth={2}
                strokeLinejoin="round"
                filter="url(#radar-glow)"
                className="transition-all duration-700 ease-out"
              />

              {/* Data dots at each vertex */}
              {scoreArray.map((score, i) => {
                const pt = pointOnAxis(i, score);
                return (
                  <circle
                    key={`dot-${i}`}
                    cx={pt.x}
                    cy={pt.y}
                    r={3}
                    fill="var(--rank-accent, rgb(0, 200, 220))"
                    stroke="rgba(0,0,0,0.5)"
                    strokeWidth={1}
                    className="transition-all duration-700 ease-out"
                  />
                );
              })}
            </>
          )}

          {/* Empty state ghost polygon */}
          {isEmpty && (
            <polygon
              points={polygonPoints(new Array(NUM_AXES).fill(20))}
              fill="none"
              stroke="rgba(255,255,255,0.04)"
              strokeWidth={1}
              strokeDasharray="4 4"
            />
          )}

          {/* Axis labels */}
          {ARCHETYPES.map((archetype, i) => {
            const labelPt = pointOnAxis(i, 100 + (LABEL_OFFSET / RADIUS) * 100);
            return (
              <text
                key={`label-${archetype.key}`}
                x={labelPt.x}
                y={labelPt.y}
                textAnchor={labelAnchor(i)}
                dominantBaseline={labelDominantBaseline(i)}
                className="fill-gray-400"
                fontSize={10}
                fontFamily="system-ui, sans-serif"
              >
                {archetype.shortLabel}
              </text>
            );
          })}
        </svg>
      </div>

      {/* Empty state message */}
      {isEmpty && (
        <p className="text-sm text-gray-500 text-center mt-2">
          Import your logbook to reveal your operating archetypes
        </p>
      )}

      {/* Top 3 Archetype Badges */}
      {!isEmpty && (
        <div className="flex flex-wrap items-center justify-center gap-2 mt-4">
          {topArchetypes.map((archetype, i) => (
            <span
              key={archetype.key}
              className="inline-flex items-center gap-1.5 bg-white/[0.05] rounded-full px-3 py-1 text-xs"
              style={{
                borderWidth: 1,
                borderStyle: "solid",
                borderColor:
                  i === 0
                    ? "var(--rank-accent, rgb(0, 200, 220))"
                    : "rgba(255,255,255,0.1)",
                color:
                  i === 0
                    ? "var(--rank-accent, rgb(0, 200, 220))"
                    : "rgba(255,255,255,0.6)",
              }}
            >
              <span className="leading-none">{archetype.icon}</span>
              <span>{archetype.label}</span>
              <span className="opacity-60 tabular-nums">{archetype.score}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
