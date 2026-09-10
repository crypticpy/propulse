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
      // fair/poor carry the same same-hue defect quiet's comment describes
      // for aurora-purple: warning ink measures 4.22-4.62:1 on its own /20
      // tint depending on surface (fails on Light Card glass), and danger ink
      // measures 4.61-5.06:1 (passes, thin margin) (#827). Same treatment as
      // `quiet`: keep the tint, draw the label in --su-text.
      fair: [
        "bg-caution-amber/20",
        "text-su-text",
        "border",
        "border-caution-amber/30",
      ],
      poor: [
        "bg-alert-red/20",
        "text-su-text",
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
      // No app call site passes status="storm" today, but it is mounted via
      // `.design-sync/previews/Badge.tsx`, which the design-system alignment
      // rule re-grades on every fix -- a live site, not a dead one (same
      // correction #795 made for SpotBadge's `verified` variant). The same
      // same-hue defect above applies at /30 too -- 3.57-4.77:1 depending on
      // theme/surface (#827).
      //
      // `animate-pulse` is gone with it. Tailwind's pulse fades the WHOLE
      // element to 50% opacity at the trough, which halves the contrast of
      // whatever it is applied to: even after the --su-text treatment the
      // storm label measured roughly 2.3-3.4:1 for half of every cycle. A
      // guard that measures the class pair while the animation quietly
      // undoes it certifies a state the user never sees. Fixing the ink and
      // keeping the fade would have been the worst of both. If this variant
      // ever needs motion back, pulse a separate decorative element, not the
      // text (#827, found by Codex on PR #840).
      storm: [
        "bg-alert-red/30",
        "text-su-text",
        "border",
        "border-alert-red/50",
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
