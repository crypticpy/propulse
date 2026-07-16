import { LoaderCircle, RadioTower, X } from "lucide-react";
import type { ReachMapSurfaceState } from "@/hooks/useReachMapSurface";
import { reachMapProfileLabel } from "@/lib/propagation/reachMapSurface";

const BANDS = ["80m", "40m", "30m", "20m", "17m", "15m", "12m", "10m"];

export function ReachMapControl({
  enabled,
  band,
  onEnabledChange,
  onBandChange,
  state,
}: {
  enabled: boolean;
  band: string;
  onEnabledChange: (enabled: boolean) => void;
  onBandChange: (band: string) => void;
  state: ReachMapSurfaceState;
}) {
  if (!enabled) {
    return (
      <button
        type="button"
        onClick={() => onEnabledChange(true)}
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium text-gray-300 hover:text-white hover:bg-white/10 transition-colors"
        title="Show model reach probability"
      >
        <RadioTower size={14} aria-hidden="true" />
        ReachMap
      </button>
    );
  }

  return (
    <div
      className="absolute left-3 top-3 z-30 max-w-xs border border-white/15 bg-void-black/95 shadow-xl backdrop-blur-md rounded-md p-3"
      style={{ width: "min(320px, calc(100% - 24px))" }}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <RadioTower size={15} className="text-plasma-orange shrink-0" aria-hidden="true" />
          <div className="min-w-0">
            <div className="text-xs font-semibold text-white">ReachMap</div>
            <div className="text-[10px] text-gray-400 truncate">
              {state.personalized ? "Personalized station chain" : "Core model, default 5 W"}
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={() => onEnabledChange(false)}
          className="w-7 h-7 flex items-center justify-center rounded-md text-gray-400 hover:text-white hover:bg-white/10"
          title="Close ReachMap"
        >
          <X size={15} aria-hidden="true" />
        </button>
      </div>

      <div className="mt-3 flex flex-wrap gap-1" role="group" aria-label="ReachMap band">
        {BANDS.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => onBandChange(option)}
            className={`h-7 px-2 rounded text-[11px] font-mono transition-colors ${
              band === option
                ? "bg-plasma-orange text-black"
                : "bg-white/5 text-gray-300 hover:bg-white/10"
            }`}
            style={{ minWidth: 40 }}
          >
            {option}
          </button>
        ))}
      </div>

      <div
        className="mt-3 grid gap-1"
        style={{ gridTemplateColumns: "repeat(5, minmax(0, 1fr))" }}
        aria-label="Probability legend"
      >
        {[
          ["<20", "#dc2626"],
          ["20-39", "#f97316"],
          ["40-59", "#facc15"],
          ["60-79", "#22c55e"],
          ["80+", "#06b6d4"],
        ].map(([label, color]) => (
          <div key={label} className="text-center text-[9px] text-gray-400">
            <span
              className="block rounded-sm mb-1"
              style={{ backgroundColor: color, height: 6 }}
            />
            {label}%
          </div>
        ))}
      </div>

      <div
        className="mt-3 text-[10px] text-gray-400 flex items-center gap-1.5"
        style={{ minHeight: 16 }}
      >
        {state.loading ? (
          <><LoaderCircle size={12} className="animate-spin" /> Scoring global paths...</>
        ) : state.error ? (
          <span className="text-red-300">{state.error}</span>
        ) : (
          <span>
            {state.cellCount} cells · {reachMapProfileLabel(state.profile)} ·{" "}
            {state.modelVersion ?? "pending"}
          </span>
        )}
      </div>
      <div className="mt-2 border-t border-white/10 pt-2 text-[9px] text-gray-500">
        FutureCast horizons withheld pending the prospective forecast archive.
      </div>
    </div>
  );
}
