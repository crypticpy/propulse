/**
 * DupeIndicator - Inline dupe warning component
 * Shows "DUPE!" when a duplicate QSO is detected
 *
 * Phase 8.2 - Accessibility:
 * - Uses X icon + strikethrough pattern (not just color)
 * - High-contrast friendly with distinct visual pattern
 * - Screen reader support with role="alert" and aria-live
 */

export interface DupeIndicatorProps {
  /** Whether the current entry is a duplicate */
  isDupe: boolean;
  /** Show compact version (icon + text only) */
  compact?: boolean;
  /** Additional CSS classes */
  className?: string;
}

/**
 * Inline component showing "DUPE!" warning with accessibility features
 * Uses icon, text label, and strikethrough pattern for color-blind users
 * Returns null if not a dupe
 */
export function DupeIndicator({
  isDupe,
  compact = false,
  className = "",
}: DupeIndicatorProps) {
  if (!isDupe) return null;

  if (compact) {
    return (
      <span
        className={`
          inline-flex items-center gap-0.5
          text-alert-red font-bold text-xs uppercase
          ${className}
        `}
        role="status"
        aria-label="Duplicate contact"
      >
        {/* X icon - visible regardless of color perception */}
        <svg
          className="w-3 h-3"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={3}
            d="M6 18L18 6M6 6l12 12"
          />
        </svg>
        <span className="line-through decoration-2">DUPE</span>
      </span>
    );
  }

  return (
    <span
      className={`
        inline-flex items-center gap-1.5 px-2 py-1
        bg-alert-red/20 border-2 border-alert-red/60 rounded
        text-alert-red font-bold text-sm uppercase tracking-wider
        animate-pulse
        high-contrast:border-alert-red high-contrast:bg-alert-red/30
        ${className}
      `}
      role="alert"
      aria-live="polite"
    >
      {/* X in circle icon - clear visual indicator beyond color */}
      <svg
        className="w-4 h-4 flex-shrink-0"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="10" strokeWidth={2} className="opacity-50" />
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2.5}
          d="M8 8l8 8M16 8l-8 8"
        />
      </svg>
      {/* Text with strikethrough pattern for additional visual cue */}
      <span className="relative">
        DUPE!
        {/* Strikethrough line overlay for color-blind accessibility */}
        <span
          className="absolute left-0 right-0 top-1/2 h-0.5 bg-current opacity-40"
          aria-hidden="true"
        />
      </span>
    </span>
  );
}

export default DupeIndicator;
