/**
 * Ft8CycleIndicator — Thin animated progress strip for the FT8 decode cycle.
 * Shows 0→100% over 15s (FT8) or 7.5s (FT4), resets at cycle boundary.
 */

interface Ft8CycleIndicatorProps {
  progress: number; // 0 to 1
  active: boolean;
  mode: "FT8" | "FT4";
}

export function Ft8CycleIndicator({
  progress,
  active,
  mode,
}: Ft8CycleIndicatorProps) {
  if (!active) return null;

  const pct = Math.min(100, Math.max(0, progress * 100));

  return (
    <div
      className="h-1 w-full bg-white/5 overflow-hidden"
      title={`${mode} cycle: ${pct.toFixed(0)}%`}
    >
      <div
        className="h-full bg-gradient-to-r from-cosmic-cyan/60 to-signal-green/80 transition-[width] duration-200 ease-linear"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
