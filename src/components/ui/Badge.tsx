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
        // text-aurora-purple measures below 4.5:1 AA on its own /20 tint in
        // every theme (dark 4.01:1, light 4.16:1, high-contrast 4.35:1,
        // midnight 4.03:1 against `panel`). #787 gave aurora-purple a
        // per-theme `--su-purple` token, which lifted every one of those
        // cells but cleared the floor only at /10 (#791). Keep the identity
        // hue as the fill/border accent; use the always-AA station text
        // token for the label itself.
        "bg-aurora-purple/20",
        "text-su-text",
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
