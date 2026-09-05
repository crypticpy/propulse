/**
 * ContestWeatherCard Component
 *
 * Dashboard card providing at-a-glance contest situational awareness.
 * Shows active contests with countdown, activity level, and bands --
 * or upcoming contests when nothing is currently running.
 *
 * Feature 7.2 from the Contest Awareness & Community PRD.
 *
 * @module components/dashboard/ContestWeatherCard
 */

import { useState, useCallback } from "react";
import { useContestContext } from "@/hooks/useContestContext";
import { useSettingsStore } from "@/stores/settingsStore";
import { ContestCountdown } from "./ContestCountdown";
import { Card } from "@/components/ui/Card";
import type { ContestCalendarEntry } from "@/lib/contest/contestCalendarTypes";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type ActivityLevel = "low" | "medium" | "high" | "extreme";

interface ActivityInfo {
  level: ActivityLevel;
  label: string;
  colorClass: string;
  dotClass: string;
}

function getActivityInfo(participants: number): ActivityInfo {
  if (participants > 30_000) {
    return {
      level: "extreme",
      label: "Extreme",
      colorClass: "text-alert-red",
      dotClass: "bg-alert-red",
    };
  }
  if (participants > 10_000) {
    return {
      level: "high",
      label: "High",
      colorClass: "text-plasma-orange",
      dotClass: "bg-plasma-orange",
    };
  }
  if (participants >= 1_000) {
    return {
      level: "medium",
      label: "Medium",
      colorClass: "text-caution-yellow",
      dotClass: "bg-caution-yellow",
    };
  }
  return {
    level: "low",
    label: "Low",
    colorClass: "text-signal-green",
    dotClass: "bg-signal-green",
  };
}

function formatDateRange(startUtc: string, endUtc: string): string {
  const start = new Date(startUtc);
  const end = new Date(endUtc);
  const opts: Intl.DateTimeFormatOptions = {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
  };
  return `${start.toLocaleDateString("en-US", opts)} - ${end.toLocaleDateString("en-US", opts)} UTC`;
}

function formatModeBadges(modes: string[]): string {
  return modes.join(" / ");
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ContestWeatherIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {/* Trophy icon */}
      <path d="M6 9H4.5a2.5 2.5 0 010-5H6" />
      <path d="M18 9h1.5a2.5 2.5 0 000-5H18" />
      <path d="M4 22h16" />
      <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20 7 22" />
      <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20 17 22" />
      <path d="M18 2H6v7a6 6 0 0012 0V2z" />
    </svg>
  );
}

function CollapseChevron({ collapsed }: { collapsed: boolean }) {
  return (
    <svg
      className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${collapsed ? "-rotate-90" : ""}`}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M19 9l-7 7-7-7"
      />
    </svg>
  );
}

/** First-time tooltip explaining contest weekends to newcomers */
function FirstTimeTooltip({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div className="mb-3 p-3 rounded-xl bg-nebula-blue/10 border border-nebula-blue/30 text-sm">
      <p className="text-gray-300 leading-relaxed">
        A ham radio contest is happening &mdash; thousands of operators are
        making brief contacts to compete. Bands will be busier than usual.
      </p>
      <div className="flex items-center justify-between mt-2">
        <a
          href="https://www.arrl.org/contest-faq"
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-nebula-blue hover:text-white transition-colors"
        >
          Learn more
        </a>
        <button
          type="button"
          onClick={onDismiss}
          className="text-xs text-gray-400 hover:text-white transition-colors px-2 py-0.5 rounded hover:bg-white/10"
        >
          Got it
        </button>
      </div>
    </div>
  );
}

/** Single active contest row */
function ActiveContestRow({ contest }: { contest: ContestCalendarEntry }) {
  const activity = getActivityInfo(contest.estimatedParticipants);

  return (
    <div className="py-2.5 first:pt-0 last:pb-0">
      {/* Contest name & activity level */}
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <div className="min-w-0 flex-1">
          <h4 className="text-sm font-medium text-white truncate">
            {contest.name}
          </h4>
          <span className="text-[11px] text-gray-400">
            {formatModeBadges(contest.modes)}
          </span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <span
            className={`w-1.5 h-1.5 rounded-full ${activity.dotClass} ${activity.level === "extreme" || activity.level === "high" ? "animate-pulse" : ""}`}
          />
          <span
            className={`text-[10px] font-medium uppercase tracking-wide ${activity.colorClass}`}
          >
            Estimated {activity.label.toLowerCase()}
          </span>
        </div>
      </div>

      {/* Countdown */}
      <div className="mb-1.5">
        <ContestCountdown targetUtc={contest.endUtc} isActive />
      </div>

      {/* Band pills */}
      {contest.bands.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {contest.bands.map((band) => (
            <span
              key={band}
              className="px-1.5 py-0.5 text-[10px] font-mono rounded bg-white/5 border border-white/10 text-gray-300"
            >
              {band}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/** Single upcoming contest row */
function UpcomingContestRow({ contest }: { contest: ContestCalendarEntry }) {
  return (
    <div className="py-2.5 first:pt-0 last:pb-0">
      <div className="flex items-start justify-between gap-2 mb-1">
        <h4 className="text-sm font-medium text-white truncate flex-1 min-w-0">
          {contest.name}
        </h4>
        <span className="text-[10px] text-gray-400 font-mono shrink-0">
          {formatModeBadges(contest.modes)}
        </span>
      </div>
      <div className="text-[11px] text-gray-400 mb-1">
        {formatDateRange(contest.startUtc, contest.endUtc)}
      </div>
      <div className="mb-1.5">
        <ContestCountdown targetUtc={contest.startUtc} isActive={false} />
      </div>
      {contest.description && (
        <p className="text-[11px] text-gray-500 leading-relaxed line-clamp-2">
          {contest.description}
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export interface ContestWeatherCardProps {
  className?: string;
}

export function ContestWeatherCard({
  className = "",
}: ContestWeatherCardProps) {
  const { activeContests, upcomingContests, isContestWeekend, quietBands } =
    useContestContext();

  const contestWeatherFirstTimeSeen = useSettingsStore(
    (s) => s.contestWeatherFirstTimeSeen,
  );
  const contestWeatherDismissedUntil = useSettingsStore(
    (s) => s.contestWeatherDismissedUntil,
  );
  const updatePreferences = useSettingsStore((s) => s.updatePreferences);

  const [collapsed, setCollapsed] = useState(false);

  const handleDismissTooltip = useCallback(() => {
    updatePreferences({ contestWeatherFirstTimeSeen: true });
  }, [updatePreferences]);

  // Check if card is temporarily dismissed
  if (contestWeatherDismissedUntil) {
    const dismissedUntil = new Date(contestWeatherDismissedUntil).getTime();
    if (Date.now() < dismissedUntil) return null;
  }

  // No active and no upcoming contests -- don't render
  const nextThree = upcomingContests.slice(0, 3);
  if (!isContestWeekend && nextThree.length === 0) return null;

  const showFirstTimeTooltip = isContestWeekend && !contestWeatherFirstTimeSeen;

  return (
    <Card
      className={`relative ${className}`}
      role="region"
      aria-label="Contest weather"
    >
      {/* Header */}
      <button
        type="button"
        className="w-full flex items-center justify-between gap-2 mb-2"
        onClick={() => setCollapsed((prev) => !prev)}
        aria-expanded={!collapsed}
        aria-controls="contest-weather-content"
      >
        <div className="flex items-center gap-1.5">
          <ContestWeatherIcon
            className={`w-3.5 h-3.5 ${isContestWeekend ? "text-plasma-orange" : "text-gray-400"}`}
          />
          <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wide">
            Contest Weather
          </span>
          {isContestWeekend && (
            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-plasma-orange/15 text-plasma-orange border border-plasma-orange/30">
              Scheduled now
            </span>
          )}
        </div>
        <CollapseChevron collapsed={collapsed} />
      </button>

      {/* Collapsible Content */}
      {!collapsed && (
        <div id="contest-weather-content">
          {/* First-time tooltip */}
          {showFirstTimeTooltip && (
            <FirstTimeTooltip onDismiss={handleDismissTooltip} />
          )}

          {isContestWeekend ? (
            <>
              {/* Active Contests */}
              <div className="divide-y divide-white/5">
                {activeContests.map((contest) => (
                  <ActiveContestRow key={contest.id} contest={contest} />
                ))}
              </div>

              {/* Quiet Bands Callout */}
              {quietBands.length > 0 && (
                <div className="mt-3 pt-2.5 border-t border-white/10">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-signal-green" />
                    <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wide">
                      Contest-free bands
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {quietBands.map((band) => (
                      <span
                        key={band}
                        className="px-2 py-0.5 text-[11px] font-mono rounded-full bg-signal-green/10 border border-signal-green/20 text-signal-green"
                      >
                        {band}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <>
              {/* Upcoming Contests */}
              <div className="divide-y divide-white/5">
                {nextThree.map((contest) => (
                  <UpcomingContestRow key={contest.id} contest={contest} />
                ))}
              </div>

              {/* View full calendar link */}
              <div className="mt-2 pt-2 border-t border-white/10">
                <span className="text-[10px] text-gray-500">
                  View full calendar &rarr;{" "}
                  <span className="text-gray-600">(coming soon)</span>
                </span>
              </div>
            </>
          )}
        </div>
      )}
    </Card>
  );
}

ContestWeatherCard.displayName = "ContestWeatherCard";

export default ContestWeatherCard;
