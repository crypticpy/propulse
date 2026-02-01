/**
 * GuestLogEntryBadge - Badge showing guest operator on log entries
 */

export interface GuestLogEntryBadgeProps {
  operatorCallsign: string;
  variant?: "inline" | "full";
}

export function GuestLogEntryBadge({
  operatorCallsign,
  variant = "inline",
}: GuestLogEntryBadgeProps) {
  if (variant === "inline") {
    return (
      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-mono font-medium bg-cosmic-cyan/20 text-cosmic-cyan border border-cosmic-cyan/30">
        {operatorCallsign}
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-sm bg-cosmic-cyan/20 text-cosmic-cyan border border-cosmic-cyan/30">
      <svg
        className="w-3.5 h-3.5"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
        />
      </svg>
      <span className="font-mono font-medium">{operatorCallsign}</span>
    </span>
  );
}

export default GuestLogEntryBadge;
