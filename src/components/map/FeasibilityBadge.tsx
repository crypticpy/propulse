/**
 * FeasibilityBadge Component
 *
 * A visual indicator showing propagation feasibility level for a path.
 * Displays color-coded pill with level text and optional band recommendation.
 */

import type { FeasibilityLevel } from "@/hooks/useFeasibility";

/**
 * Props for the FeasibilityBadge component
 */
export interface FeasibilityBadgeProps {
  /** Feasibility level determining color and text */
  level: FeasibilityLevel;
  /** Optional recommended band to display (e.g., "20m") */
  optimalBand?: string;
  /** Whether the path is in grayline enhancement zone */
  isGrayline?: boolean;
  /** Whether to show the optimal band alongside the level */
  showBand?: boolean;
  /** Badge size variant */
  size?: "sm" | "md" | "lg";
  /** Additional CSS classes */
  className?: string;
}

/**
 * Color configuration for each feasibility level
 */
const LEVEL_COLORS: Record<
  FeasibilityLevel,
  { bg: string; text: string; border: string }
> = {
  excellent: {
    bg: "bg-green-500/20",
    text: "text-green-400",
    border: "border-green-500/40",
  },
  good: {
    bg: "bg-lime-500/20",
    text: "text-lime-400",
    border: "border-lime-500/40",
  },
  fair: {
    bg: "bg-yellow-500/20",
    text: "text-yellow-400",
    border: "border-yellow-500/40",
  },
  poor: {
    bg: "bg-orange-500/20",
    text: "text-orange-400",
    border: "border-orange-500/40",
  },
  unlikely: {
    bg: "bg-red-500/20",
    text: "text-red-400",
    border: "border-red-500/40",
  },
};

/**
 * Human-readable labels for each level
 */
const LEVEL_LABELS: Record<FeasibilityLevel, string> = {
  excellent: "Excellent",
  good: "Good",
  fair: "Fair",
  poor: "Poor",
  unlikely: "Unlikely",
};

/**
 * Size configuration for padding and text
 */
const SIZE_CONFIG: Record<
  "sm" | "md" | "lg",
  { padding: string; text: string; gap: string }
> = {
  sm: {
    padding: "px-1.5 py-0.5",
    text: "text-xs",
    gap: "gap-1",
  },
  md: {
    padding: "px-2 py-1",
    text: "text-sm",
    gap: "gap-1.5",
  },
  lg: {
    padding: "px-3 py-1.5",
    text: "text-base",
    gap: "gap-2",
  },
};

/**
 * FeasibilityBadge - Visual indicator for propagation feasibility
 *
 * @example
 * ```tsx
 * // Basic usage
 * <FeasibilityBadge level="excellent" />
 *
 * // With optimal band
 * <FeasibilityBadge level="good" optimalBand="20m" showBand />
 *
 * // With grayline indicator
 * <FeasibilityBadge level="fair" isGrayline />
 *
 * // Large size
 * <FeasibilityBadge level="poor" size="lg" />
 * ```
 */
export function FeasibilityBadge({
  level,
  optimalBand,
  isGrayline = false,
  showBand = false,
  size = "md",
  className = "",
}: FeasibilityBadgeProps) {
  const colors = LEVEL_COLORS[level];
  const sizeConfig = SIZE_CONFIG[size];
  const label = LEVEL_LABELS[level];

  // Build the display text
  let displayText = label;
  if (showBand && optimalBand) {
    displayText = `${label} \u00B7 ${optimalBand}`;
  }

  return (
    <span
      className={`
        inline-flex items-center ${sizeConfig.gap}
        ${sizeConfig.padding}
        ${colors.bg} ${colors.text}
        border ${colors.border}
        rounded-full
        font-medium
        ${sizeConfig.text}
        ${className}
      `}
      role="status"
      aria-label={`Propagation feasibility: ${label}${showBand && optimalBand ? `, optimal band ${optimalBand}` : ""}${isGrayline ? ", grayline enhancement" : ""}`}
    >
      <span>{displayText}</span>
      {isGrayline && (
        <span
          className="flex-shrink-0"
          title="Grayline enhancement - improved propagation near terminator"
          aria-hidden="true"
        >
          <GraylineIcon size={size} />
        </span>
      )}
    </span>
  );
}

/**
 * Grayline indicator icon (half moon)
 */
function GraylineIcon({ size }: { size: "sm" | "md" | "lg" }) {
  const iconSize =
    size === "sm" ? "w-3 h-3" : size === "md" ? "w-3.5 h-3.5" : "w-4 h-4";

  return (
    <svg
      className={iconSize}
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden="true"
    >
      <path
        fillRule="evenodd"
        d="M8 1a7 7 0 1 1 0 14A7 7 0 0 1 8 1zm0 1.5a5.5 5.5 0 0 0 0 11V2.5z"
        clipRule="evenodd"
      />
    </svg>
  );
}

FeasibilityBadge.displayName = "FeasibilityBadge";

export default FeasibilityBadge;
