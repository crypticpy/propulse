/**
 * ConflictBadge — Small pulsing amber badge showing the number of unresolved
 * sync conflicts.  Renders nothing when count === 0.
 *
 * Intended for use in the app header next to sync/status indicators.
 *
 * When used without props it self-sources from the QSO store and navigates
 * to /log on click.
 */

import { useConflicts } from "@/hooks/useConflicts";
import { useNavigate } from "react-router-dom";

export interface ConflictBadgeProps {
  /** Number of pending conflicts (defaults to store value) */
  count?: number;
  /** Called when the badge is clicked (defaults to navigate to /log) */
  onClick?: () => void;
}

export function ConflictBadge(props: ConflictBadgeProps) {
  const { conflictCount } = useConflicts();
  const navigate = useNavigate();

  const count = props.count ?? conflictCount;
  const onClick = props.onClick ?? (() => navigate("/log"));

  if (count === 0) return null;

  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1 rounded-full border border-caution-amber/30 bg-caution-amber/20 px-2.5 py-0.5 text-xs font-semibold text-caution-amber animate-pulse transition-colors hover:bg-caution-amber/30"
      aria-label={`${count} sync conflict${count === 1 ? "" : "s"} — click to resolve`}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        className="h-3 w-3"
        viewBox="0 0 20 20"
        fill="currentColor"
      >
        <path
          fillRule="evenodd"
          d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
          clipRule="evenodd"
        />
      </svg>
      {count}
    </button>
  );
}
