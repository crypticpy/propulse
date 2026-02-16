/**
 * ContestCalendar — Calendar list/timeline view of upcoming contests
 *
 * Features:
 * - List of upcoming and active contests with rich metadata
 * - Each entry: name, date range (local + UTC), bands, modes, description,
 *   difficulty badge, participation estimate
 * - Sort by: date (default), difficulty, size
 * - Filter by: mode, difficulty, "this weekend only"
 * - Visual timeline showing contest windows on a week view
 * - "Start Contest" link for entries with a definitionId
 *
 * @module components/contest/ContestCalendar
 */

import { useState, useMemo, memo } from "react";
import { useContestContext } from "@/hooks/useContestContext";
import type { ContestCalendarEntry } from "@/lib/contest/contestCalendarTypes";
import { WARC_BANDS } from "@/lib/data/contestCalendar";
import { CONTEST_CALENDAR_2026 } from "@/lib/data/contestCalendar";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ContestCalendarProps {
  /** Optional callback when user clicks "Start Contest" */
  onStartContest?: (definitionId: string) => void;
  /** Additional CSS classes for the root element */
  className?: string;
}

type SortKey = "date" | "difficulty" | "size";
type ModeFilter = "all" | "CW" | "SSB" | "RTTY" | "Digital" | "Mixed";
type DifficultyFilter = "all" | "beginner" | "intermediate" | "advanced";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DIFFICULTY_ORDER: Record<string, number> = {
  beginner: 0,
  intermediate: 1,
  advanced: 2,
};

const DIFFICULTY_COLORS: Record<string, string> = {
  beginner:
    "bg-signal-green/20 text-signal-green border border-signal-green/30",
  intermediate:
    "bg-caution-amber/20 text-caution-amber border border-caution-amber/30",
  advanced: "bg-alert-red/20 text-alert-red border border-alert-red/30",
};

const DIFFICULTY_LABELS: Record<string, string> = {
  beginner: "Beginner",
  intermediate: "Intermediate",
  advanced: "Advanced",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDateRange(startUtc: string, endUtc: string): string {
  const start = new Date(startUtc);
  const end = new Date(endUtc);

  const localStart = start.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  const localEnd = end.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  return `${localStart} - ${localEnd}`;
}

function formatUtcRange(startUtc: string, endUtc: string): string {
  const start = new Date(startUtc);
  const end = new Date(endUtc);

  const fmt = (d: Date) => {
    const month = d.toLocaleString("en-US", {
      month: "short",
      timeZone: "UTC",
    });
    const day = d.getUTCDate();
    const hh = d.getUTCHours().toString().padStart(2, "0");
    const mm = d.getUTCMinutes().toString().padStart(2, "0");
    return `${month} ${day} ${hh}:${mm}Z`;
  };

  return `${fmt(start)} - ${fmt(end)}`;
}

function formatParticipants(n: number): string {
  if (n >= 1000) {
    const k = Math.round(n / 1000);
    return `${k}k+`;
  }
  return n.toLocaleString();
}

function getDurationHours(startUtc: string, endUtc: string): number {
  const ms = new Date(endUtc).getTime() - new Date(startUtc).getTime();
  return Math.round(ms / (1000 * 60 * 60));
}

function isThisWeekend(startUtc: string): boolean {
  const now = new Date();
  const start = new Date(startUtc);

  // "This weekend" = within 7 days
  const diffDays = (start.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
  return diffDays >= -2 && diffDays <= 7;
}

function matchesModeFilter(modes: string[], filter: ModeFilter): boolean {
  if (filter === "all") return true;
  if (filter === "Mixed") return modes.length > 1;
  return modes.some((m) => m.toUpperCase() === filter.toUpperCase());
}

function isActiveNow(entry: ContestCalendarEntry): boolean {
  const now = Date.now();
  const s = new Date(entry.startUtc).getTime();
  const e = new Date(entry.endUtc).getTime();
  return now >= s && now <= e;
}

// ---------------------------------------------------------------------------
// Sub-Components
// ---------------------------------------------------------------------------

const DifficultyBadge = memo(function DifficultyBadge({
  difficulty,
}: {
  difficulty: string;
}) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${DIFFICULTY_COLORS[difficulty] || "bg-void/50 text-gray-400"}`}
    >
      {DIFFICULTY_LABELS[difficulty] || difficulty}
    </span>
  );
});

const BandPills = memo(function BandPills({ bands }: { bands: string[] }) {
  return (
    <div className="flex flex-wrap gap-1">
      {bands.map((band) => {
        const isWarc = (WARC_BANDS as readonly string[]).includes(band);
        return (
          <span
            key={band}
            className={`px-1.5 py-0.5 rounded text-[10px] font-mono ${
              isWarc
                ? "bg-nebula-blue/20 text-nebula-blue border border-nebula-blue/30"
                : "bg-void/60 text-gray-300 border border-white/10"
            }`}
          >
            {band}
          </span>
        );
      })}
    </div>
  );
});

const ModePills = memo(function ModePills({ modes }: { modes: string[] }) {
  return (
    <div className="flex flex-wrap gap-1">
      {modes.map((mode) => (
        <span
          key={mode}
          className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-plasma-orange/15 text-plasma-orange border border-plasma-orange/25"
        >
          {mode}
        </span>
      ))}
    </div>
  );
});

const ActiveBadge = memo(function ActiveBadge() {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold bg-signal-green/20 text-signal-green border border-signal-green/40 animate-pulse">
      <span className="w-1.5 h-1.5 rounded-full bg-signal-green" />
      LIVE
    </span>
  );
});

// ---------------------------------------------------------------------------
// Contest Entry Card
// ---------------------------------------------------------------------------

const ContestEntryCard = memo(function ContestEntryCard({
  entry,
  onStartContest,
}: {
  entry: ContestCalendarEntry;
  onStartContest?: (definitionId: string) => void;
}) {
  const active = isActiveNow(entry);
  const duration = getDurationHours(entry.startUtc, entry.endUtc);

  return (
    <div
      className={`relative rounded-lg border p-4 transition-colors ${
        active
          ? "border-signal-green/40 bg-signal-green/5"
          : "border-white/10 bg-void-black/40 hover:border-white/20 hover:bg-void-black/60"
      }`}
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-semibold text-white truncate">
              {entry.name}
            </h3>
            {active && <ActiveBadge />}
            <DifficultyBadge difficulty={entry.difficulty} />
          </div>
          <p className="text-xs text-gray-400 mt-0.5">
            {entry.sponsor} &middot; {duration}h &middot;{" "}
            {formatParticipants(entry.estimatedParticipants)} participants
          </p>
        </div>

        {/* Start Contest button */}
        {entry.definitionId && onStartContest && (
          <button
            type="button"
            onClick={() => onStartContest(entry.definitionId!)}
            className="shrink-0 px-3 py-1.5 rounded text-xs font-medium bg-plasma-orange/20 text-plasma-orange border border-plasma-orange/30 hover:bg-plasma-orange/30 transition-colors"
          >
            Start Contest
          </button>
        )}
      </div>

      {/* Date range */}
      <div className="mb-2 space-y-0.5">
        <p className="text-xs text-gray-300 font-mono">
          {formatUtcRange(entry.startUtc, entry.endUtc)}
        </p>
        <p className="text-[11px] text-gray-500">
          Local: {formatDateRange(entry.startUtc, entry.endUtc)}
        </p>
      </div>

      {/* Bands and modes */}
      <div className="flex items-center gap-3 mb-2">
        <BandPills bands={entry.bands} />
        <ModePills modes={entry.modes} />
      </div>

      {/* Exchange */}
      <p className="text-xs text-gray-400 mb-1">
        <span className="text-gray-500">Exchange:</span> {entry.exchange}
      </p>

      {/* Description */}
      <p className="text-xs text-gray-500 leading-relaxed">
        {entry.description}
      </p>

      {/* Footer: tags + rules link */}
      <div className="flex items-center justify-between mt-3 pt-2 border-t border-white/5">
        <div className="flex flex-wrap gap-1">
          {entry.tags.slice(0, 5).map((tag) => (
            <span
              key={tag}
              className="px-1.5 py-0.5 rounded text-[10px] text-gray-500 bg-white/5"
            >
              #{tag}
            </span>
          ))}
        </div>
        {entry.rulesUrl && (
          <a
            href={entry.rulesUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[11px] text-nebula-blue hover:text-nebula-blue/80 hover:underline"
          >
            Official Rules
          </a>
        )}
      </div>
    </div>
  );
});

// ---------------------------------------------------------------------------
// Week Timeline Bar
// ---------------------------------------------------------------------------

const WeekTimeline = memo(function WeekTimeline({
  contests,
}: {
  contests: ContestCalendarEntry[];
}) {
  // Show a 7-day window starting from today
  const now = useMemo(() => new Date(), []);
  const startOfWindow = useMemo(() => {
    const d = new Date(now);
    d.setUTCHours(0, 0, 0, 0);
    return d;
  }, [now]);
  const endOfWindow = useMemo(
    () => new Date(startOfWindow.getTime() + 7 * 24 * 60 * 60 * 1000),
    [startOfWindow],
  );

  const windowMs = endOfWindow.getTime() - startOfWindow.getTime();

  // Filter contests that overlap this 7-day window
  const overlapping = useMemo(
    () =>
      contests.filter((c) => {
        const cs = new Date(c.startUtc).getTime();
        const ce = new Date(c.endUtc).getTime();
        return cs < endOfWindow.getTime() && ce > startOfWindow.getTime();
      }),
    [contests, startOfWindow, endOfWindow],
  );

  // Day labels
  const dayLabels = useMemo(() => {
    const labels: string[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(startOfWindow.getTime() + i * 24 * 60 * 60 * 1000);
      labels.push(
        d.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" }),
      );
    }
    return labels;
  }, [startOfWindow]);

  if (overlapping.length === 0) return null;

  return (
    <div className="rounded-lg border border-white/10 bg-void-black/40 p-3 mb-4">
      <h4 className="text-xs font-medium text-gray-400 mb-2">
        This Week's Contests
      </h4>

      {/* Day grid header */}
      <div className="relative">
        <div className="flex">
          {dayLabels.map((label, i) => (
            <div
              key={i}
              className="flex-1 text-center text-[10px] text-gray-500 border-r border-white/5 last:border-r-0 pb-1"
            >
              {label}
            </div>
          ))}
        </div>

        {/* Contest bars */}
        <div className="relative mt-1 space-y-1">
          {overlapping.map((c) => {
            const cs = Math.max(
              new Date(c.startUtc).getTime(),
              startOfWindow.getTime(),
            );
            const ce = Math.min(
              new Date(c.endUtc).getTime(),
              endOfWindow.getTime(),
            );
            const leftPct = ((cs - startOfWindow.getTime()) / windowMs) * 100;
            const widthPct = ((ce - cs) / windowMs) * 100;
            const active = isActiveNow(c);

            return (
              <div key={c.id} className="relative h-5">
                <div
                  className={`absolute top-0 h-full rounded-sm flex items-center px-1 overflow-hidden ${
                    active
                      ? "bg-signal-green/30 border border-signal-green/50"
                      : "bg-plasma-orange/20 border border-plasma-orange/30"
                  }`}
                  style={{
                    left: `${leftPct}%`,
                    width: `${Math.max(widthPct, 2)}%`,
                  }}
                  title={`${c.name}: ${formatUtcRange(c.startUtc, c.endUtc)}`}
                >
                  <span className="text-[9px] text-white/80 truncate font-medium">
                    {c.name}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
});

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function ContestCalendar({
  onStartContest,
  className = "",
}: ContestCalendarProps) {
  // Filters and sorting
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [modeFilter, setModeFilter] = useState<ModeFilter>("all");
  const [difficultyFilter, setDifficultyFilter] =
    useState<DifficultyFilter>("all");
  const [weekendOnly, setWeekendOnly] = useState(false);

  // Calendar context for active/upcoming awareness
  const { isContestWeekend } = useContestContext();

  // Combine all contests for display (active + full dataset for upcoming)
  const allContests = useMemo(() => {
    const now = Date.now();
    // Show: currently active + future contests
    return CONTEST_CALENDAR_2026.filter((c) => {
      const end = new Date(c.endUtc).getTime();
      return end >= now;
    });
  }, []);

  // Apply filters
  const filtered = useMemo(() => {
    let result = allContests;

    if (modeFilter !== "all") {
      result = result.filter((c) => matchesModeFilter(c.modes, modeFilter));
    }

    if (difficultyFilter !== "all") {
      result = result.filter((c) => c.difficulty === difficultyFilter);
    }

    if (weekendOnly) {
      result = result.filter((c) => isThisWeekend(c.startUtc));
    }

    return result;
  }, [allContests, modeFilter, difficultyFilter, weekendOnly]);

  // Apply sorting
  const sorted = useMemo(() => {
    const copy = [...filtered];
    switch (sortKey) {
      case "date":
        copy.sort(
          (a, b) =>
            new Date(a.startUtc).getTime() - new Date(b.startUtc).getTime(),
        );
        break;
      case "difficulty":
        copy.sort(
          (a, b) =>
            (DIFFICULTY_ORDER[a.difficulty] ?? 1) -
            (DIFFICULTY_ORDER[b.difficulty] ?? 1),
        );
        break;
      case "size":
        copy.sort((a, b) => b.estimatedParticipants - a.estimatedParticipants);
        break;
    }
    return copy;
  }, [filtered, sortKey]);

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white">Contest Calendar</h2>
          <p className="text-xs text-gray-500">
            {sorted.length} contest{sorted.length !== 1 ? "s" : ""}{" "}
            {isContestWeekend && (
              <span className="text-signal-green font-medium">
                &middot; Contest weekend active
              </span>
            )}
          </p>
        </div>
      </div>

      {/* Week Timeline */}
      <WeekTimeline contests={allContests} />

      {/* Filter Bar */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {/* Sort */}
        <div className="flex items-center gap-1">
          <span className="text-gray-500">Sort:</span>
          {(["date", "difficulty", "size"] as SortKey[]).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setSortKey(key)}
              className={`px-2 py-1 rounded transition-colors ${
                sortKey === key
                  ? "bg-plasma-orange/20 text-plasma-orange border border-plasma-orange/30"
                  : "text-gray-400 hover:text-white hover:bg-white/5"
              }`}
            >
              {key.charAt(0).toUpperCase() + key.slice(1)}
            </button>
          ))}
        </div>

        <span className="text-white/10">|</span>

        {/* Mode filter */}
        <div className="flex items-center gap-1">
          <span className="text-gray-500">Mode:</span>
          {(
            ["all", "CW", "SSB", "RTTY", "Digital", "Mixed"] as ModeFilter[]
          ).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setModeFilter(m)}
              className={`px-2 py-1 rounded transition-colors ${
                modeFilter === m
                  ? "bg-nebula-blue/20 text-nebula-blue border border-nebula-blue/30"
                  : "text-gray-400 hover:text-white hover:bg-white/5"
              }`}
            >
              {m === "all" ? "All" : m}
            </button>
          ))}
        </div>

        <span className="text-white/10">|</span>

        {/* Difficulty filter */}
        <div className="flex items-center gap-1">
          <span className="text-gray-500">Level:</span>
          {(
            [
              "all",
              "beginner",
              "intermediate",
              "advanced",
            ] as DifficultyFilter[]
          ).map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDifficultyFilter(d)}
              className={`px-2 py-1 rounded transition-colors ${
                difficultyFilter === d
                  ? "bg-caution-amber/20 text-caution-amber border border-caution-amber/30"
                  : "text-gray-400 hover:text-white hover:bg-white/5"
              }`}
            >
              {d === "all" ? "All" : d.charAt(0).toUpperCase() + d.slice(1)}
            </button>
          ))}
        </div>

        <span className="text-white/10">|</span>

        {/* Weekend toggle */}
        <button
          type="button"
          onClick={() => setWeekendOnly((prev) => !prev)}
          className={`px-2 py-1 rounded transition-colors ${
            weekendOnly
              ? "bg-signal-green/20 text-signal-green border border-signal-green/30"
              : "text-gray-400 hover:text-white hover:bg-white/5"
          }`}
        >
          This Weekend
        </button>
      </div>

      {/* Contest List */}
      <div className="space-y-3">
        {sorted.length === 0 ? (
          <div className="text-center py-8 text-gray-500 text-sm">
            No contests match the current filters.
          </div>
        ) : (
          sorted.map((entry) => (
            <ContestEntryCard
              key={entry.id}
              entry={entry}
              onStartContest={onStartContest}
            />
          ))
        )}
      </div>
    </div>
  );
}
