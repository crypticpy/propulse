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
import {
  ARCHETYPES,
  computeArchetypeScores,
  getTopArchetypes,
} from "@/lib/profile/archetypeScoring";

const NUM_AXES = ARCHETYPES.length;

// ─── Chart Constants ─────────────────────────────────────────────────────────

const VIEW_SIZE = 300;
const CX = VIEW_SIZE / 2;
const CY = VIEW_SIZE / 2;
const RADIUS = 110;
const GRID_LEVELS = [0.25, 0.5, 0.75, 1.0];
const LABEL_OFFSET = 22;

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

  // Compute archetype scores via shared module
  const archetypeScores = useMemo(
    () => computeArchetypeScores(stats, entries),
    [stats, entries],
  );

  const scoreArray = useMemo(
    () => archetypeScores.map((a) => a.score),
    [archetypeScores],
  );

  // Top 3 archetypes sorted by score descending
  const topArchetypes = useMemo(
    () => getTopArchetypes(archetypeScores, 3),
    [archetypeScores],
  );

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
