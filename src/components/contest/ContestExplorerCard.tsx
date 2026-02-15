/**
 * ContestExplorerCard — Card for the contest explorer grid
 *
 * Shows contest name, dates, band/mode pills, difficulty badge, and
 * estimated participants. Expands on click to reveal StationEstimate
 * and ContestQuickStart inline.
 *
 * @module components/contest/ContestExplorerCard
 */

import { useState, useMemo } from "react";
import type { ContestCalendarEntry } from "@/lib/contest/contestCalendarTypes";
import type { ContestDefinition } from "@/types/contest";
import { StationEstimate } from "./StationEstimate";
import { ContestQuickStart } from "./ContestQuickStart";

interface ContestExplorerCardProps {
  /** Calendar entry with schedule data */
  entry: ContestCalendarEntry;
  /** Optional linked contest definition with scoring/exchange details */
  definition?: ContestDefinition;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDateRange(startUtc: string, endUtc: string): string {
  const start = new Date(startUtc);
  const end = new Date(endUtc);
  const opts: Intl.DateTimeFormatOptions = {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  };
  const startStr = start.toLocaleDateString("en-US", opts);
  const endStr = end.toLocaleDateString("en-US", opts);

  if (startStr === endStr) return startStr;
  return `${startStr} \u2013 ${endStr}`;
}

function formatDuration(startUtc: string, endUtc: string): string {
  const ms = new Date(endUtc).getTime() - new Date(startUtc).getTime();
  const hours = Math.round(ms / (1000 * 60 * 60));
  if (hours < 24) return `${hours}h`;
  if (hours % 24 === 0) return `${hours / 24}d`;
  return `${hours}h`;
}

function formatParticipants(count: number): string {
  if (count >= 1000)
    return `${(count / 1000).toFixed(count >= 10000 ? 0 : 1)}k`;
  return count.toString();
}

const DIFFICULTY_CONFIG: Record<
  ContestCalendarEntry["difficulty"],
  { label: string; dots: number; color: string }
> = {
  beginner: { label: "Beginner", dots: 1, color: "text-signal-green" },
  intermediate: { label: "Intermediate", dots: 3, color: "text-caution-amber" },
  advanced: { label: "Advanced", dots: 5, color: "text-alert-red" },
};

/** Determine dominant mode string for station estimator */
function getDominantMode(modes: string[]): string | undefined {
  if (modes.length === 0) return undefined;
  if (modes.length === 1) return modes[0];
  // If mixed, return undefined (no single mode adjustment)
  return undefined;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function DifficultyBadge({
  difficulty,
}: {
  difficulty: ContestCalendarEntry["difficulty"];
}) {
  const config = DIFFICULTY_CONFIG[difficulty];
  return (
    <span className="flex items-center gap-1.5 text-xs">
      <span className="text-gray-400">{config.label}</span>
      <span className="flex gap-0.5">
        {Array.from({ length: 5 }).map((_, i) => (
          <span
            key={i}
            className={`inline-block w-1.5 h-1.5 rounded-full ${
              i < config.dots ? config.color + " bg-current" : "bg-white/10"
            }`}
          />
        ))}
      </span>
    </span>
  );
}

function ModePill({ mode }: { mode: string }) {
  const colors: Record<string, string> = {
    CW: "bg-nebula-blue/20 text-nebula-blue border-nebula-blue/30",
    SSB: "bg-signal-green/20 text-signal-green border-signal-green/30",
    RTTY: "bg-purple-400/20 text-purple-400 border-purple-400/30",
    Digital: "bg-purple-400/20 text-purple-400 border-purple-400/30",
    FT8: "bg-purple-400/20 text-purple-400 border-purple-400/30",
    FT4: "bg-purple-400/20 text-purple-400 border-purple-400/30",
    FM: "bg-caution-amber/20 text-caution-amber border-caution-amber/30",
  };
  const cls = colors[mode] ?? "bg-white/10 text-gray-300 border-white/10";

  return (
    <span
      className={`px-1.5 py-0.5 text-[10px] font-medium rounded border ${cls}`}
    >
      {mode}
    </span>
  );
}

function BandPill({ band }: { band: string }) {
  return (
    <span className="px-1.5 py-0.5 text-[10px] font-mono text-gray-400 bg-white/5 rounded border border-white/5">
      {band}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function ContestExplorerCard({
  entry,
  definition,
}: ContestExplorerCardProps) {
  const [expanded, setExpanded] = useState(false);

  const dominantMode = useMemo(
    () => getDominantMode(entry.modes),
    [entry.modes],
  );

  // Determine which contestId to use for quick-start lookup
  const quickStartId = entry.definitionId ?? entry.id;

  return (
    <div
      className={`rounded-xl border transition-all duration-200 cursor-pointer
        ${expanded ? "border-plasma-orange/30 bg-panel shadow-lg shadow-plasma-orange/5" : "border-white/5 bg-panel hover:border-white/10 hover:shadow-md"}
      `}
      onClick={() => setExpanded(!expanded)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          setExpanded(!expanded);
        }
      }}
      aria-expanded={expanded}
    >
      {/* Card Header */}
      <div className="p-4">
        {/* Top row: name + expand chevron */}
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-semibold text-white truncate">
              {entry.name}
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">{entry.sponsor}</p>
          </div>
          <svg
            className={`w-4 h-4 text-gray-500 flex-shrink-0 mt-1 transition-transform ${expanded ? "rotate-180" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M19 9l-7 7-7-7"
            />
          </svg>
        </div>

        {/* Date + duration */}
        <div className="flex items-center gap-2 text-xs text-gray-400 mb-2.5">
          <span>{formatDateRange(entry.startUtc, entry.endUtc)}</span>
          <span className="text-white/10">|</span>
          <span>{formatDuration(entry.startUtc, entry.endUtc)}</span>
        </div>

        {/* Mode pills */}
        <div className="flex flex-wrap gap-1 mb-2.5">
          {entry.modes.map((mode) => (
            <ModePill key={mode} mode={mode} />
          ))}
        </div>

        {/* Band pills (show max 6, collapse rest) */}
        <div className="flex flex-wrap gap-1 mb-3">
          {entry.bands.slice(0, 6).map((band) => (
            <BandPill key={band} band={band} />
          ))}
          {entry.bands.length > 6 && (
            <span className="px-1.5 py-0.5 text-[10px] text-gray-500">
              +{entry.bands.length - 6} more
            </span>
          )}
        </div>

        {/* Bottom row: difficulty + participants */}
        <div className="flex items-center justify-between">
          <DifficultyBadge difficulty={entry.difficulty} />
          <span className="text-xs text-gray-500">
            ~{formatParticipants(entry.estimatedParticipants)} participants
          </span>
        </div>
      </div>

      {/* Expanded content */}
      {expanded && (
        <div
          className="px-4 pb-4 space-y-3 border-t border-white/5 pt-3"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Description */}
          <p className="text-sm text-gray-300 leading-relaxed">
            {entry.description}
          </p>

          {/* Exchange format from definition */}
          {definition && (
            <div className="text-xs text-gray-400">
              <span className="font-medium text-gray-300">Exchange: </span>
              {entry.exchange}
            </div>
          )}

          {/* Rules link */}
          {entry.rulesUrl && (
            <a
              href={entry.rulesUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-plasma-orange hover:text-plasma-orange/80 transition-colors"
              onClick={(e) => e.stopPropagation()}
            >
              Official Rules
              <svg
                className="w-3 h-3"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                />
              </svg>
            </a>
          )}

          {/* Station estimate */}
          <StationEstimate contestType={dominantMode} />

          {/* Quick-start guide */}
          <ContestQuickStart
            contestId={quickStartId}
            contestName={entry.name}
          />
        </div>
      )}
    </div>
  );
}
