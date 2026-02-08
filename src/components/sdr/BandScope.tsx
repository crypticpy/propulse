import { useMemo } from "react";
import type { ClusterSpotMessage } from "@/lib/radio/protocol";
import { frequencyToBand } from "@/types/bridge";

const BAND_RANGES_HZ: Record<string, [number, number]> = {
  "160m": [1_800_000, 2_000_000],
  "80m": [3_500_000, 4_000_000],
  "60m": [5_300_000, 5_400_000],
  "40m": [7_000_000, 7_300_000],
  "30m": [10_100_000, 10_150_000],
  "20m": [14_000_000, 14_350_000],
  "17m": [18_068_000, 18_168_000],
  "15m": [21_000_000, 21_450_000],
  "12m": [24_890_000, 24_990_000],
  "10m": [28_000_000, 29_700_000],
  "6m": [50_000_000, 54_000_000],
  "2m": [144_000_000, 148_000_000],
  "70cm": [420_000_000, 450_000_000],
};

interface BandScopeProps {
  frequencyHz: number;
  spots: ClusterSpotMessage[];
  className?: string;
  onPickFrequencyHz?: (hz: number) => void;
}

function formatMhz(hz: number): string {
  return `${(hz / 1_000_000).toFixed(3)}`;
}

export function BandScope({
  frequencyHz,
  spots,
  className = "",
  onPickFrequencyHz,
}: BandScopeProps) {
  const band = useMemo(() => frequencyToBand(frequencyHz), [frequencyHz]);
  const range = BAND_RANGES_HZ[band] ?? null;

  const filtered = useMemo(() => {
    if (!range) return [];
    const [minHz, maxHz] = range;
    const out: Array<{ hz: number; label: string }> = [];
    for (const s of spots) {
      const hz = s.freq * 1000;
      if (!Number.isFinite(hz)) continue;
      if (hz < minHz || hz > maxHz) continue;
      out.push({ hz, label: s.dx });
    }
    // Keep the most recent-ish subset
    return out.slice(0, 40);
  }, [range, spots]);

  if (!range) {
    return (
      <div
        className={`w-full h-full rounded-lg border border-white/10 bg-black/40 flex items-center justify-center text-sm text-gray-500 ${className}`}
      >
        Band scope unavailable (unknown band).
      </div>
    );
  }

  const [minHz, maxHz] = range;
  const span = maxHz - minHz;
  const nowT = (frequencyHz - minHz) / span;

  return (
    <div
      className={`w-full h-full rounded-lg border border-white/10 bg-black/40 relative overflow-hidden ${className}`}
      onClick={(e) => {
        if (!onPickFrequencyHz) return;
        const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
        if (rect.width <= 0) return;
        const x = (e.clientX - rect.left) / rect.width;
        const hz = minHz + x * span;
        onPickFrequencyHz(Math.round(hz));
      }}
    >
      {/* Axis */}
      <div className="absolute left-2 right-2 bottom-1 flex justify-between text-[10px] text-gray-300 font-mono pointer-events-none">
        <span>
          {band} {formatMhz(minHz)}
        </span>
        <span className="text-gray-200">{formatMhz(frequencyHz)}</span>
        <span>{formatMhz(maxHz)}</span>
      </div>

      {/* Current frequency marker */}
      <div
        className="absolute top-0 bottom-0 pointer-events-none"
        style={{ left: `${Math.max(0, Math.min(1, nowT)) * 100}%` }}
      >
        <div className="w-px h-full bg-cosmic-cyan/70" />
      </div>

      {/* Spot markers */}
      {filtered.map((s, idx) => {
        const t = (s.hz - minHz) / span;
        return (
          <div
            key={`${s.hz}-${s.label}-${idx}`}
            className="absolute top-0 bottom-0 pointer-events-none"
            style={{ left: `${Math.max(0, Math.min(1, t)) * 100}%` }}
          >
            <div className="w-px h-full bg-plasma-orange/60" />
            <div className="absolute top-1 left-0 -translate-x-1/2 px-1 py-0.5 rounded text-[10px] bg-black/60 border border-white/10 text-plasma-orange">
              {s.label}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default BandScope;

