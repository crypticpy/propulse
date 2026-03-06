/**
 * RegionRIMCard — Compact RIM score card for a monitored region
 */

import type { RIMResult } from "@/types/atmos";

function scoreColor(score: number): string {
  if (score >= 75) return "text-signal-green";
  if (score >= 50) return "text-caution-amber";
  if (score >= 25) return "text-plasma-orange";
  return "text-alert-red";
}

function scoreBg(score: number): string {
  if (score >= 75) return "bg-signal-green/10 border-signal-green/20";
  if (score >= 50) return "bg-caution-amber/10 border-caution-amber/20";
  if (score >= 25) return "bg-plasma-orange/10 border-plasma-orange/20";
  return "bg-alert-red/10 border-alert-red/20";
}

interface RegionRIMCardProps {
  name: string;
  rim: RIMResult | null;
}

export function RegionRIMCard({ name, rim }: RegionRIMCardProps) {
  const score = rim?.composite ?? 0;

  return (
    <div className={`rounded-md border px-2 py-1.5 ${scoreBg(score)}`}>
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-gray-400 truncate max-w-[120px]">
          {name}
        </span>
        <span
          className={`text-sm font-mono font-bold tabular-nums ${scoreColor(score)}`}
        >
          {rim ? Math.round(score) : "\u2014"}
        </span>
      </div>
      {rim && (
        <div className="flex gap-2 mt-0.5">
          <span className="text-[8px] text-gray-600">
            HF {Math.round(rim.hfBand.value)}
          </span>
          <span className="text-[8px] text-gray-600">
            VHF {Math.round(rim.vhfUhf.value)}
          </span>
          <span className="text-[8px] text-gray-600">
            Infra {Math.round(rim.infraRisk.value)}
          </span>
        </div>
      )}
    </div>
  );
}
