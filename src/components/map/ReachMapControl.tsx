import { LoaderCircle, RadioTower, TriangleAlert, X } from "lucide-react";
import type { ReachMapSurfaceState } from "@/hooks/useReachMapSurface";
import { HF_MODEL_BANDS } from "@/lib/propagation/coreFeatureBuilder";
import { reachMapProfileLabel } from "@/lib/propagation/reachMapSurface";

function formatAge(seconds: number | null): string | null {
  if (seconds === null) return null;
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3_600) return `${Math.round(seconds / 60)}m`;
  return `${Math.round(seconds / 3_600)}h`;
}

export function ReachMapControl({
  enabled,
  band,
  personalized,
  floating = false,
  onEnabledChange,
  onBandChange,
  onPersonalizedChange,
  state,
  compact = false,
}: {
  enabled: boolean;
  band: string;
  personalized: boolean;
  floating?: boolean;
  onEnabledChange: (enabled: boolean) => void;
  onBandChange: (band: string) => void;
  onPersonalizedChange: (personalized: boolean) => void;
  state: ReachMapSurfaceState;
  compact?: boolean;
}) {
  if (!enabled) {
    return (
      <button
        type="button"
        onClick={() => onEnabledChange(true)}
        className={`${floating ? "absolute right-3 top-3 z-30 border border-white/15 bg-void-black/90 shadow-lg backdrop-blur-md" : ""} flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium text-gray-300 hover:text-white hover:bg-white/10 transition-colors`}
        title="Show model reach probability"
        aria-label="Show ReachMap model probability"
      >
        <RadioTower size={14} aria-hidden="true" />
        {!compact && "ReachMap"}
      </button>
    );
  }

  return (
    <div
      className="absolute left-3 z-30 max-w-xs border border-white/15 bg-void-black/95 shadow-xl backdrop-blur-md rounded-md p-3"
      style={{
        width: "min(320px, calc(100% - 24px))",
        top: floating ? 48 : 80,
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <RadioTower size={15} className="text-plasma-orange shrink-0" aria-hidden="true" />
          <div className="min-w-0">
            <div className="text-xs font-semibold text-white">ReachMap</div>
            <div className="text-[10px] text-gray-400 truncate">
              {state.locationName ?? "Operating location required"}
              {state.personalized && state.chainName ? ` · ${state.chainName}` : ""}
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

      <div
        className="mt-3 grid grid-cols-2 rounded-md bg-white/5 p-0.5"
        role="group"
        aria-label="ReachMap probability mode"
      >
        <button
          type="button"
          onClick={() => onPersonalizedChange(false)}
          className={`h-7 rounded text-[11px] font-medium transition-colors ${
            !personalized ? "bg-plasma-orange text-black" : "text-gray-300 hover:bg-white/10"
          }`}
        >
          Core 5 W
        </button>
        <button
          type="button"
          onClick={() => onPersonalizedChange(true)}
          disabled={!state.stationAvailable}
          title={state.stationAvailable ? "Use the active station chain" : "Configure an active station chain"}
          className={`h-7 rounded text-[11px] font-medium transition-colors ${
            personalized && state.stationAvailable
              ? "bg-plasma-orange text-black"
              : state.stationAvailable
                ? "text-gray-300 hover:bg-white/10"
                : "cursor-not-allowed text-gray-600"
          }`}
        >
          My Station
        </button>
      </div>

      <div className="mt-2 flex flex-wrap gap-1" role="group" aria-label="ReachMap band">
        {HF_MODEL_BANDS.map((option) => (
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

      <div className="mt-3 text-[10px] text-gray-400" style={{ minHeight: 34 }}>
        {state.loading ? (
          <div className="flex items-center gap-1.5">
            <LoaderCircle size={12} className="animate-spin" /> Scoring global paths...
          </div>
        ) : state.error ? (
          <span className="text-red-300">{state.error}</span>
        ) : (
          <>
            <div className="flex items-center gap-1.5">
              {state.status === "partial" && (
                <TriangleAlert size={12} className="shrink-0 text-caution-amber" />
              )}
              <span className={state.status === "partial" ? "text-caution-amber" : undefined}>
                {state.horizonHours !== null
                  ? `FutureCast +${state.horizonHours}h · `
                  : ""}
                {state.cellCount}/{state.expectedCellCount} cells ·{" "}
                {reachMapProfileLabel(state.profile)} · WSPR
              </span>
            </div>
            <div className="mt-1 truncate text-gray-500" title={state.modelVersion ?? undefined}>
              {state.status === "partial"
                ? `${state.failedCellCount} cells unavailable`
                : state.staleInputCellCount > 0
                  ? "Recent path history stale or unavailable; physics profile active"
                  : state.fallbackCellCount > 0
                    ? "Physics profile active"
                    : "Verified recent path data active"}
              {state.meanConfidence !== null
                ? ` · ${Math.round(state.meanConfidence * 100)}% confidence`
                : ""}
              {formatAge(state.maxDataAgeSeconds)
                ? ` · oldest input ${formatAge(state.maxDataAgeSeconds)}`
                : ""}
              {state.modelVersion ? ` · ${state.modelVersion}` : ""}
            </div>
          </>
        )}
      </div>
      <div className="mt-2 border-t border-white/10 pt-2 text-[9px] text-gray-500">
        {state.futureCastHorizons.length > 0
          ? `Live NowCast + FutureCast ${state.futureCastHorizons
              .map((horizon) => `+${horizon}h`)
              .join(" / ")} via the time slider.`
          : "Live NowCast only. FutureCast horizons require prospective forecast evidence."}
      </div>
    </div>
  );
}
