/**
 * ContestExplorerPage — Contest Discovery & Exploration
 *
 * A beginner-friendly page for discovering ham radio contests. Includes
 * search, filter chips, and a responsive card grid with station estimates
 * and quick-start guides for each contest.
 *
 * Route: /contests
 *
 * @module pages/ContestExplorerPage
 */

import { useState, useMemo } from "react";
import { CONTEST_CALENDAR_2026 } from "@/lib/data/contestCalendar";
import { CONTEST_DATABASE } from "@/lib/data/contests";
import type { ContestCalendarEntry } from "@/lib/contest/contestCalendarTypes";
import type { ContestDefinition } from "@/types/contest";
import { useContestContext } from "@/hooks/useContestContext";
import { ContestExplorerCard } from "@/components/contest/ContestExplorerCard";
import { StationEstimate } from "@/components/contest/StationEstimate";

// ---------------------------------------------------------------------------
// Filter types
// ---------------------------------------------------------------------------

type ModeFilter = "all" | "CW" | "SSB" | "Digital" | "Mixed";
type DifficultyFilter = "all" | "beginner" | "intermediate" | "advanced";
type TimeFilter = "all" | "this-weekend" | "this-month" | "upcoming";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a lookup map from definitionId -> ContestDefinition */
function buildDefinitionMap(): Map<string, ContestDefinition> {
  const map = new Map<string, ContestDefinition>();
  for (const def of CONTEST_DATABASE) {
    map.set(def.id, def);
  }
  return map;
}

const DEFINITION_MAP = buildDefinitionMap();

/** Check if a contest matches a mode filter */
function matchesMode(entry: ContestCalendarEntry, filter: ModeFilter): boolean {
  if (filter === "all") return true;

  const modes = entry.modes.map((m) => m.toUpperCase());

  switch (filter) {
    case "CW":
      return modes.includes("CW");
    case "SSB":
      return modes.includes("SSB");
    case "Digital":
      return (
        modes.includes("RTTY") ||
        modes.includes("DIGITAL") ||
        modes.includes("FT8") ||
        modes.includes("FT4")
      );
    case "Mixed":
      return modes.length > 1;
    default:
      return true;
  }
}

/** Check if a contest falls within a time filter window */
function matchesTimeframe(
  entry: ContestCalendarEntry,
  filter: TimeFilter,
  now: Date,
): boolean {
  if (filter === "all") return true;

  const startMs = new Date(entry.startUtc).getTime();
  const endMs = new Date(entry.endUtc).getTime();
  const nowMs = now.getTime();

  switch (filter) {
    case "this-weekend": {
      // Current Friday 00:00 UTC through Sunday 23:59 UTC
      const day = now.getUTCDay(); // 0=Sun, 6=Sat
      const daysToFriday = (5 - day + 7) % 7 || 0;
      const friday = new Date(now);
      friday.setUTCDate(
        friday.getUTCDate() +
          (daysToFriday === 0 && day <= 0 ? 0 : daysToFriday),
      );
      friday.setUTCHours(0, 0, 0, 0);
      // If we're already past Friday, use current week's Friday
      if (day >= 5 || day === 0) {
        const diff = day === 0 ? -2 : -(day - 5);
        friday.setUTCDate(now.getUTCDate() + diff);
      }
      const sunday = new Date(friday);
      sunday.setUTCDate(friday.getUTCDate() + 2);
      sunday.setUTCHours(23, 59, 59, 999);

      const fridayMs = friday.getTime();
      const sundayMs = sunday.getTime();
      // Contest overlaps this weekend
      return startMs <= sundayMs && endMs >= fridayMs;
    }
    case "this-month": {
      const monthStart = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
      );
      const monthEnd = new Date(
        Date.UTC(
          now.getUTCFullYear(),
          now.getUTCMonth() + 1,
          0,
          23,
          59,
          59,
          999,
        ),
      );
      return startMs <= monthEnd.getTime() && endMs >= monthStart.getTime();
    }
    case "upcoming":
      // Next 30 days
      return startMs > nowMs && startMs <= nowMs + 30 * 24 * 60 * 60 * 1000;
    default:
      return true;
  }
}

// ---------------------------------------------------------------------------
// Filter chip component
// ---------------------------------------------------------------------------

function FilterChip<T extends string>({
  label,
  value,
  active,
  onClick,
}: {
  label: string;
  value: T;
  active: boolean;
  onClick: (value: T) => void;
}) {
  return (
    <button
      type="button"
      className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-colors
        ${
          active
            ? "bg-plasma-orange/20 text-plasma-orange border-plasma-orange/30"
            : "bg-white/5 text-gray-400 border-white/5 hover:bg-white/10 hover:text-gray-300"
        }`}
      onClick={() => onClick(value)}
    >
      {label}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function ContestExplorerPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [modeFilter, setModeFilter] = useState<ModeFilter>("all");
  const [difficultyFilter, setDifficultyFilter] =
    useState<DifficultyFilter>("all");
  const [timeFilter, setTimeFilter] = useState<TimeFilter>("all");

  const { activeContests } = useContestContext();

  const now = useMemo(() => new Date(), []);

  // Filtered and sorted contest list
  const filteredContests = useMemo(() => {
    const query = searchQuery.toLowerCase().trim();

    return CONTEST_CALENDAR_2026.filter((entry) => {
      // Search filter
      if (query) {
        const searchable =
          `${entry.name} ${entry.sponsor} ${entry.description} ${entry.tags.join(" ")}`.toLowerCase();
        if (!searchable.includes(query)) return false;
      }

      // Mode filter
      if (!matchesMode(entry, modeFilter)) return false;

      // Difficulty filter
      if (difficultyFilter !== "all" && entry.difficulty !== difficultyFilter)
        return false;

      // Time filter
      if (!matchesTimeframe(entry, timeFilter, now)) return false;

      return true;
    }).sort(
      (a, b) => new Date(a.startUtc).getTime() - new Date(b.startUtc).getTime(),
    );
  }, [searchQuery, modeFilter, difficultyFilter, timeFilter, now]);

  const hasActiveContests = activeContests.length > 0;

  return (
    <div className="min-h-screen pb-24">
      {/* Header */}
      <div className="px-4 pt-6 pb-4 max-w-7xl mx-auto">
        <h1 className="text-2xl font-bold text-white mb-1">Contest Explorer</h1>
        <p className="text-sm text-gray-400 max-w-2xl">
          Discover ham radio contests, learn what to expect, and estimate your
          performance. Whether you are a first-timer or a seasoned operator,
          there is a contest for you.
        </p>
      </div>

      {/* Active contest banner */}
      {hasActiveContests && (
        <div className="px-4 max-w-7xl mx-auto mb-4">
          <div className="rounded-xl border border-signal-green/20 bg-signal-green/5 px-4 py-3 flex items-center gap-3">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-signal-green opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-signal-green" />
            </span>
            <span className="text-sm text-signal-green font-medium">
              {activeContests.length === 1
                ? `${activeContests[0].name} is live right now!`
                : `${activeContests.length} contests are live right now!`}
            </span>
          </div>
        </div>
      )}

      {/* Station estimate summary */}
      <div className="px-4 max-w-7xl mx-auto mb-4">
        <StationEstimate className="max-w-md" />
      </div>

      {/* Search bar */}
      <div className="px-4 max-w-7xl mx-auto mb-3">
        <div className="relative max-w-md">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          <input
            type="text"
            placeholder="Search contests..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-panel border border-white/5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-plasma-orange/30 focus:ring-1 focus:ring-plasma-orange/20 transition-colors"
          />
        </div>
      </div>

      {/* Filter chips */}
      <div className="px-4 max-w-7xl mx-auto mb-6 space-y-2">
        {/* Mode filters */}
        <div className="flex flex-wrap gap-2">
          <span className="text-xs text-gray-500 py-1.5 mr-1">Mode:</span>
          {(["all", "CW", "SSB", "Digital", "Mixed"] as ModeFilter[]).map(
            (m) => (
              <FilterChip
                key={m}
                label={m === "all" ? "All Modes" : m}
                value={m}
                active={modeFilter === m}
                onClick={setModeFilter}
              />
            ),
          )}
        </div>

        {/* Difficulty filters */}
        <div className="flex flex-wrap gap-2">
          <span className="text-xs text-gray-500 py-1.5 mr-1">Level:</span>
          {(
            [
              "all",
              "beginner",
              "intermediate",
              "advanced",
            ] as DifficultyFilter[]
          ).map((d) => (
            <FilterChip
              key={d}
              label={
                d === "all"
                  ? "All Levels"
                  : d.charAt(0).toUpperCase() + d.slice(1)
              }
              value={d}
              active={difficultyFilter === d}
              onClick={setDifficultyFilter}
            />
          ))}
        </div>

        {/* Time filters */}
        <div className="flex flex-wrap gap-2">
          <span className="text-xs text-gray-500 py-1.5 mr-1">When:</span>
          {(
            [
              ["all", "All Year"],
              ["this-weekend", "This Weekend"],
              ["this-month", "This Month"],
              ["upcoming", "Next 30 Days"],
            ] as [TimeFilter, string][]
          ).map(([value, label]) => (
            <FilterChip
              key={value}
              label={label}
              value={value}
              active={timeFilter === value}
              onClick={setTimeFilter}
            />
          ))}
        </div>
      </div>

      {/* Results count */}
      <div className="px-4 max-w-7xl mx-auto mb-4">
        <p className="text-xs text-gray-500">
          {filteredContests.length === 0
            ? "No contests match your filters"
            : `${filteredContests.length} contest${filteredContests.length === 1 ? "" : "s"} found`}
        </p>
      </div>

      {/* Card grid */}
      {filteredContests.length > 0 ? (
        <div className="px-4 max-w-7xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filteredContests.map((entry) => (
              <ContestExplorerCard
                key={entry.id}
                entry={entry}
                definition={
                  entry.definitionId
                    ? DEFINITION_MAP.get(entry.definitionId)
                    : undefined
                }
              />
            ))}
          </div>
        </div>
      ) : (
        /* Empty state */
        <div className="px-4 max-w-7xl mx-auto">
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mb-4">
              <svg
                className="w-8 h-8 text-gray-600"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
            </div>
            <h3 className="text-white font-semibold mb-2">No contests found</h3>
            <p className="text-sm text-gray-400 max-w-sm">
              Try adjusting your filters or search query. There are 30 contests
              in the 2026 calendar — something will fit your interests!
            </p>
            <button
              type="button"
              className="mt-4 px-4 py-2 text-sm font-medium text-plasma-orange bg-plasma-orange/10 rounded-lg hover:bg-plasma-orange/20 transition-colors"
              onClick={() => {
                setSearchQuery("");
                setModeFilter("all");
                setDifficultyFilter("all");
                setTimeFilter("all");
              }}
            >
              Clear All Filters
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
