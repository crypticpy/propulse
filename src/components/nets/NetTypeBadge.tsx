/**
 * NetTypeBadge -- Pill badge displaying the net's type label with themed colors.
 *
 * Uses NET_TYPE_LABELS and NET_TYPE_COLORS from the net type definitions
 * to render a small, consistently-styled badge across all net views.
 */

import type { NetType } from "@/types/net";
import { NET_TYPE_LABELS, NET_TYPE_COLORS } from "@/types/net";

interface NetTypeBadgeProps {
  type: NetType;
  size?: "sm" | "md";
}

export function NetTypeBadge({ type, size = "md" }: NetTypeBadgeProps) {
  const label = NET_TYPE_LABELS[type];
  const colorClasses = NET_TYPE_COLORS[type];

  const sizeClasses =
    size === "sm" ? "text-[10px] px-1.5 py-0.5" : "text-xs px-2 py-0.5";

  return (
    <span
      className={`inline-block font-medium rounded-full whitespace-nowrap ${sizeClasses} ${colorClasses}`}
    >
      {label}
    </span>
  );
}
