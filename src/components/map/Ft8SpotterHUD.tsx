/**
 * Ft8SpotterHUD — Military radar-style HUD overlay for FT8/FT4 decode stats
 *
 * Sits as a compact HTML overlay at the bottom-center of the globe view.
 * Displays real-time decode counts, unique stations, band, mode, and
 * a cycle-progress countdown bar with flash-on-boundary animation.
 *
 * All animations are CSS-only (no JS animation loops).
 */

import { useMemo } from "react";

// ─── Band color map ──────────────────────────────────────────────────────────

const BAND_COLORS: Record<string, string> = {
  "160m": "#ff6b6b",
  "80m": "#e8596e",
  "60m": "#d4507a",
  "40m": "#f59e0b",
  "30m": "#f0c040",
  "20m": "#00ff88",
  "17m": "#22d3ee",
  "15m": "#3b82f6",
  "12m": "#818cf8",
  "10m": "#a855f7",
  "6m": "#f472b6",
  "2m": "#fb923c",
  "70cm": "#94a3b8",
};

// ─── Props ───────────────────────────────────────────────────────────────────

export interface Ft8SpotterHUDProps {
  cycleProgress: number; // 0-1, progress through FT8/FT4 cycle
  totalDecodes: number; // Total decode count
  uniqueStations: number; // Unique callsigns in recent buffer
  currentBand: string | null; // e.g. "20m"
  currentMode: string | null; // e.g. "FT8" or "FT4"
  isNewCycle: boolean; // True when cycle boundary just crossed
  currentCycleCount: number; // Decodes in current cycle
}

// ─── Component ───────────────────────────────────────────────────────────────

export function Ft8SpotterHUD({
  cycleProgress,
  totalDecodes,
  uniqueStations,
  currentBand,
  currentMode,
  isNewCycle,
  currentCycleCount,
}: Ft8SpotterHUDProps) {
  // Compute remaining time display
  const timeRemaining = useMemo(() => {
    const cycleDuration = currentMode === "FT4" ? 7.5 : 15;
    const elapsed = cycleProgress * cycleDuration;
    const remaining = Math.max(0, cycleDuration - elapsed);
    const seconds = Math.ceil(remaining);
    return `0:${seconds.toString().padStart(2, "0")}`;
  }, [cycleProgress, currentMode]);

  const bandColor = currentBand
    ? (BAND_COLORS[currentBand] ?? "#9ca3af")
    : "#9ca3af";

  // Empty state
  if (totalDecodes === 0) {
    return (
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-30 pointer-events-none">
        <div className="bg-void-black/60 backdrop-blur-sm rounded-lg border border-white/10 px-5 py-3 min-w-[280px]">
          <div className="flex items-center gap-2.5">
            <span className="ft8-hud-pulse-dot inline-block w-2 h-2 rounded-full bg-white/30" />
            <span className="text-[12px] text-gray-500 font-medium tracking-wide">
              Waiting for FT8 decodes...
            </span>
          </div>
        </div>

        <style>{`
          @keyframes ft8HudPulseDot {
            0%, 100% { opacity: 0.3; }
            50% { opacity: 0.8; }
          }
          .ft8-hud-pulse-dot {
            animation: ft8HudPulseDot 2s ease-in-out infinite;
          }
        `}</style>
      </div>
    );
  }

  return (
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-30 pointer-events-none">
      <div className="bg-void-black/60 backdrop-blur-sm rounded-lg border border-white/10 overflow-hidden min-w-[280px] max-w-[320px]">
        {/* Cycle progress bar */}
        <div className="h-[3px] w-full bg-white/[0.06] relative overflow-hidden">
          <div
            className={`h-full transition-[width] duration-300 ease-linear ${
              isNewCycle ? "ft8-hud-bar-flash" : ""
            }`}
            style={{
              width: `${Math.min(100, cycleProgress * 100)}%`,
              backgroundColor: "#00ff88",
            }}
          />
        </div>

        {/* Main content row */}
        <div className="flex items-center gap-2 px-3 py-2">
          {/* Decode count */}
          <div className="flex items-baseline gap-1 min-w-0">
            <span className="text-[14px] font-bold text-white tabular-nums leading-none">
              {currentCycleCount > 0 ? currentCycleCount : totalDecodes}
            </span>
            <span className="text-[10px] text-gray-500 font-medium">
              {currentCycleCount > 0 ? "decodes" : "total"}
            </span>
          </div>

          {/* Separator */}
          <span className="text-[10px] text-white/20 select-none">
            &middot;
          </span>

          {/* Unique stations */}
          <div className="flex items-baseline gap-1 min-w-0">
            <span className="text-[13px] font-semibold text-white/80 tabular-nums leading-none">
              {uniqueStations}
            </span>
            <span className="text-[10px] text-gray-500 font-medium">stns</span>
          </div>

          {/* Separator */}
          <span className="text-[10px] text-white/20 select-none">
            &middot;
          </span>

          {/* Band */}
          {currentBand && (
            <span
              className="text-[12px] font-bold tabular-nums leading-none"
              style={{ color: bandColor }}
            >
              {currentBand}
            </span>
          )}

          {/* Spacer */}
          <div className="flex-1" />

          {/* Mode pill */}
          {currentMode && (
            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold tracking-wider bg-white/[0.08] text-white/70 leading-none uppercase">
              {currentMode}
            </span>
          )}

          {/* Cycle timer */}
          <span className="text-[12px] font-mono font-semibold text-signal-green/80 tabular-nums leading-none ml-0.5">
            {timeRemaining}
          </span>
        </div>
      </div>

      <style>{`
        @keyframes ft8HudBarFlash {
          0% { opacity: 1; filter: brightness(2); }
          40% { opacity: 1; filter: brightness(1.5); }
          100% { opacity: 1; filter: brightness(1); }
        }
        .ft8-hud-bar-flash {
          animation: ft8HudBarFlash 0.6s ease-out;
        }
      `}</style>
    </div>
  );
}

export default Ft8SpotterHUD;
