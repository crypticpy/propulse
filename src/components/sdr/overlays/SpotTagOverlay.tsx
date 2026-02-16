/**
 * SpotTagOverlay — Enhanced DX cluster spot markers on the spectrum/waterfall.
 *
 * Features:
 * - Mode-based coloring (CW→blue, SSB→green, FT8→cyan, RTTY→purple)
 * - Click-to-tune on spot markers
 * - Hover tooltip with callsign, mode, time, comment
 * - Age-based opacity fade (newer spots brighter)
 * - Compact rendering to avoid clutter
 *
 * Positioned absolutely; requires parent with position: relative.
 */

import { useMemo, useState, useCallback } from "react";
import type { ClusterSpotMessage } from "@/lib/radio/protocol";

// ─── Props ───────────────────────────────────────────────────────────────────

export interface SpotTagOverlayProps {
  /** All available cluster spots */
  spots: ClusterSpotMessage[];
  /** Current view center in Hz */
  centerHz: number;
  /** Current view span in Hz */
  spanHz: number;
  /** Maximum spots to render (default: 30) */
  maxSpots?: number;
  /** Click to tune to a spot frequency */
  onPickFrequencyHz?: (hz: number) => void;
  /** Position: "top" renders labels at top, "bottom" at bottom */
  position?: "top" | "bottom";
  className?: string;
}

// ─── Spot mode → color mapping ───────────────────────────────────────────────

const SPOT_MODE_COLORS: Record<
  string,
  { line: string; bg: string; text: string }
> = {
  CW: {
    line: "bg-blue-400/60",
    bg: "bg-blue-500/15 border-blue-400/30",
    text: "text-blue-300",
  },
  SSB: {
    line: "bg-green-400/60",
    bg: "bg-green-500/15 border-green-400/30",
    text: "text-green-300",
  },
  USB: {
    line: "bg-green-400/60",
    bg: "bg-green-500/15 border-green-400/30",
    text: "text-green-300",
  },
  LSB: {
    line: "bg-green-400/60",
    bg: "bg-green-500/15 border-green-400/30",
    text: "text-green-300",
  },
  FT8: {
    line: "bg-cosmic-cyan/60",
    bg: "bg-cosmic-cyan/15 border-cosmic-cyan/30",
    text: "text-cosmic-cyan",
  },
  FT4: {
    line: "bg-cosmic-cyan/60",
    bg: "bg-cosmic-cyan/15 border-cosmic-cyan/30",
    text: "text-cosmic-cyan",
  },
  RTTY: {
    line: "bg-purple-400/60",
    bg: "bg-purple-500/15 border-purple-400/30",
    text: "text-purple-300",
  },
  PSK: {
    line: "bg-purple-400/60",
    bg: "bg-purple-500/15 border-purple-400/30",
    text: "text-purple-300",
  },
  FM: {
    line: "bg-plasma-orange/60",
    bg: "bg-plasma-orange/15 border-plasma-orange/30",
    text: "text-plasma-orange",
  },
  AM: {
    line: "bg-yellow-400/60",
    bg: "bg-yellow-500/15 border-yellow-400/30",
    text: "text-yellow-300",
  },
};

const DEFAULT_SPOT_COLOR = {
  line: "bg-plasma-orange/50",
  bg: "bg-plasma-orange/10 border-plasma-orange/25",
  text: "text-plasma-orange/80",
};

function getSpotColor(mode?: string) {
  if (!mode) return DEFAULT_SPOT_COLOR;
  const upper = mode.toUpperCase();
  return SPOT_MODE_COLORS[upper] ?? DEFAULT_SPOT_COLOR;
}

/** Infer mode from spot comment if mode field is missing */
function inferMode(spot: ClusterSpotMessage): string | undefined {
  if (spot.mode) return spot.mode;
  const c = spot.comment?.toUpperCase() ?? "";
  if (c.includes("FT8")) return "FT8";
  if (c.includes("FT4")) return "FT4";
  if (c.includes("CW")) return "CW";
  if (c.includes("SSB") || c.includes("USB") || c.includes("LSB")) return "SSB";
  if (c.includes("RTTY")) return "RTTY";
  if (c.includes("PSK")) return "PSK";
  if (c.includes("FM")) return "FM";
  return undefined;
}

// ─── Compute spot age in minutes ─────────────────────────────────────────────

function spotAgeMinutes(spot: ClusterSpotMessage): number {
  if (!spot.time) return 0;
  const now = Date.now();
  const t = new Date(spot.time).getTime();
  if (!Number.isFinite(t)) return 0;
  return Math.max(0, (now - t) / 60_000);
}

// ─── Component ───────────────────────────────────────────────────────────────

interface VisibleSpot {
  spot: ClusterSpotMessage;
  pct: number; // left position as percentage
  mode: string | undefined;
  ageMin: number;
}

export function SpotTagOverlay({
  spots,
  centerHz,
  spanHz,
  maxSpots = 30,
  onPickFrequencyHz,
  position = "top",
  className = "",
}: SpotTagOverlayProps) {
  const [hoveredSpot, setHoveredSpot] = useState<string | null>(null);

  const visibleSpots = useMemo(() => {
    if (!Number.isFinite(centerHz) || !Number.isFinite(spanHz) || spanHz <= 0) {
      return [];
    }

    const viewStartHz = centerHz - spanHz / 2;
    const viewEndHz = centerHz + spanHz / 2;

    const result: VisibleSpot[] = [];
    for (const s of spots) {
      if (result.length >= maxSpots) break;
      const freqHz = s.freq * 1000; // ClusterSpotMessage freq is in kHz
      if (freqHz < viewStartHz || freqHz > viewEndHz) continue;

      const pct = ((freqHz - viewStartHz) / spanHz) * 100;
      result.push({
        spot: s,
        pct,
        mode: inferMode(s),
        ageMin: spotAgeMinutes(s),
      });
    }

    return result;
  }, [spots, centerHz, spanHz, maxSpots]);

  const handleClick = useCallback(
    (freqHz: number) => {
      onPickFrequencyHz?.(freqHz);
    },
    [onPickFrequencyHz],
  );

  if (visibleSpots.length === 0) return null;

  const isTop = position === "top";

  return (
    <div className={`absolute inset-0 z-[2] ${className}`}>
      {visibleSpots.map((vs) => {
        const color = getSpotColor(vs.mode);
        const spotKey =
          vs.spot.id ?? vs.spot.key ?? `${vs.spot.dx}-${vs.spot.freq}`;
        const isHovered = hoveredSpot === spotKey;
        // Fade opacity for older spots (full opacity < 5min, 50% at 30min)
        const ageFactor = Math.max(0.4, 1 - vs.ageMin / 60);
        const interactive = !!onPickFrequencyHz;

        return (
          <div
            key={spotKey}
            className="absolute top-0 bottom-0"
            style={{ left: `${vs.pct}%`, opacity: ageFactor }}
          >
            {/* Vertical marker line */}
            <div className={`w-px h-full ${color.line}`} />

            {/* Callsign tag */}
            <div
              className={`absolute ${isTop ? "top-0.5" : "bottom-0.5"} left-0 -translate-x-1/2 ${
                interactive
                  ? "pointer-events-auto cursor-pointer"
                  : "pointer-events-none"
              }`}
              onClick={
                interactive ? () => handleClick(vs.spot.freq * 1000) : undefined
              }
              onMouseEnter={() => setHoveredSpot(spotKey)}
              onMouseLeave={() => setHoveredSpot(null)}
            >
              <div
                className={`px-1 py-px rounded text-[9px] font-mono font-semibold
                  border whitespace-nowrap transition-all
                  ${color.bg} ${color.text}
                  ${isHovered ? "ring-1 ring-white/20 scale-110" : ""}
                  ${interactive ? "hover:brightness-125" : ""}
                `}
              >
                {vs.spot.dx}
              </div>

              {/* Hover tooltip with details */}
              {isHovered && (
                <div
                  className={`absolute ${isTop ? "top-full mt-1" : "bottom-full mb-1"} left-1/2 -translate-x-1/2
                    bg-void-black/95 border border-white/15 rounded px-2 py-1.5
                    text-[10px] text-gray-300 whitespace-nowrap z-50 shadow-lg`}
                >
                  <div className="font-semibold text-white">{vs.spot.dx}</div>
                  <div className="text-gray-400">
                    {vs.spot.freq.toFixed(1)} kHz
                    {vs.mode && (
                      <span className={`ml-1 ${color.text}`}>{vs.mode}</span>
                    )}
                  </div>
                  {vs.spot.comment && (
                    <div className="text-gray-500 max-w-[200px] truncate">
                      {vs.spot.comment}
                    </div>
                  )}
                  <div className="text-gray-600 text-[9px]">
                    by {vs.spot.spotter}
                    {vs.ageMin > 0 && ` · ${Math.round(vs.ageMin)}m ago`}
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
