import React, { forwardRef } from "react";

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  className?: string;
  variant?: "default" | "highlight" | "alert";
  animate?: boolean;
  /**
   * "card" (default) is the glass-morphism surface for content cards.
   * "dialog" is a near-opaque themed surface for modal/dialog content
   * rendered above a backdrop scrim, so adaptive text stays legible
   * in every palette.
   */
  surface?: "card" | "dialog";
}

/**
 * Card Component
 *
 * A glass-morphism card component with cosmic styling.
 *
 * @example
 * ```tsx
 * <Card variant="highlight" animate>
 *   <h2>Solar Activity</h2>
 *   <p>Current conditions are excellent.</p>
 * </Card>
 * ```
 */
export const Card = forwardRef<HTMLDivElement, CardProps>(
  (
    {
      children,
      className = "",
      variant = "default",
      animate = false,
      surface = "card",
      ...props
    },
    ref,
  ) => {
    const baseStyles = [
      surface === "dialog" ? "bg-su-panel/95" : "bg-su-line/10",
      "backdrop-blur-md",
      "border",
      "rounded-2xl",
      "p-3",
      "transition-all",
      "duration-200",
    ];

    const variantStyles: Record<typeof variant, string[]> = {
      default: ["border-su-line/40", "hover:border-su-line/50"],
      highlight: [
        "border-plasma-orange/30",
        "shadow-glow-orange",
        "hover:border-plasma-orange/50",
      ],
      alert: [
        "border-alert-red/30",
        "shadow-[0_0_20px_rgba(255,68,85,0.3)]",
        "hover:border-alert-red/50",
      ],
    };

    const animationStyles = animate ? ["animate-fade-in-up"] : [];

    const combinedStyles = [
      ...baseStyles,
      ...variantStyles[variant],
      ...animationStyles,
      className,
    ].join(" ");

    return (
      <div ref={ref} className={combinedStyles} {...props}>
        {children}
      </div>
    );
  },
);

Card.displayName = "Card";

export default Card;
