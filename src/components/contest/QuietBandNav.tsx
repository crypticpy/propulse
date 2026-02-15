/**
 * QuietBandNav Component
 *
 * A compact widget showing contest-free bands during active contest weekends.
 * WARC bands (30m, 17m, 12m) are always shown as quiet. Additional non-contest
 * bands are included based on the active contest context.
 *
 * Only renders when isContestWeekend is true.
 *
 * Feature 7.5 from the Contest Awareness & Community PRD.
 *
 * @module components/contest/QuietBandNav
 */

import { useContestContext } from "@/hooks/useContestContext";
import { useSettingsStore } from "@/stores/settingsStore";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** WARC bands are always contest-free by gentleman's agreement */
const WARC_BANDS = new Set(["30m", "17m", "12m"]);

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function InfoIcon({ className = "" }: { className?: string }) {
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
      <circle cx="12" cy="12" r="10" />
      <path d="M12 16v-4" />
      <path d="M12 8h.01" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export interface QuietBandNavProps {
  className?: string;
}

export function QuietBandNav({ className = "" }: QuietBandNavProps) {
  const { isContestWeekend, quietBands } = useContestContext();
  const showQuietBandNav = useSettingsStore((s) => s.showQuietBandNav ?? true);

  // Only render during active contest weekends and when not hidden
  if (!isContestWeekend || !showQuietBandNav) return null;

  // No quiet bands available (unlikely but possible)
  if (quietBands.length === 0) return null;

  return (
    <div
      className={`rounded-xl bg-white/[0.03] border border-white/10 p-3 ${className}`}
      role="navigation"
      aria-label="Contest-free bands"
    >
      {/* Header */}
      <div className="flex items-center gap-1.5 mb-2">
        <span className="w-1.5 h-1.5 rounded-full bg-signal-green" />
        <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wide">
          Contest-free bands
        </span>
        <InfoIcon className="w-3 h-3 text-gray-500" />
      </div>

      {/* Band pills */}
      <div className="flex flex-wrap gap-1.5">
        {quietBands.map((band) => {
          const isWarc = WARC_BANDS.has(band);

          return (
            <button
              key={band}
              type="button"
              className={`
                px-2.5 py-1 text-xs font-mono rounded-full
                border transition-colors cursor-pointer
                ${
                  isWarc
                    ? "bg-signal-green/10 border-signal-green/25 text-signal-green hover:bg-signal-green/20"
                    : "bg-white/5 border-white/10 text-gray-300 hover:bg-white/10 hover:border-white/20"
                }
              `}
              aria-label={`${band}${isWarc ? " (WARC band, always contest-free)" : " (no active contest)"}`}
              title={
                isWarc
                  ? `${band} — WARC band, always contest-free`
                  : `${band} — Not used by current contests`
              }
            >
              {band}
            </button>
          );
        })}
      </div>

      {/* Subtle explainer */}
      <p className="mt-2 text-[10px] text-gray-600 leading-relaxed">
        These bands have no active contest traffic. WARC bands (30m, 17m, 12m)
        are always contest-free.
      </p>
    </div>
  );
}

QuietBandNav.displayName = "QuietBandNav";

export default QuietBandNav;
