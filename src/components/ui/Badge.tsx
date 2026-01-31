import React, { forwardRef } from "react";

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

    const statusStyles: Record<BadgeStatus, string[]> = {
      excellent: [
        "bg-signal-green/20",
        "text-signal-green",
        "border",
        "border-signal-green/30",
      ],
      good: ["bg-good/20", "text-good", "border", "border-good/30"],
      fair: [
        "bg-caution-amber/20",
        "text-caution-amber",
        "border",
        "border-caution-amber/30",
      ],
      poor: [
        "bg-alert-red/20",
        "text-alert-red",
        "border",
        "border-alert-red/30",
      ],
      quiet: [
        "bg-aurora-purple/20",
        "text-aurora-purple",
        "border",
        "border-aurora-purple/30",
      ],
      active: [
        "bg-cosmic-cyan/20",
        "text-cosmic-cyan",
        "border",
        "border-cosmic-cyan/30",
      ],
      storm: [
        "bg-alert-red/30",
        "text-alert-red",
        "border",
        "border-alert-red/50",
        "animate-pulse",
      ],
    };

    const combinedStyles = [
      ...baseStyles,
      ...sizeStyles[size],
      ...statusStyles[status],
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
