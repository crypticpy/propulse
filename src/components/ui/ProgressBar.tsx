import React, { forwardRef, useEffect, useState } from "react";

export type ProgressBarColor =
  | "orange"
  | "green"
  | "amber"
  | "red"
  | "purple"
  | "cyan";

export interface ProgressBarProps extends React.HTMLAttributes<HTMLDivElement> {
  value: number; // 0-100
  label?: string;
  color?: ProgressBarColor;
  showValue?: boolean;
}

/**
 * ProgressBar Component
 *
 * A horizontal progress/probability bar with animated fill.
 *
 * @example
 * ```tsx
 * <ProgressBar value={75} label="Aurora Probability" color="green" showValue />
 * ```
 */
export const ProgressBar = forwardRef<HTMLDivElement, ProgressBarProps>(
  (
    {
      value,
      label,
      color = "orange",
      showValue = false,
      className = "",
      ...props
    },
    ref,
  ) => {
    // Clamp value between 0 and 100
    const clampedValue = Math.max(0, Math.min(100, value));

    // Animate from 0 to target value
    const [animatedValue, setAnimatedValue] = useState(0);

    useEffect(() => {
      // Small delay before animation starts
      const timer = setTimeout(() => {
        setAnimatedValue(clampedValue);
      }, 100);

      return () => clearTimeout(timer);
    }, [clampedValue]);

    const colorStyles: Record<ProgressBarColor, string> = {
      orange: "bg-plasma-orange",
      green: "bg-signal-green",
      amber: "bg-caution-amber",
      red: "bg-alert-red",
      purple: "bg-aurora-purple",
      cyan: "bg-cosmic-cyan",
    };

    const glowStyles: Record<ProgressBarColor, string> = {
      orange: "shadow-[0_0_10px_rgba(255,107,53,0.5)]",
      green: "shadow-[0_0_10px_rgba(0,255,136,0.5)]",
      amber: "shadow-[0_0_10px_rgba(255,210,63,0.5)]",
      red: "shadow-[0_0_10px_rgba(255,68,85,0.5)]",
      purple: "shadow-[0_0_10px_rgba(170,68,255,0.5)]",
      cyan: "shadow-[0_0_10px_rgba(68,221,255,0.5)]",
    };

    return (
      <div ref={ref} className={`w-full ${className}`} {...props}>
        {/* Label and value row */}
        {(label || showValue) && (
          <div className="flex justify-between items-center mb-2">
            {label && (
              <span className="text-sm text-gray-300 font-sans">{label}</span>
            )}
            {showValue && (
              <span className="text-sm font-mono text-gray-200">
                {Math.round(clampedValue)}%
              </span>
            )}
          </div>
        )}

        {/* Progress track */}
        <div
          className="relative h-2 bg-nebula-blue rounded-full overflow-hidden"
          role="progressbar"
          aria-valuenow={clampedValue}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={label || "Progress"}
        >
          {/* Progress fill */}
          <div
            className={[
              "absolute",
              "inset-y-0",
              "left-0",
              "rounded-full",
              "transition-all",
              "duration-700",
              "ease-out",
              colorStyles[color],
              glowStyles[color],
            ].join(" ")}
            style={{ width: `${animatedValue}%` }}
          />
        </div>
      </div>
    );
  },
);

ProgressBar.displayName = "ProgressBar";

export default ProgressBar;
