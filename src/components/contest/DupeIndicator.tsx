/**
 * DupeIndicator - Inline dupe warning component
 * Shows "DUPE!" in red when a duplicate QSO is detected
 */

export interface DupeIndicatorProps {
  /** Whether the current entry is a duplicate */
  isDupe: boolean;
  /** Additional CSS classes */
  className?: string;
}

/**
 * Simple inline component showing "DUPE!" warning
 * Returns null if not a dupe
 */
export function DupeIndicator({ isDupe, className = "" }: DupeIndicatorProps) {
  if (!isDupe) return null;

  return (
    <span
      className={`
        inline-flex items-center gap-1 px-2 py-0.5
        bg-alert-red/20 border border-alert-red/50 rounded
        text-alert-red font-bold text-sm uppercase tracking-wider
        animate-pulse
        ${className}
      `}
      role="alert"
      aria-live="polite"
    >
      <svg
        className="w-4 h-4"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
        />
      </svg>
      DUPE!
    </span>
  );
}

export default DupeIndicator;
