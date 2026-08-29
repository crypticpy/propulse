/**
 * ContestCountdown Component
 *
 * Displays a live countdown timer to a contest start or end.
 * Updates every second via useCountdown. Shows compact format:
 * "2d 14h 32m" / "14h 32m" / "32m 15s"
 *
 * @module components/dashboard/ContestCountdown
 */

import { useCountdown } from "@/hooks/useCountdown";

export interface ContestCountdownProps {
  /** ISO 8601 UTC target timestamp */
  targetUtc: string;
  /** Whether this is counting down to the end (true) or start (false) */
  isActive: boolean;
  className?: string;
}

export function ContestCountdown({
  targetUtc,
  isActive,
  className = "",
}: ContestCountdownProps) {
  const { text, ended } = useCountdown(targetUtc);

  const label = ended
    ? isActive
      ? "Ended"
      : "Started"
    : isActive
      ? "Ends in"
      : "Starts in";

  return (
    <span
      className={`inline-flex items-center gap-1.5 text-xs font-mono tabular-nums ${className}`}
      aria-label={ended ? label : `${label} ${text}`}
    >
      <span className="text-gray-400">{label}</span>
      {!ended && <span className="text-white font-medium">{text}</span>}
    </span>
  );
}

ContestCountdown.displayName = "ContestCountdown";

export default ContestCountdown;
