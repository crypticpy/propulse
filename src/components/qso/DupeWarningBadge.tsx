/**
 * DupeWarningBadge — Amber "already worked" indicator.
 *
 * Shows when dupeInfo.isDupe is true.
 * Does NOT block logging — purely informational.
 */

import type { QSODupeInfo } from "@/types/qso";

export interface DupeWarningBadgeProps {
  dupeInfo: QSODupeInfo | null;
  callsign: string;
  band: string;
  mode: string;
}

export function DupeWarningBadge({
  dupeInfo,
  callsign,
  band,
  mode,
}: DupeWarningBadgeProps) {
  if (!dupeInfo || !dupeInfo.isDupe) return null;

  // Find the matching previous contact for the message
  const today = new Date().toISOString().slice(0, 10);
  const dupeContact = dupeInfo.previousContacts.find(
    (c) => c.band === band && c.mode === mode && c.date === today,
  );

  const dateStr = dupeContact?.date ?? today;

  return (
    <div
      className="
        flex items-center gap-2 px-3 py-2
        bg-caution-amber/10 border border-caution-amber/20 rounded-lg
      "
      role="alert"
      aria-label={`Duplicate: already worked ${callsign} on ${band} ${mode}`}
    >
      {/* Warning icon */}
      <svg
        width="16"
        height="16"
        viewBox="0 0 16 16"
        fill="none"
        className="text-caution-amber shrink-0"
        aria-hidden="true"
      >
        <path
          d="M8 1L15 14H1L8 1Z"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
        <path
          d="M8 6V9"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
        <circle cx="8" cy="11.5" r="0.75" fill="currentColor" />
      </svg>

      <span className="text-sm text-caution-amber">
        Already worked <span className="font-mono font-medium">{callsign}</span>
        {" on "}
        <span className="font-mono">{band}</span>{" "}
        <span className="font-mono">{mode}</span>
        {" on "}
        <span className="font-mono">{dateStr}</span>
      </span>

      {/* Worked bands summary */}
      {dupeInfo.workedBands.length > 1 && (
        <div className="ml-auto flex items-center gap-1">
          {dupeInfo.workedBands.slice(0, 5).map((b) => (
            <span
              key={b}
              className="
                text-[10px] font-mono px-1.5 py-0.5 rounded
                bg-caution-amber/10 text-caution-amber/80
              "
            >
              {b}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
