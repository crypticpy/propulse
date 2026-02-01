/**
 * PropagationForecastModal Component
 *
 * Expanded modal view of the 24-hour propagation forecast.
 * Shows larger heatmap, best window recommendations, and educational content.
 */

import { useMemo } from "react";
import { DetailModal } from "@/components/ui/DetailModal";
import {
  getForecastStatusColor,
  type HourlyForecast,
  type BestWindow,
} from "@/lib/utils/bands";

interface PropagationForecastModalProps {
  isOpen: boolean;
  onClose: () => void;
  forecast: HourlyForecast[];
  bestWindows: BestWindow[];
  currentHour: number;
  kp: number;
  sfi: number;
  stationCallsign: string;
  targetName: string;
}

// Bands to display (top to bottom - high bands first)
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

// Modal SVG dimensions (larger)
const CHART_WIDTH = 600;
const CHART_HEIGHT = 300;
const MARGIN = { top: 28, right: 16, bottom: 32, left: 48 };
const CELL_WIDTH = (CHART_WIDTH - MARGIN.left - MARGIN.right) / 24;
const CELL_HEIGHT =
  (CHART_HEIGHT - MARGIN.top - MARGIN.bottom) / DISPLAY_BANDS.length;

/**
 * Format hour for display
 */
function formatHour(hour: number): string {
  return `${hour.toString().padStart(2, "0")}:00`;
}

/**
 * Format hour range
 */
function formatHourRange(start: number, end: number): string {
  if (start === end) {
    return `${formatHour(start)}z`;
  }
  return `${start.toString().padStart(2, "0")}:00 - ${(end + 1).toString().padStart(2, "0")}:00z`;
}

/**
 * Get status label with proper casing
 */
function getStatusLabel(
  status: "excellent" | "good" | "fair" | "poor" | "closed",
): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

export function PropagationForecastModal({
  isOpen,
  onClose,
  forecast,
  bestWindows,
  currentHour,
  kp,
  sfi,
  stationCallsign,
  targetName,
}: PropagationForecastModalProps) {
  // Group best windows by quality
  const windowsByQuality = useMemo(() => {
    const excellent = bestWindows.filter((w) => w.peakStatus === "excellent");
    const good = bestWindows.filter((w) => w.peakStatus === "good");
    const fair = bestWindows.filter((w) => w.peakStatus === "fair");
    return { excellent, good, fair };
  }, [bestWindows]);

  // Find current best band (right now)
  const currentBestBand = useMemo(() => {
    if (forecast.length === 0) return null;
    const currentData = forecast[currentHour];
    if (!currentData) return null;

    let best = null;
    let bestSnr = -40;

    for (const band of currentData.bands) {
      if (band.snrEstimate > bestSnr && band.status !== "closed") {
        bestSnr = band.snrEstimate;
        best = band;
      }
    }

    return best;
  }, [forecast, currentHour]);

  // Determine day/night recommendation
  const timeOfDayTip = useMemo(() => {
    const dayBands = ["10m", "12m", "15m", "17m", "20m"];
    const nightBands = ["40m", "80m", "160m"];

    const hasDayOpening = bestWindows.some(
      (w) =>
        dayBands.includes(w.band) &&
        (w.peakStatus === "excellent" || w.peakStatus === "good"),
    );
    const hasNightOpening = bestWindows.some(
      (w) =>
        nightBands.includes(w.band) &&
        (w.peakStatus === "excellent" || w.peakStatus === "good"),
    );

    if (hasDayOpening && hasNightOpening) {
      return "This path has both day and night opportunities. Higher bands (10-20m) work best during daylight hours, while lower bands (40-160m) excel at night.";
    } else if (hasDayOpening) {
      return "This path favors daytime operation. Focus on 10-20m during daylight hours for best results.";
    } else if (hasNightOpening) {
      return "This path favors nighttime operation. Lower bands (40-160m) will provide the most reliable contacts after dark.";
    }
    return "Challenging conditions for this path. Consider trying different times or waiting for improved solar conditions.";
  }, [bestWindows]);

  return (
    <DetailModal
      isOpen={isOpen}
      onClose={onClose}
      title="24-Hour Propagation Forecast"
      subtitle={`${stationCallsign} to ${targetName}`}
      size="xl"
    >
      <div className="space-y-6">
        {/* Current conditions summary */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white/5 rounded-xl p-4 text-center">
            <div className="text-xs text-gray-500 mb-1">K-Index</div>
            <div
              className={`text-2xl font-mono font-bold ${
                kp <= 2
                  ? "text-signal-green"
                  : kp <= 4
                    ? "text-caution-amber"
                    : "text-alert-red"
              }`}
            >
              {kp}
            </div>
            <div className="text-[10px] text-gray-400 mt-1">
              {kp <= 2 ? "Quiet" : kp <= 4 ? "Unsettled" : "Stormy"}
            </div>
          </div>
          <div className="bg-white/5 rounded-xl p-4 text-center">
            <div className="text-xs text-gray-500 mb-1">Solar Flux</div>
            <div
              className={`text-2xl font-mono font-bold ${
                sfi >= 120
                  ? "text-signal-green"
                  : sfi >= 90
                    ? "text-good"
                    : "text-caution-amber"
              }`}
            >
              {sfi}
            </div>
            <div className="text-[10px] text-gray-400 mt-1">
              {sfi >= 150 ? "Excellent" : sfi >= 100 ? "Good" : "Low"}
            </div>
          </div>
          <div className="bg-white/5 rounded-xl p-4 text-center">
            <div className="text-xs text-gray-500 mb-1">Current Time</div>
            <div className="text-2xl font-mono font-bold text-plasma-orange">
              {currentHour.toString().padStart(2, "0")}:00z
            </div>
            <div className="text-[10px] text-gray-400 mt-1">UTC</div>
          </div>
          <div className="bg-white/5 rounded-xl p-4 text-center">
            <div className="text-xs text-gray-500 mb-1">Best Band Now</div>
            <div
              className={`text-2xl font-mono font-bold`}
              style={{
                color: currentBestBand
                  ? getForecastStatusColor(currentBestBand.status)
                  : "#666",
              }}
            >
              {currentBestBand?.band || "---"}
            </div>
            <div className="text-[10px] text-gray-400 mt-1">
              {currentBestBand
                ? `${currentBestBand.snrEstimate} dB`
                : "No opening"}
            </div>
          </div>
        </div>

        {/* Large heatmap */}
        <div className="bg-white/5 rounded-xl p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium text-white">
              Band Conditions by Hour (UTC)
            </h3>
            <div className="flex items-center gap-4 text-[10px]">
              <div className="flex items-center gap-1.5">
                <div
                  className="w-3 h-3 rounded"
                  style={{ background: "#00ff88" }}
                />
                <span className="text-gray-400">Excellent</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div
                  className="w-3 h-3 rounded"
                  style={{ background: "#44dd66" }}
                />
                <span className="text-gray-400">Good</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div
                  className="w-3 h-3 rounded"
                  style={{ background: "#ffaa00" }}
                />
                <span className="text-gray-400">Fair</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div
                  className="w-3 h-3 rounded"
                  style={{ background: "#ff4455" }}
                />
                <span className="text-gray-400">Poor</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div
                  className="w-3 h-3 rounded"
                  style={{ background: "#374151" }}
                />
                <span className="text-gray-400">Closed</span>
              </div>
            </div>
          </div>

          <div className="flex justify-center overflow-x-auto">
            <svg
              width={CHART_WIDTH}
              height={CHART_HEIGHT}
              viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
              className="min-w-[500px]"
            >
              {/* Definitions */}
              <defs>
                <filter
                  id="modalGlow"
                  x="-50%"
                  y="-50%"
                  width="200%"
                  height="200%"
                >
                  <feGaussianBlur stdDeviation="3" result="coloredBlur" />
                  <feMerge>
                    <feMergeNode in="coloredBlur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
                <linearGradient
                  id="modalCellShine"
                  x1="0%"
                  y1="0%"
                  x2="100%"
                  y2="100%"
                >
                  <stop offset="0%" stopColor="white" stopOpacity="0.15" />
                  <stop offset="100%" stopColor="white" stopOpacity="0" />
                </linearGradient>
              </defs>

              {/* Y-axis labels (bands) - improved contrast */}
              {DISPLAY_BANDS.map((band, idx) => (
                <text
                  key={band}
                  x={MARGIN.left - 8}
                  y={MARGIN.top + idx * CELL_HEIGHT + CELL_HEIGHT / 2 + 4}
                  textAnchor="end"
                  className="fill-gray-200 text-[11px] font-mono"
                >
                  {band}
                </text>
              ))}

              {/* X-axis labels (hours) - show every 2 hours with better contrast */}
              {Array.from({ length: 12 }, (_, i) => i * 2).map((hour) => (
                <text
                  key={hour}
                  x={MARGIN.left + hour * CELL_WIDTH + CELL_WIDTH}
                  y={CHART_HEIGHT - 8}
                  textAnchor="middle"
                  className="fill-gray-300 text-[10px] font-mono"
                >
                  {hour.toString().padStart(2, "0")}
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
                    <g key={`modal-${hourData.hour}-${band}`}>
                      <rect
                        x={x + 0.5}
                        y={y + 0.5}
                        width={CELL_WIDTH - 1}
                        height={CELL_HEIGHT - 1}
                        fill={color}
                        opacity={0.9}
                        rx={2}
                        className="transition-opacity hover:opacity-100"
                      />
                      <rect
                        x={x + 0.5}
                        y={y + 0.5}
                        width={CELL_WIDTH - 1}
                        height={(CELL_HEIGHT - 1) / 2}
                        fill="url(#modalCellShine)"
                        rx={2}
                      />
                      {/* Show SNR on hover area - larger cells */}
                      {CELL_WIDTH > 20 && CELL_HEIGHT > 20 && bandData && (
                        <text
                          x={x + CELL_WIDTH / 2}
                          y={y + CELL_HEIGHT / 2 + 3}
                          textAnchor="middle"
                          className="fill-black/40 text-[8px] font-mono pointer-events-none"
                        >
                          {bandData.snrEstimate}
                        </text>
                      )}
                    </g>
                  );
                }),
              )}

              {/* Current time indicator */}
              <g filter="url(#modalGlow)">
                <line
                  x1={MARGIN.left + currentHour * CELL_WIDTH + CELL_WIDTH / 2}
                  y1={MARGIN.top - 6}
                  x2={MARGIN.left + currentHour * CELL_WIDTH + CELL_WIDTH / 2}
                  y2={CHART_HEIGHT - MARGIN.bottom + 6}
                  stroke="#ff6b35"
                  strokeWidth={2.5}
                  strokeLinecap="round"
                />
                <polygon
                  points={`
                    ${MARGIN.left + currentHour * CELL_WIDTH + CELL_WIDTH / 2 - 6},${MARGIN.top - 12}
                    ${MARGIN.left + currentHour * CELL_WIDTH + CELL_WIDTH / 2 + 6},${MARGIN.top - 12}
                    ${MARGIN.left + currentHour * CELL_WIDTH + CELL_WIDTH / 2},${MARGIN.top - 2}
                  `}
                  fill="#ff6b35"
                />
              </g>

              {/* NOW label */}
              <text
                x={MARGIN.left + currentHour * CELL_WIDTH + CELL_WIDTH / 2}
                y={MARGIN.top - 18}
                textAnchor="middle"
                className="fill-plasma-orange text-[10px] font-bold"
              >
                NOW
              </text>
            </svg>
          </div>
        </div>

        {/* Best Windows Recommendations */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Top Recommendations */}
          <div className="bg-white/5 rounded-xl p-4">
            <h3 className="text-sm font-medium text-white mb-3 flex items-center gap-2">
              <svg
                className="w-4 h-4 text-signal-green"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                  clipRule="evenodd"
                />
              </svg>
              Best Operating Windows
            </h3>

            {bestWindows.length === 0 ? (
              <p className="text-gray-500 text-sm">
                No favorable windows found for this path. Consider waiting for
                better conditions.
              </p>
            ) : (
              <div className="space-y-2">
                {bestWindows.slice(0, 5).map((window, idx) => (
                  <div
                    key={window.band}
                    className={`flex items-center justify-between p-2 rounded-lg ${
                      idx === 0
                        ? "bg-signal-green/10 border border-signal-green/30"
                        : "bg-white/5"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className="font-mono font-bold text-sm"
                        style={{
                          color: getForecastStatusColor(window.peakStatus),
                        }}
                      >
                        {window.band}
                      </span>
                      <span className="text-gray-400 text-xs">
                        {formatHourRange(window.startHour, window.endHour)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className="text-xs px-2 py-0.5 rounded-full"
                        style={{
                          color: getForecastStatusColor(window.peakStatus),
                          backgroundColor: `${getForecastStatusColor(window.peakStatus)}20`,
                        }}
                      >
                        {getStatusLabel(window.peakStatus)}
                      </span>
                      <span className="font-mono text-xs text-gray-500">
                        {window.peakSnr} dB
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Band Groupings */}
          <div className="bg-white/5 rounded-xl p-4">
            <h3 className="text-sm font-medium text-white mb-3 flex items-center gap-2">
              <svg
                className="w-4 h-4 text-plasma-orange"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fillRule="evenodd"
                  d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                  clipRule="evenodd"
                />
              </svg>
              Path Analysis
            </h3>

            <div className="space-y-3">
              {/* Excellent bands */}
              {windowsByQuality.excellent.length > 0 && (
                <div>
                  <div className="text-xs text-signal-green font-medium mb-1">
                    Excellent Conditions Expected
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {windowsByQuality.excellent.map((w) => (
                      <span
                        key={w.band}
                        className="text-xs px-2 py-1 bg-signal-green/20 text-signal-green rounded"
                      >
                        {w.band}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Good bands */}
              {windowsByQuality.good.length > 0 && (
                <div>
                  <div className="text-xs text-good font-medium mb-1">
                    Good Conditions Expected
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {windowsByQuality.good.map((w) => (
                      <span
                        key={w.band}
                        className="text-xs px-2 py-1 bg-good/20 text-good rounded"
                      >
                        {w.band}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Fair bands */}
              {windowsByQuality.fair.length > 0 && (
                <div>
                  <div className="text-xs text-caution-amber font-medium mb-1">
                    Marginal Conditions
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {windowsByQuality.fair.map((w) => (
                      <span
                        key={w.band}
                        className="text-xs px-2 py-1 bg-caution-amber/20 text-caution-amber rounded"
                      >
                        {w.band}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Recommendation */}
              <div className="pt-2 border-t border-white/10">
                <p className="text-xs text-gray-400 leading-relaxed">
                  {timeOfDayTip}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Educational Content for Beginners */}
        <div className="bg-gradient-to-r from-nebula-blue/50 to-void/50 rounded-xl p-4 border border-white/10">
          <h3 className="text-sm font-medium text-white mb-3 flex items-center gap-2">
            <svg
              className="w-4 h-4 text-cosmic-cyan"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
            </svg>
            Understanding the Forecast
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-gray-400">
            <div>
              <h4 className="text-white font-medium mb-1">
                How to Read This Chart
              </h4>
              <ul className="space-y-1 list-disc list-inside">
                <li>Each row is an amateur radio band (frequency)</li>
                <li>Each column is an hour of the day (UTC time)</li>
                <li>Green = excellent propagation expected</li>
                <li>The orange line shows the current time</li>
              </ul>
            </div>
            <div>
              <h4 className="text-white font-medium mb-1">Tips for DX</h4>
              <ul className="space-y-1 list-disc list-inside">
                <li>Higher bands (10-20m) work best during daylight</li>
                <li>Lower bands (40-160m) are better at night</li>
                <li>Greyline (dawn/dusk) can offer unique openings</li>
                <li>Higher solar flux = better high-band conditions</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </DetailModal>
  );
}

export default PropagationForecastModal;
