/**
 * PropagationForecastMini Component
 *
 * Compact horizontal version of the propagation forecast for top bar placement.
 * Shows a condensed heatmap strip and best band recommendation.
 * Clicks to expand full PropagationForecastModal.
 */

import { useMemo, useState, useCallback } from "react";
import { useMapStore } from "@/stores/mapStore";
import { useUserStore } from "@/stores/userStore";
import { useKIndex, useSolarFlux } from "@/hooks/useSolarData";
import {
  getForecastForPath,
  getBestWindows,
  getForecastStatusColor,
  type HourlyForecast,
  type BestWindow,
} from "@/lib/utils/bands";
import { PropagationForecastModal } from "./modals/PropagationForecastModal";
import { HelpButton, HelpModal, HELP_CONTENT } from "@/components/ui/HelpModal";

interface PropagationForecastMiniProps {
  displayTime: Date;
  className?: string;
}

// Bands to display (prioritized order)
const DISPLAY_BANDS = ["10m", "15m", "20m", "40m", "80m"];

// Hours to show (current ± 6)
const HOURS_TO_SHOW = 13;

export function PropagationForecastMini({
  displayTime,
  className = "",
}: PropagationForecastMiniProps) {
  const { target } = useMapStore();
  const { station } = useUserStore();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  // Fetch current solar data
  const { data: kIndexData, isLoading: kLoading } = useKIndex();
  const { data: solarFluxData, isLoading: sfiLoading } = useSolarFlux();

  // Get current Kp and SFI values
  const currentKp = useMemo(() => {
    if (!kIndexData || kIndexData.length === 0) return 3;
    return kIndexData[kIndexData.length - 1].kp_index;
  }, [kIndexData]);

  const currentSfi = useMemo(() => {
    if (!solarFluxData || solarFluxData.length === 0) return 100;
    return solarFluxData[solarFluxData.length - 1].flux;
  }, [solarFluxData]);

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

  // Handle card click
  const handleClick = useCallback(() => {
    if (station && target) {
      setIsModalOpen(true);
    }
  }, [station, target]);

  // Loading state
  if (kLoading || sfiLoading) {
    return (
      <>
        <div
          className={`${className} h-full flex items-center justify-center text-gray-500 text-xs relative`}
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
          <div className="text-xs text-gray-500">
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

  return (
    <>
      <div
        className={`${className} h-full cursor-pointer hover:opacity-90 transition-opacity relative`}
        onClick={handleClick}
      >
        {/* Control buttons - top right */}
        <div className="absolute -top-1 -right-1 flex items-center gap-1 z-10">
          <HelpButton onClick={() => setShowHelp(true)} />
          <button
            className="p-1 rounded hover:bg-white/10 transition-colors"
            title="Expand forecast"
            onClick={(e) => {
              e.stopPropagation();
              handleClick();
            }}
          >
            <svg
              className="w-3.5 h-3.5 text-gray-400 hover:text-white"
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

        <div className="h-full flex items-center gap-3">
          {/* Best recommendation badge */}
          <div className="flex-shrink-0">
            <div className="text-[10px] text-gray-400 uppercase tracking-wide">
              Best
            </div>
            {topRecommendation ? (
              <div className="flex items-baseline gap-1">
                <span
                  className="text-lg font-bold font-mono"
                  style={{
                    color: getForecastStatusColor(topRecommendation.status),
                  }}
                >
                  {topRecommendation.band}
                </span>
                <span className="text-xs text-gray-400">
                  @{topRecommendation.time}z
                </span>
              </div>
            ) : (
              <div className="text-sm text-gray-400">--</div>
            )}
          </div>

          {/* Mini heatmap strip */}
          <div className="flex-1 min-w-0">
            <div className="flex gap-px">
              {visibleHours.map((hour, idx) => {
                const hourData = forecast.find((f) => f.hour === hour);
                const isCurrentHour = hour === currentHour;

                return (
                  <div
                    key={hour}
                    className={`flex-1 flex flex-col gap-px ${isCurrentHour ? "ring-1 ring-plasma-orange rounded" : ""}`}
                  >
                    {/* Hour label - improved contrast */}
                    <div
                      className={`text-[8px] text-center ${
                        isCurrentHour
                          ? "text-plasma-orange font-bold"
                          : "text-gray-300"
                      }`}
                    >
                      {idx === 0 || idx === 6 || idx === 12
                        ? hour.toString().padStart(2, "0")
                        : ""}
                    </div>

                    {/* Band cells */}
                    {DISPLAY_BANDS.map((band) => {
                      const bandData = hourData?.bands.find(
                        (b) => b.band === band,
                      );
                      const status = bandData?.status || "closed";
                      const color = getForecastStatusColor(status);

                      return (
                        <div
                          key={band}
                          className="h-1.5 rounded-sm"
                          style={{ backgroundColor: color, opacity: 0.85 }}
                          title={`${band} @ ${hour}:00 UTC - ${status}`}
                        />
                      );
                    })}
                  </div>
                );
              })}
            </div>

            {/* Band labels - improved contrast */}
            <div className="flex justify-between mt-0.5 text-[8px] text-gray-300">
              <span>10m</span>
              <span>40m</span>
              <span>80m</span>
            </div>
          </div>
        </div>
      </div>

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
