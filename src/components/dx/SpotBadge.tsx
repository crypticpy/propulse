/**
 * SpotBadge Component
 *
 * Reusable badge component for DX spot status indicators.
 * Shows worked status (new/band-new/worked) and alert matches.
 */

import { forwardRef } from "react";

/**
 * Badge type variants for different spot statuses
 */
export type SpotBadgeType =
  | "atno"
  | "new"
  | "band-new"
  | "worked"
  | "alert"
  | "needed"
  | "verified"
  | "multi-spot";

export interface SpotBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** Type of badge to display */
  type: SpotBadgeType;
  /** Optional custom label (defaults to type-specific label) */
  label?: string;
  /** Size variant */
  size?: "xs" | "sm";
}

/**
 * Badge configuration for each type
 */
const badgeConfig: Record<
  SpotBadgeType,
  {
    label: string;
    bgColor: string;
    textColor: string;
    borderColor: string;
    animate?: string;
  }
> = {
  atno: {
    label: "ATNO",
    bgColor: "bg-amber-400/30",
    textColor: "text-amber-300",
    borderColor: "border-amber-400/60",
    animate: "animate-pulse",
  },
  new: {
    label: "NEW",
    bgColor: "bg-caution-amber/20",
    textColor: "text-caution-amber",
    borderColor: "border-caution-amber/40",
  },
  "band-new": {
    label: "BAND",
    bgColor: "bg-plasma-orange/20",
    textColor: "text-plasma-orange",
    borderColor: "border-plasma-orange/40",
  },
  worked: {
    label: "",
    bgColor: "bg-signal-green/20",
    textColor: "text-signal-green",
    borderColor: "border-signal-green/40",
  },
  alert: {
    label: "ALERT",
    bgColor: "bg-alert-red/25",
    textColor: "text-alert-red",
    borderColor: "border-alert-red/50",
    animate: "animate-pulse",
  },
  needed: {
    label: "NEED",
    bgColor: "bg-yellow-500/25",
    textColor: "text-yellow-400",
    borderColor: "border-yellow-500/50",
  },
  verified: {
    label: "VFD",
    bgColor: "bg-aurora-purple/20",
    textColor: "text-aurora-purple",
    borderColor: "border-aurora-purple/40",
  },
  "multi-spot": {
    label: "MULTI",
    bgColor: "bg-cosmic-cyan/20",
    textColor: "text-cosmic-cyan",
    borderColor: "border-cosmic-cyan/40",
  },
};

/**
 * Checkmark icon for worked status
 */
function CheckmarkIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3.5 8.5L6.5 11.5L12.5 4.5" />
    </svg>
  );
}

/**
 * Diamond icon for ATNO (All-Time New One) badge
 */
function DiamondIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 16 16"
      fill="currentColor"
      stroke="none"
    >
      <path d="M8 1L14.5 8L8 15L1.5 8L8 1z" />
    </svg>
  );
}

/**
 * Star icon for needed status
 */
function StarIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 16 16"
      fill="currentColor"
      stroke="none"
    >
      <path d="M8 1.5l1.85 3.75 4.15.6-3 2.93.71 4.12L8 11l-3.71 1.9.71-4.12-3-2.93 4.15-.6L8 1.5z" />
    </svg>
  );
}

/**
 * SpotBadge Component
 *
 * Displays a small badge indicating spot status:
 * - NEW: Callsign never worked before (yellow/gold)
 * - BAND: Callsign worked, but not on this band (orange)
 * - Checkmark: Callsign worked on this band (green)
 * - ALERT: Spot matches an alert rule (pulsing red)
 *
 * @example
 * ```tsx
 * // New callsign - never worked
 * <SpotBadge type="new" />
 *
 * // Worked on different band
 * <SpotBadge type="band-new" />
 *
 * // Already worked on this band
 * <SpotBadge type="worked" />
 *
 * // Matches an alert rule
 * <SpotBadge type="alert" />
 * ```
 */
export const SpotBadge = forwardRef<HTMLSpanElement, SpotBadgeProps>(
  ({ type, label, size = "xs", className = "", ...props }, ref) => {
    const config = badgeConfig[type];
    const displayLabel = label ?? config.label;

    const sizeStyles = {
      xs: "text-[9px] px-1 py-0.5",
      sm: "text-[10px] px-1.5 py-0.5",
    };

    const baseStyles = [
      "inline-flex",
      "items-center",
      "justify-center",
      "font-mono",
      "font-bold",
      "rounded",
      "border",
      "whitespace-nowrap",
      "leading-none",
      sizeStyles[size],
      config.bgColor,
      config.textColor,
      config.borderColor,
      config.animate || "",
      className,
    ]
      .filter(Boolean)
      .join(" ");

    return (
      <span ref={ref} className={baseStyles} {...props}>
        {type === "atno" ? (
          <>
            <DiamondIcon className="w-2.5 h-2.5 mr-0.5" />
            {displayLabel}
          </>
        ) : type === "worked" ? (
          <CheckmarkIcon className="w-2.5 h-2.5" />
        ) : type === "needed" ? (
          <>
            <StarIcon className="w-2.5 h-2.5 mr-0.5" />
            {displayLabel}
          </>
        ) : type === "verified" ? (
          <>
            <CheckmarkIcon className="w-2.5 h-2.5 mr-0.5" />
            {displayLabel}
          </>
        ) : (
          displayLabel
        )}
      </span>
    );
  },
);

SpotBadge.displayName = "SpotBadge";

export default SpotBadge;
