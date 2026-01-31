/**
 * PropagationForecast Component
 *
 * Displays a 24-hour band × time heatmap showing propagation conditions.
 * Compact card view with click-to-expand modal for detailed analysis.
 * Uses SVG for smooth, premium visualization.
 */

import { useMemo, useState, useCallback } from "react";
import { useMapStore } from "@/stores/mapStore";
import { useUserStore } from "@/stores/userStore";
import { useKIndex, useSolarFlux } from "@/hooks/useSolarData";
import { Card } from "@/components/ui/Card";
import {
  getForecastForPath,
  getBestWindows,
  getForecastStatusColor,
  type HourlyForecast,
  type BestWindow,
} from "@/lib/utils/bands";
import { PropagationForecastModal } from "./modals/PropagationForecastModal";

interface PropagationForecastProps {
  /** Current display time for baseline calculation */
  displayTime: Date;
  className?: string;
}

// Bands to display (top to bottom)
const DISPLAY_BANDS = [
  "10m",
  "12m",
  "15m",
  "17m",
  "20m",
  "30m",
  "40m",
  "80m",
  "160m",
];

// SVG dimensions
const CHART_WIDTH = 280;
const CHART_HEIGHT = 180;
const MARGIN = { top: 20, right: 8, bottom: 24, left: 36 };
const CELL_WIDTH = (CHART_WIDTH - MARGIN.left - MARGIN.right) / 24;
const CELL_HEIGHT =
  (CHART_HEIGHT - MARGIN.top - MARGIN.bottom) / DISPLAY_BANDS.length;

/**
 * Format hour for display (UTC)
 */
function formatHour(hour: number): string {
  return `${hour.toString().padStart(2, "0")}`;
}

export function PropagationForecast({
  displayTime,
  className = "",
}: PropagationForecastProps) {
  const { target } = useMapStore();
  const { station } = useUserStore();
  const [isModalOpen, setIsModalOpen] = useState(false);

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
      time: formatHour(best.peakHour),
      status: best.peakStatus,
    };
  }, [bestWindows]);

  // Handle card click to open modal
  const handleCardClick = useCallback(() => {
    if (station && target) {
      setIsModalOpen(true);
    }
  }, [station, target]);

  // Loading state
  if (kLoading || sfiLoading) {
    return (
      <Card className={className}>
        <div className="text-center py-8 text-gray-500">
          <div className="animate-pulse">Loading forecast data...</div>
        </div>
      </Card>
    );
  }

  // No station configured
  if (!station) {
    return (
      <Card className={className}>
        <div className="text-center py-6 text-gray-500">
          <p className="text-sm">Set your QTH in settings for forecast</p>
        </div>
      </Card>
    );
  }

  // No target selected - show general conditions
  if (!target) {
    return (
      <Card className={className}>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-white">24h Forecast</h3>
            <div className="text-xs text-gray-500">
              Kp={currentKp} SFI={currentSfi}
            </div>
          </div>
          <div className="text-center py-4 text-gray-500">
            <p className="text-sm">Select target for path forecast</p>
            <p className="text-xs mt-1">
              Click on the map to set a target location
            </p>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <>
      <Card
        className={`cursor-pointer hover:border-plasma-orange/30 transition-colors ${className}`}
        onClick={handleCardClick}
      >
        <div className="space-y-3">
          {/* Header with best recommendation */}
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-medium text-white">24h Forecast</h3>
              {topRecommendation && (
                <p className="text-xs text-gray-500 mt-0.5">
                  Best: {topRecommendation.band} @ {topRecommendation.time}z
                </p>
              )}
            </div>
            <button
              className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 transition-colors"
              title="Expand forecast"
            >
              <svg
                className="w-4 h-4 text-gray-400"
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

          {/* SVG Heatmap */}
          <div className="flex justify-center">
            <svg
              width={CHART_WIDTH}
              height={CHART_HEIGHT}
              viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
              className="overflow-visible"
            >
              {/* Definitions for gradients and filters */}
              <defs>
                {/* Glow filter for current time indicator */}
                <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur stdDeviation="2" result="coloredBlur" />
                  <feMerge>
                    <feMergeNode in="coloredBlur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
                {/* Gradient for cell hover effect */}
                <linearGradient
                  id="cellShine"
                  x1="0%"
                  y1="0%"
                  x2="100%"
                  y2="100%"
                >
                  <stop offset="0%" stopColor="white" stopOpacity="0.1" />
                  <stop offset="100%" stopColor="white" stopOpacity="0" />
                </linearGradient>
              </defs>

              {/* Y-axis labels (bands) */}
              {DISPLAY_BANDS.map((band, idx) => (
                <text
                  key={band}
                  x={MARGIN.left - 4}
                  y={MARGIN.top + idx * CELL_HEIGHT + CELL_HEIGHT / 2 + 3}
                  textAnchor="end"
                  className="fill-gray-500 text-[9px] font-mono"
                >
                  {band}
                </text>
              ))}

              {/* X-axis labels (hours) - show every 4 hours */}
              {[0, 4, 8, 12, 16, 20].map((hour) => (
                <text
                  key={hour}
                  x={MARGIN.left + hour * CELL_WIDTH + CELL_WIDTH / 2}
                  y={CHART_HEIGHT - 6}
                  textAnchor="middle"
                  className="fill-gray-500 text-[9px] font-mono"
                >
                  {formatHour(hour)}
                </text>
              ))}

              {/* Grid cells */}
              {forecast.map((hourData) =>
                DISPLAY_BANDS.map((band, bandIdx) => {
                  const bandData = hourData.bands.find((b) => b.band === band);
                  const status = bandData?.status || "closed";
                  const color = getForecastStatusColor(status);
                  const x = MARGIN.left + hourData.hour * CELL_WIDTH;
                  const y = MARGIN.top + bandIdx * CELL_HEIGHT;

                  return (
                    <g key={`${hourData.hour}-${band}`}>
                      <rect
                        x={x}
                        y={y}
                        width={CELL_WIDTH}
                        height={CELL_HEIGHT}
                        fill={color}
                        opacity={0.85}
                        rx={1}
                        className="transition-opacity hover:opacity-100"
                      />
                      {/* Subtle inner highlight */}
                      <rect
                        x={x}
                        y={y}
                        width={CELL_WIDTH}
                        height={CELL_HEIGHT / 2}
                        fill="url(#cellShine)"
                        rx={1}
                      />
                    </g>
                  );
                }),
              )}

              {/* Current time indicator */}
              <g filter="url(#glow)">
                <line
                  x1={MARGIN.left + currentHour * CELL_WIDTH + CELL_WIDTH / 2}
                  y1={MARGIN.top - 4}
                  x2={MARGIN.left + currentHour * CELL_WIDTH + CELL_WIDTH / 2}
                  y2={CHART_HEIGHT - MARGIN.bottom + 4}
                  stroke="#ff6b35"
                  strokeWidth={2}
                  strokeLinecap="round"
                />
                {/* Current time triangle marker */}
                <polygon
                  points={`
                    ${MARGIN.left + currentHour * CELL_WIDTH + CELL_WIDTH / 2 - 4},${MARGIN.top - 8}
                    ${MARGIN.left + currentHour * CELL_WIDTH + CELL_WIDTH / 2 + 4},${MARGIN.top - 8}
                    ${MARGIN.left + currentHour * CELL_WIDTH + CELL_WIDTH / 2},${MARGIN.top - 2}
                  `}
                  fill="#ff6b35"
                />
              </g>

              {/* "NOW" label */}
              <text
                x={MARGIN.left + currentHour * CELL_WIDTH + CELL_WIDTH / 2}
                y={MARGIN.top - 12}
                textAnchor="middle"
                className="fill-plasma-orange text-[8px] font-bold"
              >
                NOW
              </text>
            </svg>
          </div>

          {/* Legend */}
          <div className="flex items-center justify-center gap-3 text-[10px]">
            <div className="flex items-center gap-1">
              <div
                className="w-2.5 h-2.5 rounded-sm"
                style={{ background: "#00ff88" }}
              />
              <span className="text-gray-500">Excellent</span>
            </div>
            <div className="flex items-center gap-1">
              <div
                className="w-2.5 h-2.5 rounded-sm"
                style={{ background: "#44dd66" }}
              />
              <span className="text-gray-500">Good</span>
            </div>
            <div className="flex items-center gap-1">
              <div
                className="w-2.5 h-2.5 rounded-sm"
                style={{ background: "#ffaa00" }}
              />
              <span className="text-gray-500">Fair</span>
            </div>
            <div className="flex items-center gap-1">
              <div
                className="w-2.5 h-2.5 rounded-sm"
                style={{ background: "#ff4455" }}
              />
              <span className="text-gray-500">Poor</span>
            </div>
          </div>

          {/* Click hint */}
          <div className="text-center text-[10px] text-gray-600">
            Click for detailed forecast & recommendations
          </div>
        </div>
      </Card>

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
    </>
  );
}

export default PropagationForecast;
