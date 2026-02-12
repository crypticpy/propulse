/**
 * BandConditionsBar — Horizontal bar chart of band conditions for a specific path.
 * Each band is a row: band name (left), colored bar (proportional to SNR), SNR text (right).
 * Shared bands are marked, and the best band is highlighted.
 */

import type { PathBandCondition } from "@/lib/utils/bands";

interface BandConditionsBarProps {
  conditions: PathBandCondition[];
  sharedBands?: string[];
  bestBand?: string | null;
}

/** Map status to Tailwind background color */
function getBarColor(status: PathBandCondition["status"]): string {
  switch (status) {
    case "excellent":
      return "bg-emerald-500";
    case "good":
      return "bg-green-500";
    case "fair":
      return "bg-amber-500";
    case "poor":
      return "bg-red-500";
    case "closed":
      return "bg-gray-700";
  }
}

/** Map SNR from [-30, -5] to a 0–100% bar width */
function snrToWidth(snr: number): number {
  // Clamp to [-30, -5]
  const clamped = Math.max(-30, Math.min(-5, snr));
  // Normalize: -30 -> 0%, -5 -> 100%
  return ((clamped + 30) / 25) * 100;
}

export function BandConditionsBar({
  conditions,
  sharedBands,
  bestBand,
}: BandConditionsBarProps) {
  const sharedSet = new Set((sharedBands ?? []).map((b) => b.toLowerCase()));

  return (
    <div className="space-y-0.5">
      {conditions.map((c) => {
        const isShared = sharedSet.has(c.band.toLowerCase());
        const isBest = bestBand
          ? c.band.toLowerCase() === bestBand.toLowerCase()
          : false;
        const barWidth = snrToWidth(c.snrEstimate);

        return (
          <div
            key={c.band}
            className={[
              "flex items-center gap-2 h-6 group",
              isBest ? "relative" : "",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            {/* Band label */}
            <div className="w-12 flex items-center gap-0.5 flex-shrink-0">
              {isShared && (
                <span
                  className="text-plasma-orange text-[10px] leading-none"
                  title="Shared band"
                >
                  *
                </span>
              )}
              <span
                className={[
                  "font-mono text-xs",
                  isBest ? "text-white font-semibold" : "text-gray-400",
                ].join(" ")}
              >
                {c.band}
              </span>
            </div>

            {/* Bar track */}
            <div className="flex-1 h-3 bg-white/5 rounded-sm overflow-hidden relative">
              <div
                className={[
                  "h-full rounded-sm transition-all duration-300",
                  getBarColor(c.status),
                  isBest ? "ring-1 ring-plasma-orange/60" : "",
                ].join(" ")}
                style={{ width: `${barWidth}%` }}
              />
            </div>

            {/* SNR value */}
            <span
              className={[
                "w-10 text-right font-mono text-[10px] flex-shrink-0",
                c.status === "closed" ? "text-gray-600" : "text-gray-400",
              ].join(" ")}
            >
              {c.snrEstimate} dB
            </span>

            {/* Best label */}
            {isBest && (
              <span className="text-[9px] text-plasma-orange font-medium flex-shrink-0 ml-0.5">
                Best
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
