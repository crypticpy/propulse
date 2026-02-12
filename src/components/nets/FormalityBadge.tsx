/**
 * FormalityBadge -- Small pill badge indicating a net's formality level (1-5).
 *
 * Renders a color-coded rounded-full badge using FORMALITY_LABELS and
 * FORMALITY_COLORS from the net type definitions. Returns null for
 * out-of-range or undefined levels.
 */

import { FORMALITY_LABELS, FORMALITY_COLORS } from "@/types/net";

interface FormalityBadgeProps {
  level: number;
  size?: "sm" | "md";
}

export function FormalityBadge({ level, size = "md" }: FormalityBadgeProps) {
  const label = FORMALITY_LABELS[level];
  const colorClasses = FORMALITY_COLORS[level];

  if (!label || !colorClasses) return null;

  const sizeClasses =
    size === "sm" ? "text-[10px] px-2 py-0.5" : "text-xs px-2.5 py-1";

  return (
    <span
      className={`inline-block rounded-full border font-medium whitespace-nowrap ${colorClasses} ${sizeClasses}`}
    >
      {label}
    </span>
  );
}
