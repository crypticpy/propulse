/**
 * ActivationCounter — Circular progress ring for POTA/SOTA QSO tracking.
 *
 * Shows QSO count vs threshold as an SVG circular progress ring.
 * Ring color transitions from plasma-orange to signal-green on threshold met.
 * Pulses when threshold is exactly met for celebration feedback.
 *
 * Compact: 96px diameter by default.
 */

interface ActivationCounterProps {
  /** Current QSO count */
  count: number;
  /** Target threshold (POTA: 10, SOTA: 4) */
  threshold: number;
  /** Optional diameter in pixels (default: 96) */
  size?: number;
  /** Optional additional class names */
  className?: string;
}

export function ActivationCounter({
  count,
  threshold,
  size = 96,
  className = "",
}: ActivationCounterProps) {
  const radius = (size - 8) / 2; // 4px stroke on each side
  const circumference = 2 * Math.PI * radius;
  const progress = Math.min(count / threshold, 1);
  const strokeDashoffset = circumference * (1 - progress);
  const isThresholdMet = count >= threshold;
  const isExactlyMet = count === threshold;

  // Color: plasma-orange (#ff6b35) progressing, signal-green (#22c55e) when met
  const ringColor = isThresholdMet ? "#22c55e" : "#ff6b35";
  const trackColor = "rgba(255, 255, 255, 0.08)";

  return (
    <div
      className={`relative inline-flex items-center justify-center ${className}`}
      style={{ width: size, height: size }}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className={isExactlyMet ? "animate-pulse" : ""}
      >
        {/* Background track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={trackColor}
          strokeWidth={4}
        />
        {/* Progress ring */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={ringColor}
          strokeWidth={4}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          className="transition-all duration-500 ease-out"
        />
        {/* Glow effect when threshold met */}
        {isThresholdMet && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={ringColor}
            strokeWidth={2}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={0}
            opacity={0.3}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        )}
      </svg>
      {/* Inner text */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span
          className={`font-bold leading-none ${
            isThresholdMet ? "text-signal-green" : "text-white"
          }`}
          style={{ fontSize: size * 0.28 }}
        >
          {count}
        </span>
        <span
          className="text-white/50 leading-none"
          style={{ fontSize: size * 0.14 }}
        >
          / {threshold}
        </span>
      </div>
    </div>
  );
}
