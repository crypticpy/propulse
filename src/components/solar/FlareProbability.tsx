import React from "react";
import { Card, ProgressBar, Tooltip, LoadingSpinner } from "@/components/ui";

export interface FlareProbabilityProps {
  /** C-class flare probability (0-100) */
  cProb: number;
  /** M-class flare probability (0-100) */
  mProb: number;
  /** X-class flare probability (0-100) */
  xProb: number;
  /** Proton event probability (0-100) */
  protonProb: number;
  /** Show loading state */
  loading?: boolean;
  /** Callback when expand button is clicked */
  onExpand?: () => void;
}

/** Flare class descriptions for tooltips */
const FLARE_DESCRIPTIONS = {
  C: "Minor flares with minimal radio impact. Common during active periods.",
  M: "Moderate flares that can cause brief HF radio blackouts, especially on the sunlit side of Earth.",
  X: "Major flares causing significant HF radio disruption. Can affect navigation and communication systems.",
  Proton:
    "Solar radiation storms affecting polar HF communications and potentially hazardous to astronauts and high-altitude aircraft.",
};

/**
 * Info icon component for tooltips
 */
const InfoIcon: React.FC = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 20 20"
    fill="currentColor"
    className="w-4 h-4 text-gray-500 hover:text-gray-300 transition-colors cursor-help"
    aria-hidden="true"
  >
    <path
      fillRule="evenodd"
      d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z"
      clipRule="evenodd"
    />
  </svg>
);

/**
 * FlareProbability Component
 *
 * Displays solar flare probability forecasts for the next 24 hours.
 * Shows C, M, X class flare probabilities and proton event probability
 * using color-coded progress bars.
 *
 * @example
 * ```tsx
 * <FlareProbability
 *   cProb={75}
 *   mProb={25}
 *   xProb={5}
 *   protonProb={1}
 * />
 * ```
 */
export const FlareProbability: React.FC<FlareProbabilityProps> = ({
  cProb,
  mProb,
  xProb,
  protonProb,
  loading = false,
  onExpand,
}) => {
  const probabilities = [
    {
      label: "C-Class",
      value: cProb,
      color: "amber" as const,
      description: FLARE_DESCRIPTIONS.C,
    },
    {
      label: "M-Class",
      value: mProb,
      color: "orange" as const,
      description: FLARE_DESCRIPTIONS.M,
    },
    {
      label: "X-Class",
      value: xProb,
      color: "red" as const,
      description: FLARE_DESCRIPTIONS.X,
    },
    {
      label: "Proton Event",
      value: protonProb,
      color: "purple" as const,
      description: FLARE_DESCRIPTIONS.Proton,
    },
  ];

  return (
    <Card animate className="h-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-sans text-lg font-semibold text-white tracking-wide">
          Flare Probability
        </h2>
        {onExpand && (
          <button
            onClick={onExpand}
            className="p-1 text-gray-500 hover:text-white transition-colors"
            aria-label="Expand flare probability"
          >
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
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center min-h-[160px]">
          <LoadingSpinner size="md" />
        </div>
      ) : (
        <div className="space-y-4">
          {probabilities.map(({ label, value, color, description }) => (
            <div key={label} className="space-y-1">
              {/* Label row with tooltip */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm text-gray-300 font-sans">
                    {label}
                  </span>
                  <Tooltip content={description}>
                    <InfoIcon />
                  </Tooltip>
                </div>
                <span className="text-sm font-mono text-gray-200">
                  {Math.round(value)}%
                </span>
              </div>

              {/* Progress bar */}
              <ProgressBar value={value} color={color} />
            </div>
          ))}
        </div>
      )}
    </Card>
  );
};

FlareProbability.displayName = "FlareProbability";

export default FlareProbability;
