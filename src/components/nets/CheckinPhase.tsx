/**
 * CheckinPhase -- The check-in phase of the NCS Live Dashboard workflow.
 *
 * Full-width layout with the CallsignInput at the top (primary action),
 * a check-in count badge with advance button, and the CheckinList filling
 * the remaining space. The advance button is always visible but disabled
 * until at least one check-in exists, preventing jarring layout shifts.
 *
 * All handler props are passed through to the underlying CallsignInput
 * and CheckinList components.
 */

import type { NetCheckin, CheckinStatus } from "@/types/net";
import { CallsignInput } from "@/components/nets/CallsignInput";
import { CheckinList } from "@/components/nets/CheckinList";

// ── Props ─────────────────────────────────────────────────────────────────────

interface CheckinPhaseProps {
  checkins: NetCheckin[];
  onSubmitCallsign: (callsign: string) => void;
  onAdvance: () => void;
  onUpdateStatus: (id: string, status: CheckinStatus) => void;
  onRemove: (id: string) => void;
  onReorder: (id: string, newPosition: number) => void;
  onUpdateNotes: (id: string, notes: string) => void;
  onToggleRelay: (id: string, isRelay: boolean, relayVia?: string) => void;
  netId?: string;
  disabled: boolean;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function CheckinPhase({
  checkins,
  onSubmitCallsign,
  onAdvance,
  onUpdateStatus,
  onRemove,
  onReorder,
  onUpdateNotes,
  onToggleRelay,
  netId,
  disabled,
}: CheckinPhaseProps) {
  const count = checkins.length;
  const hasCheckins = count >= 1;

  return (
    <div className="flex flex-col flex-1 min-h-0 gap-4 animate-in fade-in">
      {/* Primary action: callsign input */}
      <div className="shrink-0">
        <p className="text-xs uppercase tracking-widest text-gray-400 mb-2">
          Type callsigns as operators check in
        </p>
        <CallsignInput
          onSubmit={onSubmitCallsign}
          disabled={disabled}
          netId={netId}
        />
      </div>

      {/* Count badge + advance button bar — always visible */}
      <div className="shrink-0 flex items-center justify-between bg-white/[0.05] border border-white/15 rounded-xl px-3 py-2">
        <div className="flex items-center gap-2">
          <span
            className={`
              inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-full
              ${hasCheckins ? "bg-signal-green/20 text-signal-green border border-signal-green/30" : "bg-white/5 text-gray-400 border border-white/15"}
              transition-colors
            `}
            aria-label={`${count} check-in${count !== 1 ? "s" : ""}`}
          >
            <span className="font-mono font-bold">{count}</span>
            <span>check-in{count !== 1 ? "s" : ""}</span>
          </span>
        </div>

        <button
          type="button"
          onClick={onAdvance}
          disabled={!hasCheckins}
          className={`
            group px-5 py-2.5 text-sm font-semibold rounded-xl transition-all focus:outline-none focus:ring-2 focus:ring-plasma-orange/70
            ${
              hasCheckins
                ? "bg-plasma-orange text-white shadow-lg shadow-plasma-orange/20 hover:bg-plasma-orange/90 hover:brightness-110 hover:shadow-[0_0_16px_rgba(255,107,53,0.3)] active:scale-[0.98] will-change-transform animate-pulse-glow"
                : "bg-white/5 text-gray-500 border border-white/15 cursor-not-allowed"
            }
          `}
          aria-label="Finish check-ins and begin rounds"
        >
          <span className="inline-flex items-center gap-2">
            Begin Rounds
            <svg
              className={`w-3.5 h-3.5 transition-transform ${hasCheckins ? "group-hover:translate-x-0.5" : ""}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2.5}
                d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3"
              />
            </svg>
          </span>
        </button>
      </div>

      {/* Check-in list (scrollable, fills remaining space) */}
      <div className="flex-1 min-h-0 overflow-y-auto bg-white/[0.05] backdrop-blur-sm border border-white/15 rounded-2xl p-3">
        <CheckinList
          checkins={checkins}
          onUpdateStatus={onUpdateStatus}
          onRemove={onRemove}
          onReorder={onReorder}
          onUpdateNotes={onUpdateNotes}
          onToggleRelay={onToggleRelay}
        />
      </div>
    </div>
  );
}
