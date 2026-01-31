import React from "react";
import { Card } from "@/components/ui/Card";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";

export interface MetricCardProps {
  /** Label displayed above the value (e.g., "SOLAR FLUX", "K-INDEX") */
  label: string;
  /** The metric value to display */
  value: number | string;
  /** Unit displayed next to the value (e.g., "sfu", "Kp") */
  unit?: string;
  /** Trend direction indicator */
  trend?: "up" | "down" | "stable";
  /** Description text below the value (e.g., "Quiet", "Active") */
  description?: string;
  /** Hex color for the value text */
  color?: string;
  /** Animation delay in milliseconds for staggered entrance */
  delay?: number;
  /** Show loading state */
  loading?: boolean;
  /** Click handler for expanding the card to show detailed modal */
  onClick?: () => void;
}

/**
 * MetricCard Component
 *
 * Displays a single solar metric with label, value, unit, trend, and description.
 * Uses the Card component with cosmic styling and staggered animation support.
 *
 * @example
 * ```tsx
 * <MetricCard
 *   label="SOLAR FLUX"
 *   value={145}
 *   unit="sfu"
 *   trend="up"
 *   description="Good"
 *   color="#00ff88"
 *   delay={100}
 * />
 * ```
 */
export const MetricCard: React.FC<MetricCardProps> = ({
  label,
  value,
  unit,
  trend,
  description,
  color = "#ffffff",
  delay = 0,
  loading = false,
  onClick,
}) => {
  /**
   * Get the trend arrow icon based on direction
   */
  const getTrendArrow = (): string => {
    switch (trend) {
      case "up":
        return "↗";
      case "down":
        return "↘";
      case "stable":
        return "→";
      default:
        return "";
    }
  };

  /**
   * Get the trend color class
   */
  const getTrendColor = (): string => {
    switch (trend) {
      case "up":
        return "text-signal-green";
      case "down":
        return "text-alert-red";
      case "stable":
        return "text-caution-amber";
      default:
        return "text-gray-400";
    }
  };

  return (
    <Card
      animate
      className={`relative overflow-hidden ${onClick ? "cursor-pointer hover:border-white/30 hover:bg-white/[0.05] group" : ""}`}
      style={{ animationDelay: `${delay}ms` }}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
    >
      {/* Expand icon - shown when onClick is provided */}
      {onClick && (
        <div className="absolute top-3 right-3 text-gray-500 opacity-0 group-hover:opacity-100 transition-opacity">
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"
            />
          </svg>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center min-h-[120px]">
          <LoadingSpinner size="md" />
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {/* Label */}
          <span className="text-xs font-mono uppercase tracking-wider text-gray-400">
            {label}
          </span>

          {/* Value row with unit and trend */}
          <div className="flex items-baseline gap-2">
            {/* Main value */}
            <span
              className="text-4xl font-orbitron font-bold tracking-tight"
              style={{ color }}
            >
              {value}
            </span>

            {/* Unit */}
            {unit && (
              <span className="text-sm font-mono text-gray-500">{unit}</span>
            )}

            {/* Trend indicator */}
            {trend && (
              <span className={`text-xl ${getTrendColor()}`}>
                {getTrendArrow()}
              </span>
            )}
          </div>

          {/* Description */}
          {description && (
            <span className="text-sm font-sans text-gray-400">
              {description}
            </span>
          )}
        </div>
      )}
    </Card>
  );
};

MetricCard.displayName = "MetricCard";

export default MetricCard;
