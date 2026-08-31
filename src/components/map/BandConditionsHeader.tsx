/**
 * BandConditionsHeader
 *
 * The expanded-state header for BandConditionsPanel, extracted so the panel
 * file stops carrying four near-duplicate ad hoc headers.
 *
 * Implements the panel title rule: the title row holds the title, window
 * controls (collapse / close / help), and the fixed-width overall-status dot.
 * Everything whose width depends on its value -- Kp, SFI, the serving-model
 * badge -- moves to a status row underneath, so the title is never squeezed or
 * truncated by values that grow.
 *
 * The status dot is intentionally retained beside the title: it is an 8px
 * indicator that never changes size, so it reads as part of the title's
 * identity ("Band Conditions, currently green") rather than as a value
 * competing with it for room.
 *
 * The collapsed state is deliberately NOT rendered here: collapsed Band
 * Conditions is a one-line summary strip (best band + status + indices), not a
 * titled panel, so it has different rules.
 */

import { InfoTip } from "@/components/ui/Tooltip";
import { PROPAGATION_TOOLTIPS } from "@/constants/tooltips";
import { HelpButton } from "@/components/ui/HelpModal";
import { ModelSourceBadge } from "./ModelSourceBadge";
import { PHYSICS_SOURCE } from "@/lib/map/modelSource";

interface BandConditionsHeaderProps {
  /** Current Kp index. */
  currentKp: number;
  /** Current solar flux index. */
  currentSfi: number;
  /**
   * Tailwind class for the overall-status dot, e.g. "bg-signal-green".
   * Omitted in the empty states, where there is no overall status yet.
   */
  statusDotClass?: string;
  /** Present only when the panel supports collapsing. */
  onToggleCollapse?: () => void;
  /** Present only when the panel can be hidden. */
  onClose?: () => void;
  onHelp: () => void;
}

export function BandConditionsHeader({
  currentKp,
  currentSfi,
  statusDotClass,
  onToggleCollapse,
  onClose,
  onHelp,
}: BandConditionsHeaderProps) {
  return (
    <div className="flex flex-col gap-1 flex-shrink-0">
      {/* Title row -- title plus window controls only */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {onToggleCollapse && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onToggleCollapse();
              }}
              className="p-1 hover:bg-white/10 rounded transition-colors flex-shrink-0"
              title="Collapse panel"
              aria-label="Collapse panel"
            >
              <svg
                className="w-4 h-4 text-gray-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 9l-7 7-7-7"
                />
              </svg>
            </button>
          )}

          {statusDotClass && (
            <div
              className={`w-2 h-2 rounded-full flex-shrink-0 ${statusDotClass}`}
            />
          )}

          <h3 className="text-xs font-medium text-gray-300 uppercase tracking-wide flex items-center gap-1">
            Band Conditions
            <InfoTip content={PROPAGATION_TOOLTIPS.bandCondition} />
          </h3>
        </div>

        <div className="flex items-center gap-1 flex-shrink-0">
          {onClose && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onClose();
              }}
              className="p-1 rounded hover:bg-white/10 transition-colors"
              title="Hide panel"
              aria-label="Hide panel"
            >
              <svg
                className="text-white/40 hover:text-red-400"
                width={18}
                height={18}
                viewBox="0 0 18 18"
                fill="none"
                stroke="currentColor"
              >
                <line
                  x1="5"
                  y1="5"
                  x2="13"
                  y2="13"
                  strokeWidth={1.5}
                  strokeLinecap="round"
                />
                <line
                  x1="13"
                  y1="5"
                  x2="5"
                  y2="13"
                  strokeWidth={1.5}
                  strokeLinecap="round"
                />
              </svg>
            </button>
          )}
          <HelpButton onClick={onHelp} />
        </div>
      </div>

      {/* Status row -- the values that used to crowd the title */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <span
          className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
            currentKp >= 4
              ? "bg-caution-amber/20 text-caution-amber"
              : "bg-white/5 text-gray-400"
          }`}
          title="Planetary K-index"
        >
          Kp {currentKp}
        </span>
        <span
          className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
            currentSfi >= 120
              ? "bg-signal-green/20 text-signal-green"
              : "bg-white/5 text-gray-400"
          }`}
          title="Solar Flux Index"
        >
          SFI {currentSfi}
        </span>
        {/* This panel is served entirely by the local P.533 engine -- no ML
            model is involved, and saying so is the point of the badge. */}
        <ModelSourceBadge source={PHYSICS_SOURCE} />
      </div>
    </div>
  );
}

export default BandConditionsHeader;
