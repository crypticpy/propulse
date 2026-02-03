import React, { forwardRef } from "react";

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  className?: string;
  variant?: "default" | "highlight" | "alert";
  animate?: boolean;
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
      ...props
    },
    ref,
  ) => {
    const baseStyles = [
      "bg-white/[0.03]",
      "backdrop-blur-md",
      "border",
      "rounded-2xl",
      // padding removed - let consumers specify their own
      "transition-all",
      "duration-200",
    ];

    const variantStyles: Record<typeof variant, string[]> = {
      default: ["border-white/10", "hover:border-white/20"],
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
