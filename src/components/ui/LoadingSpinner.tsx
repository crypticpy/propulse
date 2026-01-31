import React from "react";

export type SpinnerSize = "sm" | "md" | "lg";

export interface LoadingSpinnerProps {
  size?: SpinnerSize;
  text?: string;
  className?: string;
}

/**
 * LoadingSpinner Component
 *
 * A cosmic-themed circular loading spinner with optional text.
 *
 * @example
 * ```tsx
 * <LoadingSpinner size="lg" text="Loading solar data..." />
 * ```
 */
export const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({
  size = "md",
  text,
  className = "",
}) => {
  const sizeStyles: Record<SpinnerSize, { spinner: string; text: string }> = {
    sm: {
      spinner: "w-5 h-5 border-2",
      text: "text-xs mt-2",
    },
    md: {
      spinner: "w-8 h-8 border-2",
      text: "text-sm mt-3",
    },
    lg: {
      spinner: "w-12 h-12 border-3",
      text: "text-base mt-4",
    },
  };

  const { spinner: spinnerSize, text: textSize } = sizeStyles[size];

  return (
    <div
      className={`flex flex-col items-center justify-center ${className}`}
      role="status"
      aria-live="polite"
    >
      {/* Spinner ring */}
      <div
        className={[
          // Size
          spinnerSize,

          // Shape
          "rounded-full",

          // Border styling - creates the spinner effect
          "border-nebula-blue",
          "border-t-plasma-orange",

          // Animation
          "animate-spin",
        ].join(" ")}
        aria-hidden="true"
      />

      {/* Optional loading text */}
      {text && (
        <p className={`${textSize} text-gray-400 font-sans animate-pulse`}>
          {text}
        </p>
      )}

      {/* Screen reader text */}
      <span className="sr-only">{text || "Loading..."}</span>
    </div>
  );
};

LoadingSpinner.displayName = "LoadingSpinner";

export default LoadingSpinner;
