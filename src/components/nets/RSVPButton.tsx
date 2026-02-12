/**
 * RSVPButton -- Toggle button for indicating attendance at a net session.
 *
 * Shows "I'll Be There" with a hand/wave icon and RSVP count badge.
 * Ghost style when not RSVP'd; signal-green active style when RSVP'd.
 * Calls onRsvp/onUnrsvp depending on current state.
 */

interface RSVPButtonProps {
  hasRsvpd: boolean;
  rsvpCount: number;
  onRsvp: () => void;
  onUnrsvp: () => void;
  disabled?: boolean;
}

export function RSVPButton({
  hasRsvpd,
  rsvpCount,
  onRsvp,
  onUnrsvp,
  disabled = false,
}: RSVPButtonProps) {
  const handleClick = () => {
    if (hasRsvpd) {
      onUnrsvp();
    } else {
      onRsvp();
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled}
      aria-pressed={hasRsvpd}
      aria-label={
        hasRsvpd
          ? "Remove RSVP, currently attending"
          : "RSVP to attend this net session"
      }
      className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 border disabled:opacity-50 disabled:cursor-not-allowed ${
        hasRsvpd
          ? "bg-signal-green/15 text-signal-green border-signal-green/30 hover:bg-signal-green/25"
          : "bg-white/5 text-gray-300 border-white/10 hover:bg-white/10 hover:text-white"
      }`}
    >
      {/* Hand wave icon */}
      <svg
        className="w-4 h-4 shrink-0"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M10.05 4.575a1.575 1.575 0 1 0-3.15 0v3.15m3.15-3.15v-1.227c0-.87.702-1.575 1.575-1.575a1.575 1.575 0 0 1 1.575 1.575v1.227m-3.15 0H7.5a1.575 1.575 0 0 0-1.575 1.575v1.227c0 .87.702 1.575 1.575 1.575h.45m3.6-4.377v3.15m0-3.15a1.575 1.575 0 0 1 3.15 0v3.15m-3.15-3.15v1.227c0 .87.702 1.575 1.575 1.575h.45m0 0v3.15m0-3.15a1.575 1.575 0 0 1 3.15 0v2.1c0 3.309-2.691 6-6 6H9.75a6 6 0 0 1-6-6v-1.227c0-.87.702-1.575 1.575-1.575h.45c.87 0 1.575.702 1.575 1.575v.6"
        />
      </svg>

      <span>I'll Be There</span>

      {/* RSVP count badge */}
      <span
        className={`inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-[11px] font-semibold ${
          hasRsvpd
            ? "bg-signal-green/20 text-signal-green"
            : "bg-white/10 text-gray-400"
        }`}
      >
        {rsvpCount}
      </span>
    </button>
  );
}
