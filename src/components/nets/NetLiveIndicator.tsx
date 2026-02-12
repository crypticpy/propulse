/**
 * NetLiveIndicator -- Pulsing red dot with "LIVE" label.
 *
 * Styled similarly to the OnAirBadge pattern: bright red background dot
 * with animate-pulse and a soft glow, paired with uppercase tracking text.
 */

interface NetLiveIndicatorProps {
  size?: "sm" | "md";
}

export function NetLiveIndicator({ size = "md" }: NetLiveIndicatorProps) {
  const dotSize = size === "sm" ? "h-2 w-2" : "h-2.5 w-2.5";
  const textSize = size === "sm" ? "text-[10px]" : "text-xs";

  return (
    <div className="inline-flex items-center gap-1.5">
      <span
        className={`rounded-full shrink-0 bg-red-500 animate-pulse shadow-[0_0_8px_rgba(239,68,68,0.6)] ${dotSize}`}
      />
      <span
        className={`font-bold uppercase tracking-wider text-red-400 ${textSize}`}
      >
        LIVE
      </span>
    </div>
  );
}
