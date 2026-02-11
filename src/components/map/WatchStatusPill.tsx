/**
 * WatchStatusPill Component
 *
 * A compact floating pill that shows the active watch status at a glance.
 * Displays criteria summary, match count, and match rate with visual states:
 *   - Hidden when no watch is active (criteria === null)
 *   - Idle (gray dot, muted text) when no recent matches within 10s
 *   - Recent match (green dot + pulse) when a match occurred within 10s
 *   - High rate (amber dot + pulse) when matchRate > 2/sec
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { useWatchStore, formatCriteriaSummary } from "@/stores/watchStore";
import type { WatchCriteria } from "@/stores/watchStore";
import { useContestWatch } from "@/hooks/useContestWatch";

interface WatchStatusPillProps {
  className?: string;
}

type PillState = "idle" | "recent" | "highRate";

function usePillState(
  lastMatchTime: number | null,
  matchRate: number,
): PillState {
  const [isRecent, setIsRecent] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const updateRecent = useCallback(() => {
    if (lastMatchTime === null) {
      setIsRecent(false);
      return;
    }
    const elapsed = Date.now() - lastMatchTime;
    if (elapsed < 10_000) {
      setIsRecent(true);
      // Schedule flip to idle when the 10s window expires
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
      }
      timerRef.current = setTimeout(() => {
        setIsRecent(false);
        timerRef.current = null;
      }, 10_000 - elapsed);
    } else {
      setIsRecent(false);
    }
  }, [lastMatchTime]);

  useEffect(() => {
    updateRecent();
    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
      }
    };
  }, [updateRecent]);

  if (matchRate > 2) return "highRate";
  if (isRecent) return "recent";
  return "idle";
}

export function WatchStatusPill({ className }: WatchStatusPillProps) {
  const criteria = useWatchStore((s) => s.criteria) as WatchCriteria | null;
  const matchCount = useWatchStore((s) => s.matchCount);
  const matchRate = useWatchStore((s) => s.matchRate);
  const lastMatchTime = useWatchStore((s) => s.lastMatchTime);

  const contestWatch = useContestWatch();
  const pillState = usePillState(lastMatchTime, matchRate);

  // Hidden when no watch is active
  if (criteria === null) {
    return null;
  }

  const summary = formatCriteriaSummary(criteria);

  const dotClass =
    pillState === "highRate"
      ? "bg-caution-amber"
      : pillState === "recent"
        ? "bg-signal-green"
        : "bg-white/30";

  const textClass =
    pillState === "highRate"
      ? "text-caution-amber"
      : pillState === "recent"
        ? "text-signal-green"
        : "text-white/50";

  const isPulsing = pillState === "recent" || pillState === "highRate";

  return (
    <div
      className={`
        inline-flex items-center gap-2
        bg-void-black/80 backdrop-blur-sm border border-white/10 rounded-full
        px-3 py-1 text-xs font-medium select-none
        ${textClass}
        ${className ?? ""}
      `}
      role="status"
      aria-label={`Watch: ${summary} - ${matchCount} matches, ${matchRate.toFixed(1)} per second`}
    >
      {/* Status dot */}
      <span
        className={`
          inline-block w-1 h-1 rounded-full flex-shrink-0
          ${dotClass}
        `}
        style={
          isPulsing
            ? {
                animation: "watchPulse 1.5s ease-in-out infinite",
              }
            : undefined
        }
        aria-hidden="true"
      />

      {/* Criteria summary */}
      <span className="truncate max-w-[160px]">{summary}</span>

      {/* Separator */}
      <span className="text-white/20" aria-hidden="true">
        —
      </span>

      {/* Match count */}
      <span className="tabular-nums whitespace-nowrap">
        {matchCount} {matchCount === 1 ? "match" : "matches"}
      </span>

      {/* Match rate (only when > 0) */}
      {matchRate > 0 && (
        <>
          <span className="text-white/20" aria-hidden="true">
            ·
          </span>
          <span
            className={`tabular-nums whitespace-nowrap ${
              matchRate > 2 ? "text-caution-amber" : ""
            }`}
            style={
              matchRate > 2
                ? {
                    animation: "watchPulse 1.5s ease-in-out infinite",
                  }
                : undefined
            }
          >
            {matchRate.toFixed(1)}/s
          </span>
        </>
      )}

      {/* Contest mode: rate + needed mults */}
      {contestWatch.isContestWatchActive && (
        <>
          <span className="text-white/20" aria-hidden="true">
            ·
          </span>
          <span className="tabular-nums whitespace-nowrap text-caution-amber">
            {contestWatch.ratePerHour}/hr
          </span>
          {contestWatch.neededMultCount > 0 && (
            <>
              <span className="text-white/20" aria-hidden="true">
                ·
              </span>
              <span className="tabular-nums whitespace-nowrap text-caution-amber/70">
                {contestWatch.neededMultCount} needed
              </span>
            </>
          )}
        </>
      )}

      {/* Pulse animation keyframes */}
      <style>{`
        @keyframes watchPulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.6; }
        }
      `}</style>
    </div>
  );
}

WatchStatusPill.displayName = "WatchStatusPill";

export default WatchStatusPill;
