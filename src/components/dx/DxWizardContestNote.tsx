/**
 * DxWizardContestNote Component
 *
 * Inline callout rendered within DX Wizard results to provide contest
 * awareness. Shows two modes:
 *
 * - **Non-contester**: Warns about band congestion during active contests
 *   and suggests quieter alternatives (WARC bands, etc.)
 * - **Contester**: Highlights which bands are best for multipliers based
 *   on current propagation context.
 *
 * Informational, not judgmental. Encourages beginners to explore
 * alternatives rather than warning them off bands.
 *
 * Feature 7.10 from the Contest Awareness & Community PRD.
 *
 * @module components/dx/DxWizardContestNote
 */

import { useMemo, useState } from "react";

import type { ContestCalendarContext } from "@/lib/contest/contestCalendarTypes";
import {
  estimateCongestion,
  getAlternatives,
  type CongestionContext,
  type CongestionLevel,
} from "@/lib/contest/contestCongestionModel";
import { QuietBandNav } from "@/components/contest/QuietBandNav";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface DxWizardContestNoteProps {
  /** Bands currently under analysis in the DX Wizard */
  targetBands: string[];
  /** Contest calendar context from useContestContext */
  contestContext: ContestCalendarContext;
  /** Optional CSS class for container */
  className?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Map congestion level to dot color */
const LEVEL_COLORS: Record<CongestionLevel, string> = {
  clear: "bg-signal-green",
  light: "bg-signal-green/70",
  moderate: "bg-caution-amber",
  heavy: "bg-plasma-orange",
  extreme: "bg-alert-red",
};

/** Map congestion level to label text color */
const LEVEL_TEXT_COLORS: Record<CongestionLevel, string> = {
  clear: "text-signal-green",
  light: "text-signal-green/80",
  moderate: "text-caution-amber",
  heavy: "text-plasma-orange",
  extreme: "text-alert-red",
};

/** Friendly label for congestion levels */
const LEVEL_LABELS: Record<CongestionLevel, string> = {
  clear: "Clear",
  light: "Light",
  moderate: "Moderate",
  heavy: "Heavy",
  extreme: "Packed",
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ChevronIcon({
  expanded,
  className = "",
}: {
  expanded: boolean;
  className?: string;
}) {
  return (
    <svg
      className={`w-3.5 h-3.5 transition-transform ${expanded ? "rotate-180" : ""} ${className}`}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      viewBox="0 0 24 24"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
    </svg>
  );
}

function RadioIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4.9 19.1C1 15.2 1 8.8 4.9 4.9" />
      <path d="M7.8 16.2c-2.3-2.3-2.3-6.1 0-8.4" />
      <circle cx="12" cy="12" r="2" />
      <path d="M16.2 7.8c2.3 2.3 2.3 6.1 0 8.4" />
      <path d="M19.1 4.9C23 8.8 23 15.1 19.1 19" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Congestion Badge
// ---------------------------------------------------------------------------

function CongestionBadge({
  band,
  level,
  score,
}: {
  band: string;
  level: CongestionLevel;
  score: number;
}) {
  return (
    <div
      className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-white/5 border border-white/10"
      title={`${band}: ${LEVEL_LABELS[level]} congestion (${score}/100)`}
    >
      <span className={`w-2 h-2 rounded-full ${LEVEL_COLORS[level]}`} />
      <span className="text-xs font-mono text-gray-300">{band}</span>
      <span className={`text-[10px] font-medium ${LEVEL_TEXT_COLORS[level]}`}>
        {LEVEL_LABELS[level]}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function DxWizardContestNote({
  targetBands,
  contestContext,
  className = "",
}: DxWizardContestNoteProps) {
  const [showWhy, setShowWhy] = useState(false);
  const [showQuietBands, setShowQuietBands] = useState(false);

  const { activeContests, isContestWeekend, quietBands } = contestContext;

  // Build congestion context
  const congestionContext = useMemo<CongestionContext>(
    () => ({
      activeContests,
      isContestWeekend,
      currentHourUtc: new Date().getUTCHours(),
    }),
    [activeContests, isContestWeekend],
  );

  // Compute congestion for each target band
  const bandCongestion = useMemo(() => {
    if (!isContestWeekend || activeContests.length === 0) return [];

    return targetBands.map((band) => {
      // Use SSB as a general mode for the overview
      const estimate = estimateCongestion(band, "SSB", congestionContext);
      return { band, ...estimate };
    });
  }, [targetBands, congestionContext, isContestWeekend, activeContests.length]);

  // Get the most congested band for headline text
  const mostCongested = useMemo(() => {
    if (bandCongestion.length === 0) return null;
    return [...bandCongestion].sort((a, b) => b.score - a.score)[0];
  }, [bandCongestion]);

  // Get alternatives for the most congested band
  const alternatives = useMemo(() => {
    if (!mostCongested || mostCongested.score <= 10) return [];
    return getAlternatives(mostCongested.band, congestionContext).slice(0, 3);
  }, [mostCongested, congestionContext]);

  // Don't render if no contest is active
  if (!isContestWeekend || activeContests.length === 0) return null;

  // Don't render if all target bands are clear
  const hasCongestion = bandCongestion.some((b) => b.score > 10);
  if (!hasCongestion && alternatives.length === 0) return null;

  // Contest names for display
  const contestNames = activeContests
    .slice(0, 2)
    .map((c) => c.name)
    .join(", ");
  const moreCount = activeContests.length - 2;

  return (
    <div
      className={`rounded-xl bg-void-black/60 border border-white/10 backdrop-blur-sm overflow-hidden ${className}`}
    >
      {/* Header */}
      <div className="flex items-start gap-3 p-4">
        <div className="mt-0.5 flex-shrink-0">
          <RadioIcon className="w-5 h-5 text-caution-amber" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-semibold text-caution-amber uppercase tracking-wide">
              Contest Activity
            </span>
            <span className="w-1.5 h-1.5 rounded-full bg-caution-amber animate-pulse" />
          </div>
          <p className="text-sm text-gray-300 leading-relaxed">
            <span className="text-white font-medium">{contestNames}</span>
            {moreCount > 0 && (
              <span className="text-gray-500"> +{moreCount} more</span>
            )}{" "}
            {activeContests.length === 1 ? "is" : "are"} active right now.
            {mostCongested && mostCongested.score > 30 && (
              <> Expect contest traffic on the main HF bands.</>
            )}
          </p>

          {/* Congestion badges */}
          {bandCongestion.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-3">
              {bandCongestion.map((bc) => (
                <CongestionBadge
                  key={bc.band}
                  band={bc.band}
                  level={bc.level}
                  score={bc.score}
                />
              ))}
            </div>
          )}

          {/* Alternatives suggestion */}
          {alternatives.length > 0 && (
            <div className="mt-3 p-2.5 rounded-lg bg-white/[0.03] border border-white/5">
              <div className="text-[10px] text-gray-400 uppercase tracking-wide mb-1.5">
                Quieter alternatives
              </div>
              <div className="space-y-1">
                {alternatives.map((alt) => (
                  <div key={alt.band} className="flex items-center gap-2">
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${LEVEL_COLORS[alt.congestion.level]}`}
                    />
                    <span className="text-xs font-mono text-white">
                      {alt.band}
                    </span>
                    <span className="text-[10px] text-gray-400 truncate">
                      {alt.reason}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-3 mt-3">
            {quietBands.length > 0 && (
              <button
                type="button"
                onClick={() => setShowQuietBands((v) => !v)}
                className="text-[11px] text-signal-green hover:text-signal-green/80 transition-colors flex items-center gap-1"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-signal-green" />
                Contest-free bands
                <ChevronIcon expanded={showQuietBands} />
              </button>
            )}
            <button
              type="button"
              onClick={() => setShowWhy((v) => !v)}
              className="text-[11px] text-gray-500 hover:text-gray-300 transition-colors flex items-center gap-1"
            >
              Why am I seeing this?
              <ChevronIcon expanded={showWhy} />
            </button>
          </div>
        </div>
      </div>

      {/* Collapsible: QuietBandNav */}
      {showQuietBands && (
        <div className="px-4 pb-3">
          <QuietBandNav className="mt-0" />
        </div>
      )}

      {/* Collapsible: Explanation */}
      {showWhy && (
        <div className="px-4 pb-4 border-t border-white/5 pt-3">
          <p className="text-xs text-gray-400 leading-relaxed">
            During major contests, thousands of operators concentrate on the
            standard HF contest bands (160m through 10m). This can make it
            harder to find clear frequencies for casual QSOs. WARC bands (30m,
            17m, 12m) are always contest-free by gentleman&apos;s agreement and
            are great alternatives. Congestion estimates are based on contest
            size, time of day, and band characteristics.
          </p>
        </div>
      )}
    </div>
  );
}

DxWizardContestNote.displayName = "DxWizardContestNote";

export default DxWizardContestNote;
