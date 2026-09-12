import React, { forwardRef } from "react";
import {
  stationTreatmentClasses,
  type StationTreatmentTone,
} from "@/lib/themes/treatments";

export type BadgeStatus =
  | "excellent"
  | "good"
  | "fair"
  | "poor"
  | "quiet"
  | "active"
  | "storm";

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  status: BadgeStatus;
  children: React.ReactNode;
  size?: "sm" | "md";
}

/**
 * Badge Component
 *
 * A status badge for displaying conditions with appropriate colors.
 * Uses JetBrains Mono font for technical readability.
 *
 * @example
 * ```tsx
 * <Badge status="excellent">Excellent</Badge>
 * <Badge status="poor" size="sm">Poor</Badge>
 * ```
 */
export const Badge = forwardRef<HTMLSpanElement, BadgeProps>(
  ({ status, children, size = "md", className = "", ...props }, ref) => {
    const baseStyles = [
      "inline-flex",
      "items-center",
      "justify-center",
      "font-mono",
      "font-medium",
      "rounded-full",
      "whitespace-nowrap",
      "transition-colors",
      "duration-200",
    ];

    const sizeStyles: Record<typeof size, string[]> = {
      sm: ["text-xs", "px-2", "py-0.5"],
      md: ["text-sm", "px-3", "py-1"],
    };

    const statusTones: Record<BadgeStatus, StationTreatmentTone> = {
      excellent: "success",
      good: "success",
      fair: "warning",
      poor: "danger",
      quiet: "purple",
      active: "info",
      storm: "danger",
    };

    const combinedStyles = [
      ...baseStyles,
      ...sizeStyles[size],
      "border",
      stationTreatmentClasses({
        tone: statusTones[status],
        treatment: "subtle",
      }),
      className,
    ].join(" ");

    return (
      <span ref={ref} className={combinedStyles} {...props}>
        {children}
      </span>
    );
  },
);

Badge.displayName = "Badge";

export default Badge;
