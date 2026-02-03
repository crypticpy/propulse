/**
 * PropagationForecastMini Component
 *
 * Compact horizontal version of the propagation forecast for top bar placement.
 * Shows a condensed heatmap strip and best band recommendation.
 * Clicks to expand full PropagationForecastModal.
 */

import { useMemo, useState, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { useMapStore } from "@/stores/mapStore";
import { useUserStore } from "@/stores/userStore";
import { useDXStore } from "@/stores/dxStore";
import { useKIndex, useSolarFlux, useMagnetometer } from "@/hooks/useSolarData";
import {
  getForecastForPath,
  getBestWindows,
  getForecastStatusColor,
  getKIndexColor,
  type HourlyForecast,
  type BestWindow,
} from "@/lib/utils/bands";
import { getSunTimes } from "@/lib/utils/time";
import { PropagationForecastModal } from "./modals/PropagationForecastModal";
import { HelpButton, HelpModal, HELP_CONTENT } from "@/components/ui/HelpModal";

interface PropagationForecastMiniProps {
  displayTime: Date;
  className?: string;
}

// Band descriptions for tooltips
const BAND_INFO: Record<
  string,
  { freq: string; bestFor: string; needsSfi: number }
> = {
  "10m": { freq: "28 MHz", bestFor: "Solar max DX, local", needsSfi: 110 },
  "12m": { freq: "24 MHz", bestFor: "Solar max DX", needsSfi: 100 },
  "15m": { freq: "21 MHz", bestFor: "Daytime DX, contests", needsSfi: 90 },
  "17m": { freq: "18 MHz", bestFor: "Daytime DX", needsSfi: 80 },
  "20m": { freq: "14 MHz", bestFor: "Daytime DX workhorse", needsSfi: 70 },
  "30m": { freq: "10 MHz", bestFor: "CW/digital, day/night", needsSfi: 0 },
  "40m": { freq: "7 MHz", bestFor: "All-day workhorse", needsSfi: 0 },
  "60m": { freq: "5.3 MHz", bestFor: "NVIS, emergency", needsSfi: 0 },
  "80m": { freq: "3.5 MHz", bestFor: "Night DX, regional nets", needsSfi: 0 },
  "160m": { freq: "1.8 MHz", bestFor: "Night DX, regional", needsSfi: 0 },
};

// Status descriptions
const STATUS_LABELS: Record<string, { label: string; tip: string }> = {
  excellent: { label: "Excellent", tip: "Strong signals expected" },
  good: { label: "Good", tip: "Reliable contacts likely" },
  fair: { label: "Fair", tip: "Marginal - digital modes recommended" },
  poor: { label: "Poor", tip: "Weak signals - FT8/FT4 only" },
  closed: { label: "Closed", tip: "No propagation expected" },
};

interface HoverInfo {
  band: string;
  hour: number;
  status: string;
  snr: number;
  // Screen coordinates for smart positioning
  screenX: number;
  screenY: number;
}

// Tooltip dimensions (approximate)
const TOOLTIP_WIDTH = 160;
const TOOLTIP_HEIGHT = 180;
const TOOLTIP_OFFSET = 12; // Gap between cursor and tooltip

/**
 * Calculate smart tooltip position that keeps it within viewport
 * Appears to the right of cursor if room, otherwise left
 * Centered vertically on cursor, clamped to viewport bounds
 */
function calculateTooltipPosition(
  screenX: number,
  screenY: number,
): { left: number; top: number; side: "left" | "right" } {
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  // Determine horizontal position - prefer right, fallback to left
  let left: number;
  let side: "left" | "right";

  const spaceOnRight = viewportWidth - screenX - TOOLTIP_OFFSET;
  const spaceOnLeft = screenX - TOOLTIP_OFFSET;

  if (spaceOnRight >= TOOLTIP_WIDTH) {
    // Enough room on right
    left = screenX + TOOLTIP_OFFSET;
    side = "right";
  } else if (spaceOnLeft >= TOOLTIP_WIDTH) {
    // Use left side
    left = screenX - TOOLTIP_OFFSET - TOOLTIP_WIDTH;
    side = "left";
  } else {
    // Not enough room on either side - use whichever has more space
    if (spaceOnRight >= spaceOnLeft) {
      left = screenX + TOOLTIP_OFFSET;
      side = "right";
    } else {
      left = Math.max(8, screenX - TOOLTIP_OFFSET - TOOLTIP_WIDTH);
      side = "left";
    }
  }

  // Clamp left to viewport bounds
  left = Math.max(8, Math.min(left, viewportWidth - TOOLTIP_WIDTH - 8));

  // Calculate vertical position - center on cursor, clamp to viewport
  let top = screenY - TOOLTIP_HEIGHT / 2;

  // Clamp to viewport bounds with padding
  top = Math.max(8, Math.min(top, viewportHeight - TOOLTIP_HEIGHT - 8));

  return { left, top, side };
}

// Bands to display (prioritized order)
const DISPLAY_BANDS = ["10m", "15m", "20m", "40m", "80m"];

// Hours to show
const HOURS_TO_SHOW = 13;

export function PropagationForecastMini({
  displayTime,
  className = "",
}: PropagationForecastMiniProps) {
  const { target } = useMapStore();
  const { station } = useUserStore();
  const { syncMode, syncedBand } = useDXStore();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [hoverInfo, setHoverInfo] = useState<HoverInfo | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Fetch current solar data
  const { data: kIndexData, isLoading: kLoading } = useKIndex();
  const { data: solarFluxData, isLoading: sfiLoading } = useSolarFlux();
  const { data: magnetometerData } = useMagnetometer();

  // Get current Kp and SFI values
  const currentKp = useMemo(() => {
    if (!kIndexData || kIndexData.length === 0) return 3;
    return kIndexData[kIndexData.length - 1].kp_index;
  }, [kIndexData]);

  const currentSfi = useMemo(() => {
    if (!solarFluxData || solarFluxData.length === 0) return 100;
    return solarFluxData[solarFluxData.length - 1].flux;
  }, [solarFluxData]);

  // Get current Bz value from magnetometer data
  const currentBz = useMemo(() => {
    if (!magnetometerData || magnetometerData.length === 0) return null;
    return (
      magnetometerData
        .slice()
        .reverse()
        .find((d) => typeof d.bz_gsm === "number" && Number.isFinite(d.bz_gsm))
        ?.bz_gsm ?? null
    );
  }, [magnetometerData]);

  // Helper function to get SFI color
  const getSfiColor = (sfi: number): string => {
    if (sfi >= 150) return "#00ff88"; // Green
    if (sfi >= 100) return "#ffaa00"; // Amber
    return "#ff4455"; // Red
  };

  // Helper function to get Bz color and arrow
  const getBzDisplay = (
    bz: number | null,
  ): { arrow: string; color: string } => {
    if (bz === null) return { arrow: "-", color: "#6b7280" }; // Gray for no data
    if (bz > 0) return { arrow: "\u2191", color: "#00ff88" }; // Green northward
    if (bz < -5) return { arrow: "\u2193", color: "#ff4455" }; // Red southward
    return { arrow: "\u2193", color: "#ffaa00" }; // Amber for slightly negative
  };

  // Current UTC hour
  const currentHour = useMemo(() => {
    return displayTime.getUTCHours();
  }, [displayTime]);

  // Generate 24-hour forecast
  const forecast = useMemo<HourlyForecast[]>(() => {
    if (!station || !target) return [];
    return getForecastForPath(
      station.lat,
      station.lon,
      target.lat,
      target.lon,
      currentKp,
      currentSfi,
      displayTime,
    );
  }, [station, target, currentKp, currentSfi, displayTime]);

  // Calculate best windows
  const bestWindows = useMemo<BestWindow[]>(() => {
    if (forecast.length === 0) return [];
    return getBestWindows(forecast);
  }, [forecast]);

  // Best recommendation (top window)
  const topRecommendation = useMemo(() => {
    if (bestWindows.length === 0) return null;
    const best = bestWindows[0];
    return {
      band: best.band,
      time: best.peakHour.toString().padStart(2, "0"),
      status: best.peakStatus,
    };
  }, [bestWindows]);

  // Get hours around current time
  const visibleHours = useMemo(() => {
    const hours: number[] = [];
    const start = currentHour - 6;
    for (let i = 0; i < HOURS_TO_SHOW; i++) {
      hours.push((start + i + 24) % 24);
    }
    return hours;
  }, [currentHour]);

  // Calculate target sunrise/sunset times
  const targetSunTimes = useMemo(() => {
    if (!target) return null;
    return getSunTimes(target.lat, target.lon, displayTime);
  }, [target, displayTime]);

  // Get top 3 bands sorted by current conditions
  const topBandsNow = useMemo(() => {
    const hourData = forecast.find((f) => f.hour === currentHour);
    if (!hourData) return [];
    return hourData.bands
      .filter((b) => b.status !== "closed")
      .sort((a, b) => b.snrEstimate - a.snrEstimate)
      .slice(0, 3);
  }, [forecast, currentHour]);

  // Find next band opening (first future hour where a closed band opens)
  const nextOpening = useMemo(() => {
    for (let i = 1; i < 6; i++) {
      const futureHour = (currentHour + i) % 24;
      const futureData = forecast.find((f) => f.hour === futureHour);
      const currentData = forecast.find((f) => f.hour === currentHour);
      if (futureData && currentData) {
        for (const band of futureData.bands) {
          const currentBand = currentData.bands.find(
            (b) => b.band === band.band,
          );
          if (
            currentBand?.status === "closed" &&
            (band.status === "good" || band.status === "excellent")
          ) {
            return { band: band.band, hour: futureHour, hoursAway: i };
          }
        }
      }
    }
    return null;
  }, [forecast, currentHour]);

  // Generate plain English recommendation
  const getRecommendation = (): string => {
    if (currentKp >= 5) return "Storm conditions - expect degraded HF";
    if (topBandsNow.length === 0) return "No bands open - check back later";
    const best = topBandsNow[0];
    if (best.status === "excellent") {
      return `Great time for ${best.band} - strong signals expected`;
    }
    if (best.status === "good") {
      return `${best.band} is workable - try FT8 or CW`;
    }
    return `Marginal conditions - stick to digital modes`;
  };

  // Format time as HH:MM
  const formatTime = (date: Date): string => {
    return `${String(date.getUTCHours()).padStart(2, "0")}:${String(date.getUTCMinutes()).padStart(2, "0")}`;
  };

  // Handle card click
  const handleClick = useCallback(() => {
    if (station && target) {
      setIsModalOpen(true);
    }
  }, [station, target]);

  // Calculate path distance (must be before early returns)
  const pathDistance = useMemo(() => {
    if (!station || !target) return null;
    const R = 6371;
    const dLat = ((target.lat - station.lat) * Math.PI) / 180;
    const dLon = ((target.lon - station.lon) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((station.lat * Math.PI) / 180) *
        Math.cos((target.lat * Math.PI) / 180) *
        Math.sin(dLon / 2) ** 2;
    return Math.round(2 * R * Math.asin(Math.sqrt(a)));
  }, [station, target]);

  const hopCount = pathDistance ? Math.ceil(pathDistance / 3000) : null;

  const estimatedMuf = useMemo(() => {
    const baseMuf = 8 + (currentSfi - 70) * 0.12;
    const kpPenalty = currentKp > 4 ? (currentKp - 4) * 2 : 0;
    return Math.max(5, Math.min(35, baseMuf - kpPenalty));
  }, [currentSfi, currentKp]);

  // Loading state
  if (kLoading || sfiLoading) {
    return (
      <>
        <div
          className={`${className} h-full flex items-center justify-center text-gray-400 text-xs relative`}
        >
          <div className="absolute -top-1 -right-1 flex items-center gap-1 z-10">
            <HelpButton onClick={() => setShowHelp(true)} />
          </div>
          <div className="animate-pulse">Loading forecast...</div>
        </div>

        <HelpModal
          isOpen={showHelp}
          onClose={() => setShowHelp(false)}
          title={HELP_CONTENT.forecast.title}
          sections={HELP_CONTENT.forecast.sections}
        />
      </>
    );
  }

  // No station or target
  if (!station || !target) {
    return (
      <>
        <div
          className={`${className} h-full flex items-center justify-center relative`}
        >
          <div className="absolute -top-1 -right-1 flex items-center gap-1 z-10">
            <HelpButton onClick={() => setShowHelp(true)} />
          </div>
          <div className="text-xs text-gray-400">
            Select a target on the map
          </div>
        </div>

        <HelpModal
          isOpen={showHelp}
          onClose={() => setShowHelp(false)}
          title={HELP_CONTENT.forecast.title}
          sections={HELP_CONTENT.forecast.sections}
        />
      </>
    );
  }

  // Get Bz display values
  const bzDisplay = getBzDisplay(currentBz);

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        aria-label="24-hour propagation forecast - click to expand"
        className={`${className} h-full cursor-pointer hover:opacity-90 transition-opacity relative flex flex-col`}
        onClick={handleClick}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            handleClick();
          }
        }}
      >
        {/* TOP: Header with path metrics + Solar indices + ACTION ICONS */}
        <div className="flex items-center justify-between gap-1.5 mb-0.5 text-xs">
          {/* Left: Path metrics */}
          <div className="flex items-center gap-3 font-mono min-w-0">
            {pathDistance && (
              <span className="text-gray-300">
                <span className="text-gray-400">PATH</span>{" "}
                {pathDistance.toLocaleString()}km
                {hopCount && (
                  <span className="text-gray-400"> • {hopCount}F2</span>
                )}
              </span>
            )}
            <span>
              <span className="text-gray-400">MUF</span>{" "}
              <span className="text-cyan-400">{estimatedMuf.toFixed(1)}</span>
            </span>
          </div>

          {/* Center: Solar indices */}
          <div className="flex items-center gap-2 font-mono">
            <span
              style={{ color: getSfiColor(currentSfi) }}
              title="Solar Flux Index"
            >
              SFI {Math.round(currentSfi)}
            </span>
            <span style={{ color: getKIndexColor(currentKp) }} title="K-index">
              Kp {currentKp.toFixed(1)}
            </span>
            <span style={{ color: bzDisplay.color }} title="IMF Bz">
              Bz {bzDisplay.arrow}
            </span>
          </div>

          {/* Right: ACTION ICONS - Always top-right */}
          <div className="flex items-center gap-1 flex-shrink-0">
            <HelpButton onClick={() => setShowHelp(true)} />
            <button
              className="p-1 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-gray-400 hover:text-white transition-colors"
              title="Expand full forecast"
              aria-label="Expand forecast"
              onClick={(e) => {
                e.stopPropagation();
                handleClick();
              }}
            >
              <svg
                className="w-3.5 h-3.5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"
                />
              </svg>
            </button>
          </div>
        </div>

        {/* MAIN: Full-width Heatmap */}
        <div className="flex-1 flex flex-col min-h-0">
          {/* Heatmap row: labels + grid */}
          <div className="flex-1 flex gap-1 min-h-0">
            {/* Band labels - use CSS Grid to match heatmap rows exactly */}
            <div
              className="w-8 grid"
              style={{
                gridTemplateRows: `repeat(${DISPLAY_BANDS.length}, 1fr)`,
                gap: "2px",
              }}
            >
              {DISPLAY_BANDS.map((band) => {
                const isSynced = syncMode && syncedBand === band;
                return (
                  <div
                    key={band}
                    className={`text-xs font-mono flex items-center ${
                      isSynced ? "text-cyan-400 font-bold" : "text-gray-400"
                    }`}
                  >
                    {isSynced && (
                      <svg
                        className="w-2.5 h-2.5 mr-0.5 flex-shrink-0"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
                        />
                      </svg>
                    )}
                    {band}
                  </div>
                );
              })}
            </div>

            {/* Heatmap grid - CSS Grid, fills available height */}
            <div
              ref={containerRef}
              className="flex-1 min-w-0 grid"
              style={{
                gridTemplateColumns: `repeat(${HOURS_TO_SHOW}, 1fr)`,
                gridTemplateRows: `repeat(${DISPLAY_BANDS.length}, 1fr)`,
                gap: "3px",
              }}
            >
              {DISPLAY_BANDS.map((band) =>
                visibleHours.map((hour) => {
                  const hourData = forecast.find((f) => f.hour === hour);
                  const bandData = hourData?.bands.find((b) => b.band === band);
                  const status = bandData?.status || "closed";
                  const snr = bandData?.snrEstimate ?? -30;
                  const color = getForecastStatusColor(status);
                  const isCurrentHour = hour === currentHour;
                  const isSynced = syncMode && syncedBand === band;

                  return (
                    <div
                      key={`${band}-${hour}`}
                      className={`rounded-sm cursor-pointer transition-all hover:brightness-125 relative ${isCurrentHour ? "-translate-y-0.5 z-10 shadow-[5px_5px_8px_rgba(0,0,0,0.75)]" : ""} ${isSynced ? "ring-1 ring-cyan-400/60" : ""}`}
                      style={{
                        backgroundColor: color,
                        opacity:
                          status === "closed" ? 0.25 : isSynced ? 1 : 0.9,
                      }}
                      onMouseEnter={(e) =>
                        setHoverInfo({
                          band,
                          hour,
                          status,
                          snr,
                          screenX: e.clientX,
                          screenY: e.clientY,
                        })
                      }
                      onMouseMove={(e) =>
                        setHoverInfo((prev) =>
                          prev
                            ? {
                                ...prev,
                                screenX: e.clientX,
                                screenY: e.clientY,
                              }
                            : null,
                        )
                      }
                      onMouseLeave={() => setHoverInfo(null)}
                    />
                  );
                }),
              )}
            </div>
          </div>

          {/* Hour labels - below heatmap, offset to align with grid (skip band label column) */}
          <div className="flex gap-1">
            <div className="w-8" /> {/* Spacer matching band labels width */}
            <div
              className="flex-1 grid mt-1 text-xs font-mono"
              style={{ gridTemplateColumns: `repeat(${HOURS_TO_SHOW}, 1fr)` }}
            >
              {visibleHours.map((hour, idx) => (
                <div
                  key={hour}
                  className={`text-center ${hour === currentHour ? "text-white font-bold text-sm" : "text-gray-400"}`}
                >
                  {idx % 2 === 0 ? hour.toString().padStart(2, "0") : ""}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* BOTTOM: Two-row footer layout for breathing room */}
        <div className="flex flex-col gap-1 mt-1 text-xs">
          {/* Row 1: Best band + alternatives + peak windows */}
          <div className="flex gap-2 flex-wrap">
            {/* Best band NOW - primary recommendation */}
            {topBandsNow.length > 0 && (
              <div
                className="bg-signal-green/20 border border-signal-green/50 rounded px-2 py-1 flex items-center gap-1.5 cursor-help"
                title={`BEST BAND RIGHT NOW\n${topBandsNow[0].band} (${BAND_INFO[topBandsNow[0].band]?.freq || ""})\nEstimated SNR: ${topBandsNow[0].snrEstimate}dB\nCondition: ${topBandsNow[0].status}\nRecommended mode: ${topBandsNow[0].status === "excellent" ? "SSB or CW for voice/morse" : "FT8/FT4 digital modes"}`}
              >
                <span className="text-signal-green">▶</span>
                <span className="font-mono font-bold text-white">
                  {topBandsNow[0].band}
                </span>
                <span className="font-mono text-signal-green font-semibold">
                  {topBandsNow[0].snrEstimate > 0 ? "+" : ""}
                  {topBandsNow[0].snrEstimate}dB
                </span>
                <span className="text-gray-200">
                  {topBandsNow[0].status === "excellent" ? "SSB/CW" : "FT8"}
                </span>
              </div>
            )}

            {/* Also Open - alternative bands */}
            {topBandsNow.length > 1 && (
              <div
                className="bg-white/[0.06] rounded px-2 py-1 flex items-center gap-1.5 cursor-help"
                title={`ALTERNATIVE BANDS\nThese bands are also open right now:\n${topBandsNow
                  .slice(1)
                  .map(
                    (b) =>
                      `• ${b.band} (${BAND_INFO[b.band]?.freq || ""}): ${b.snrEstimate}dB, ${b.status}`,
                  )
                  .join("\n")}`}
              >
                <span className="text-gray-400">Also:</span>
                {topBandsNow.slice(1).map((band) => (
                  <span key={band.band} className="font-mono text-white">
                    {band.band}{" "}
                    <span
                      className="font-semibold"
                      style={{ color: getForecastStatusColor(band.status) }}
                    >
                      {band.snrEstimate > 0 ? "+" : ""}
                      {band.snrEstimate}
                    </span>
                  </span>
                ))}
              </div>
            )}

            {/* Peak Windows - best upcoming time */}
            <div
              className="bg-white/[0.06] rounded px-2 py-1 flex items-center gap-1.5 cursor-help"
              title={
                topRecommendation
                  ? `PEAK PROPAGATION WINDOW\n${topRecommendation.band} will peak at ${topRecommendation.time}:00 UTC\nCondition: ${topRecommendation.status}\n\nThis is the best time to work this band on this path.${nextOpening ? `\n\nNEXT BAND OPENING\n${nextOpening.band} opens in ${nextOpening.hoursAway} hour${nextOpening.hoursAway > 1 ? "s" : ""}` : ""}`
                  : "No peak windows predicted in the next 24 hours"
              }
            >
              {topRecommendation && (
                <>
                  <span className="text-gray-400">Peak:</span>
                  <span
                    className="font-mono font-bold"
                    style={{
                      color: getForecastStatusColor(topRecommendation.status),
                    }}
                  >
                    {topRecommendation.band}
                  </span>
                  <span className="text-gray-300 font-mono">
                    @{topRecommendation.time}z
                  </span>
                </>
              )}
              {nextOpening && (
                <>
                  {topRecommendation && (
                    <span className="text-gray-600 mx-0.5">│</span>
                  )}
                  <span className="font-mono text-signal-green font-semibold">
                    {nextOpening.band}
                  </span>
                  <span className="text-gray-400">
                    +{nextOpening.hoursAway}h
                  </span>
                </>
              )}
              {!topRecommendation && !nextOpening && (
                <span className="text-gray-500">No windows</span>
              )}
            </div>
          </div>

          {/* Row 2: Greyline times + Operating tip */}
          <div className="flex gap-2 items-center">
            {/* DX sun times - sunrise/sunset at target (greyline) */}
            {target && targetSunTimes && (
              <div
                className="bg-white/[0.06] rounded px-2 py-1 flex items-center gap-2 font-mono cursor-help flex-shrink-0"
                title={`GREYLINE WINDOW AT DX\n${target.name || target.grid || "Target"}\n\n☀ Sunrise: ${targetSunTimes.sunrise ? formatTime(targetSunTimes.sunrise) : "N/A"} UTC\n☽ Sunset: ${targetSunTimes.sunset ? formatTime(targetSunTimes.sunset) : "N/A"} UTC\n\nGreyline propagation is enhanced around these times.\nLow bands (40m-160m) often peak near sunset/sunrise.`}
              >
                <span className="text-gray-500 text-[10px]">★</span>
                <span className="text-amber-300">
                  {targetSunTimes.sunrise
                    ? formatTime(targetSunTimes.sunrise)
                    : "--:--"}
                </span>
                <span className="text-gray-600">→</span>
                <span className="text-orange-300">
                  {targetSunTimes.sunset
                    ? formatTime(targetSunTimes.sunset)
                    : "--:--"}
                </span>
              </div>
            )}

            {/* Tip - operating recommendation */}
            <div
              className="flex-1 bg-plasma-orange/10 border-l-2 border-plasma-orange rounded-r px-2 py-1 flex items-center min-w-0 cursor-help"
              title={`OPERATING TIP\n${getRecommendation()}\n\nBased on current solar conditions:\n• SFI: ${Math.round(currentSfi)} (${currentSfi >= 150 ? "excellent" : currentSfi >= 100 ? "good" : "low"})\n• Kp: ${currentKp.toFixed(1)} (${currentKp <= 2 ? "quiet" : currentKp <= 4 ? "unsettled" : "storm"})`}
            >
              <span className="text-gray-200 truncate">
                {getRecommendation()}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Tooltip - rendered via portal to document.body for proper positioning */}
      {hoverInfo &&
        createPortal(
          (() => {
            const pos = calculateTooltipPosition(
              hoverInfo.screenX,
              hoverInfo.screenY,
            );
            return (
              <div
                className="fixed pointer-events-none"
                style={{
                  left: pos.left,
                  top: pos.top,
                  width: TOOLTIP_WIDTH,
                  zIndex: 99999,
                }}
              >
                <div className="bg-nebula-blue/95 backdrop-blur-sm border border-white/20 rounded-lg shadow-2xl p-3">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="text-lg font-bold font-mono text-white">
                      {hoverInfo.band}
                    </span>
                    <span className="text-xs text-gray-400">
                      {BAND_INFO[hoverInfo.band]?.freq}
                    </span>
                  </div>
                  <div className="text-xs text-gray-400 mb-2">
                    {hoverInfo.hour.toString().padStart(2, "0")}:00 UTC
                    {hoverInfo.hour === currentHour && (
                      <span className="ml-2 text-white font-bold">NOW</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mb-2">
                    <div
                      className="w-3 h-3 rounded"
                      style={{
                        backgroundColor: getForecastStatusColor(
                          hoverInfo.status as
                            | "excellent"
                            | "good"
                            | "fair"
                            | "poor"
                            | "closed",
                        ),
                      }}
                    />
                    <span
                      className="text-sm font-semibold"
                      style={{
                        color: getForecastStatusColor(
                          hoverInfo.status as
                            | "excellent"
                            | "good"
                            | "fair"
                            | "poor"
                            | "closed",
                        ),
                      }}
                    >
                      {STATUS_LABELS[hoverInfo.status]?.label ||
                        hoverInfo.status}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs mb-2">
                    <span className="text-gray-400">Est. SNR</span>
                    <span className="font-mono text-white font-bold text-lg">
                      {hoverInfo.snr > 0 ? "+" : ""}
                      {hoverInfo.snr}dB
                    </span>
                  </div>
                  <div className="text-xs text-gray-400 border-t border-white/10 pt-2">
                    {STATUS_LABELS[hoverInfo.status]?.tip}
                  </div>
                  <div className="text-xs text-gray-400 mt-1">
                    {BAND_INFO[hoverInfo.band]?.bestFor}
                  </div>
                </div>
                <div
                  className="absolute top-1/2 -translate-y-1/2"
                  style={{
                    [pos.side === "right" ? "left" : "right"]: -6,
                    width: 0,
                    height: 0,
                    borderTop: "6px solid transparent",
                    borderBottom: "6px solid transparent",
                    [pos.side === "right" ? "borderRight" : "borderLeft"]:
                      "6px solid rgba(30, 41, 59, 0.95)",
                  }}
                />
              </div>
            );
          })(),
          document.body,
        )}

      {/* Expanded Modal */}
      <PropagationForecastModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        forecast={forecast}
        bestWindows={bestWindows}
        currentHour={currentHour}
        kp={currentKp}
        sfi={currentSfi}
        stationCallsign={station?.callsign || ""}
        targetName={target?.name || target?.grid || "Target"}
      />

      {/* Help Modal */}
      <HelpModal
        isOpen={showHelp}
        onClose={() => setShowHelp(false)}
        title={HELP_CONTENT.forecast.title}
        sections={HELP_CONTENT.forecast.sections}
      />
    </>
  );
}

export default PropagationForecastMini;
