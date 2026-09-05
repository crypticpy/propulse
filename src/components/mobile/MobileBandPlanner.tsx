import { useSolarHandoff } from "@/hooks/useSolarHandoff";
import { SolarHandoffNotice } from "@/components/solar/SolarHandoffNotice";
import { solarAnalysisMode } from "@/lib/solar/handoff";
/**
 * MobileBandPlanner Component
 *
 * Mobile-friendly band planner with card-based layout replacing the
 * desktop 24-column heatmap table. Features:
 * - Best band at the selected hour
 * - Per-band cards with 24-hour gradient bars
 * - Tap-to-expand hourly detail
 * - Compact target input
 */

import { useState, useMemo, useCallback } from "react";
import { Card, LoadingSpinner, DataFreshnessIndicator } from "@/components/ui";
import { InfoTip } from "@/components/ui/Tooltip";
import { SOLAR_TOOLTIPS } from "@/constants/tooltips";
import {
  getForecastForPath,
  getBestWindows,
  getForecastStatusColor,
  calculateGreatCircleDistance,
  type HourlyForecast,
  type BestWindow,
} from "@/lib/utils/bands";
import { useActiveMode } from "@/hooks/useActiveBandMode";
import { useForecastStationParams } from "@/hooks/useActiveStationGain";
import { kpToAp } from "@/lib/utils/solarConversions";
import { gridToLatLon } from "@/lib/utils/grid";
import type { UserStation } from "@/types/user";
import { NowCastBandPanel } from "@/components/propagation/NowCastBandPanel";
import {
  useNowCastBandPredictions,
  type NowCastBandInput,
} from "@/hooks/useNowCastBandPredictions";
import {
  HF_MODEL_BANDS,
  type OperationalSpaceWeather,
} from "@/lib/propagation/coreFeatureBuilder";
import type { ResearchSubjectBinding } from "@/lib/propagation/modelClient";

// --- Types ---

type ForecastStatus = "excellent" | "good" | "fair" | "poor" | "closed";

interface MobileBandPlannerProps {
  station: UserStation;
  currentKp: number | null;
  currentFlux: number | null;
  currentBz: number | null;
  isLoading: boolean;
  bandDataUpdatedAt: number | undefined;
  bandIsRefetching: boolean;
  refetchBandData: () => void;
  deriveEnvelope: NowCastBandInput["deriveEnvelope"];
  modelWeather?: OperationalSpaceWeather;
  modelWeatherUpdatedAt?: number;
  researchSubjectBinding?: ResearchSubjectBinding | null;
  stationChainName?: string;
  locationName?: string;
}

// --- Helpers ---

const BANDS = ["160m", "80m", "40m", "30m", "20m", "17m", "15m", "12m", "10m"];

function getStatusTextColor(status: ForecastStatus): string {
  switch (status) {
    case "excellent":
      return "text-signal-green";
    case "good":
      return "text-green-400";
    case "fair":
      return "text-caution-amber";
    case "poor":
      return "text-alert-red";
    case "closed":
      return "text-gray-600";
  }
}

function getStatusLabel(status: ForecastStatus): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

// --- Component ---

export function MobileBandPlanner({
  station,
  currentKp,
  currentFlux,
  currentBz,
  isLoading,
  bandDataUpdatedAt,
  bandIsRefetching,
  refetchBandData,
  deriveEnvelope,
  modelWeather,
  modelWeatherUpdatedAt,
  researchSubjectBinding,
  stationChainName,
  locationName,
}: MobileBandPlannerProps) {
  const solarHandoff = useSolarHandoff();
  // Target location state
  const [targetGrid, setTargetGrid] = useState(solarHandoff?.target?.grid ?? "");
  const [targetCoords, setTargetCoords] = useState<{
    lat: number;
    lon: number;
    grid: string;
  } | null>(solarHandoff?.target ?? null);

  // Expanded band card
  const [expandedBand, setExpandedBand] = useState<string | null>(null);

  const liveMode = useActiveMode();
  const activeMode = solarHandoff?.mode ?? liveMode;
  const forecastStation = useForecastStationParams(
    station.lat,
    station.lon,
    targetCoords?.lat,
    targetCoords?.lon,
  );
  const modelNowCast = useNowCastBandPredictions({
    origin: station,
    target: targetCoords,
    weather: modelWeather,
    weatherUpdatedAt: modelWeatherUpdatedAt,
    mode: activeMode,
    deriveEnvelope,
    researchSubjectBinding,
  });

  // Parse target grid
  const handleTargetChange = useCallback((value: string) => {
    setTargetGrid(value);
    const grid = value.toUpperCase().trim();
    if (grid.length >= 4 && /^[A-R]{2}[0-9]{2}/.test(grid)) {
      try {
        const coords = gridToLatLon(grid.slice(0, 6) || grid.slice(0, 4));
        if (coords) {
          setTargetCoords({ lat: coords.lat, lon: coords.lon, grid });
        }
      } catch {
        setTargetCoords(null);
      }
    } else {
      setTargetCoords(null);
    }
  }, []);

  // Calculate forecast
  const forecast = useMemo<HourlyForecast[]>(() => {
    if (
      !station ||
      !targetCoords ||
      currentKp === null ||
      currentFlux === null
    ) {
      return [];
    }
    return getForecastForPath(
      station.lat,
      station.lon,
      targetCoords.lat,
      targetCoords.lon,
      currentKp,
      currentFlux,
      solarHandoff?.at ? new Date(solarHandoff.at) : new Date(),
      forecastStation && solarHandoff ? { ...forecastStation, mode: solarAnalysisMode(solarHandoff.mode) } : forecastStation,
    );
  }, [station, targetCoords, currentKp, currentFlux, forecastStation, solarHandoff]);

  // Best windows
  const bestWindows = useMemo<BestWindow[]>(() => {
    if (forecast.length === 0) return [];
    return getBestWindows(forecast);
  }, [forecast]);

  // Current UTC hour
  const currentHour = (solarHandoff?.at ? new Date(solarHandoff.at) : new Date()).getUTCHours();

  // Best band right now
  const bestBandNow = useMemo(() => {
    if (forecast.length === 0) return null;
    const hourData = forecast[currentHour];
    if (!hourData) return null;
    const open = [...hourData.bands]
      .filter((b) => b.status !== "closed")
      .sort((a, b) => b.snrEstimate - a.snrEstimate);
    return open[0] || null;
  }, [forecast, currentHour]);

  // Storm conditions
  const isStormConditions = currentKp !== null && currentKp >= 5;
  const isSouthwardBz = currentBz !== null && currentBz < -5;

  // Current band status
  const getCurrentBandStatus = (band: string): ForecastStatus => {
    const hourData = forecast[currentHour];
    if (!hourData) return "closed";
    const bd = hourData.bands.find((b) => b.band === band);
    return bd?.status ?? "closed";
  };

  return (
    <div className="min-h-screen">
      <SolarHandoffNotice handoff={solarHandoff} />
      <div className="px-4 pt-4 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-white">Band Planner</h1>
            <p className="text-[11px] text-gray-500 mt-0.5">
              24-hour path projection
            </p>
          </div>
          <DataFreshnessIndicator
            dataUpdatedAt={bandDataUpdatedAt}
            onRefresh={refetchBandData}
            isRefetching={bandIsRefetching}
          />
        </div>

        {/* Current indices */}
        <div className="flex items-center gap-4 text-xs">
          <div className="flex items-center gap-1.5">
            <span className="text-gray-500">SFI</span>
            <InfoTip content={SOLAR_TOOLTIPS.sfi} />
            <span className="font-mono text-plasma-orange">
              {currentFlux ?? "—"}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-gray-500">Kp</span>
            <InfoTip content={SOLAR_TOOLTIPS.kIndex} />
            <span
              className="font-mono"
              style={{
                color:
                  currentKp === null
                    ? "#888"
                    : currentKp >= 5
                      ? "#ff4455"
                      : currentKp >= 4
                        ? "#ffaa00"
                        : "#00ff88",
              }}
            >
              {currentKp ?? "—"}
            </span>
          </div>
          {currentBz !== null && (
            <div className="flex items-center gap-1.5">
              <span className="text-gray-500">Bz</span>
              <InfoTip content={SOLAR_TOOLTIPS.bz} />
              <span
                className="font-mono"
                style={{ color: currentBz >= 0 ? "#44dd66" : "#ff7700" }}
              >
                {currentBz > 0 ? "+" : ""}
                {currentBz.toFixed(1)}
              </span>
            </div>
          )}
        </div>

        {/* Storm warning */}
        {isStormConditions && (
          <div className="p-2.5 bg-alert-red/10 border border-alert-red/30 rounded-lg">
            <div className="text-xs font-semibold text-alert-red">
              Geomagnetic Storm (Kp {currentKp})
            </div>
            <p className="text-[11px] text-gray-400 mt-0.5">
              Expect HF degradation. Consider lower bands and digital modes.
            </p>
          </div>
        )}

        {isSouthwardBz && !isStormConditions && (
          <div className="p-2.5 bg-caution-amber/10 border border-caution-amber/30 rounded-lg">
            <div className="text-xs font-semibold text-caution-amber">
              Southward IMF (Bz {currentBz?.toFixed(1)} nT)
            </div>
            <p className="text-[11px] text-gray-400 mt-0.5">
              Conditions may degrade, so the projection has weaker evidence.
            </p>
          </div>
        )}

        {/* Target input */}
        <div>
          <input
            type="text"
            value={targetGrid}
            onChange={(e) => handleTargetChange(e.target.value)}
            placeholder="Target grid (e.g., JN58, FN31pr)"
            className="w-full px-3 py-2.5 bg-void-black/50 border border-white/10 rounded-lg
                       text-white placeholder-gray-600 focus:outline-none focus:border-plasma-orange/50
                       font-mono text-sm uppercase"
          />
          <div className="mt-1.5 flex items-center gap-3 text-[11px] text-gray-500">
            <span>
              QTH: <span className="text-white font-mono">{station.grid}</span>
            </span>
            {targetCoords && (
              <span>
                Target:{" "}
                <span className="text-signal-green font-mono">
                  {targetCoords.grid}
                </span>
              </span>
            )}
          </div>
        </div>

        {/* Quick grid presets */}
        {!targetCoords && (
          <div className="flex flex-wrap gap-1.5">
            {["JN58", "FN31", "IO91", "PM95", "QF22"].map((grid) => (
              <button
                key={grid}
                onClick={() => handleTargetChange(grid)}
                className="px-2.5 py-1 bg-white/5 border border-white/10 rounded-lg text-xs text-gray-400 font-mono"
              >
                {grid}
              </button>
            ))}
          </div>
        )}

        {!solarHandoff?.at && targetCoords && modelNowCast.visible && (
          <NowCastBandPanel
            state={modelNowCast}
            bands={HF_MODEL_BANDS}
            stationLabel={stationChainName}
            locationLabel={locationName}
            mode={activeMode}
            compact
          />
        )}

        {/* Loading */}
        {targetCoords && isLoading && (
          <div className="flex items-center justify-center py-8">
            <LoadingSpinner size="lg" />
          </div>
        )}

        {/* Forecast content */}
        {targetCoords && !isLoading && forecast.length > 0 && (
          <>
            {/* {solarHandoff?.at ? "Selected planning hour" : "Right Now"} card */}
            <Card>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold text-white">{solarHandoff?.at ? "Selected planning hour" : "Right Now"}</h3>
                <span className="text-[10px] text-gray-500 font-mono">
                  {currentHour.toString().padStart(2, "0")}:00 UTC
                </span>
              </div>
              {bestBandNow ? (
                <div className="flex items-center gap-3">
                  <div
                    className="text-2xl font-mono font-bold"
                    style={{
                      color: getForecastStatusColor(bestBandNow.status),
                    }}
                  >
                    {bestBandNow.band}
                  </div>
                  <div className="flex-1">
                    <span
                      className="text-xs font-medium px-1.5 py-0.5 rounded"
                      style={{
                        backgroundColor: `${getForecastStatusColor(bestBandNow.status)}20`,
                        color: getForecastStatusColor(bestBandNow.status),
                      }}
                    >
                      {getStatusLabel(bestBandNow.status)}
                    </span>
                    <span className="text-[11px] text-gray-500 ml-2">
                      SNR {bestBandNow.snrEstimate} dB
                    </span>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-gray-500">
                  The model does not identify a supported band for this hour.
                </p>
              )}
            </Card>

            {/* Best windows summary */}
            {bestWindows.length > 0 && (
              <div>
                <h3 className="text-xs text-gray-400 uppercase tracking-wider mb-2">
                  Best Windows
                </h3>
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {bestWindows.slice(0, 5).map((w) => {
                    const isActive =
                      currentHour >= w.startHour && currentHour <= w.endHour;
                    return (
                      <div
                        key={w.band}
                        className={`flex-shrink-0 px-3 py-2 rounded-lg border ${
                          isActive
                            ? "bg-signal-green/10 border-signal-green/30"
                            : "bg-white/[0.03] border-white/10"
                        }`}
                      >
                        <div className="font-mono text-xs font-bold text-white">
                          {w.band}
                        </div>
                        <div className="text-[10px] text-gray-400 mt-0.5">
                          {w.startHour.toString().padStart(2, "0")}-
                          {w.endHour.toString().padStart(2, "0")} UTC
                        </div>
                        {isActive && (
                          <div className="text-[10px] text-signal-green font-medium mt-0.5">
                            Active
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Band cards */}
            <div>
              <h3 className="text-xs text-gray-400 uppercase tracking-wider mb-2">
                24-Hour Projection
              </h3>
              <div className="space-y-2">
                {BANDS.map((band) => {
                  const currentStatus = getCurrentBandStatus(band);
                  const isExpanded = expandedBand === band;

                  // Gather hourly data for this band
                  const hourlyData = forecast.map((hour) => {
                    const bd = hour.bands.find((b) => b.band === band);
                    return {
                      hour: hour.hour,
                      time: `${hour.hour.toString().padStart(2, "0")}`,
                      status: bd?.status ?? ("closed" as ForecastStatus),
                      snr: bd?.snrEstimate ?? -30,
                    };
                  });

                  return (
                    <button
                      key={band}
                      onClick={() => setExpandedBand(isExpanded ? null : band)}
                      className="w-full text-left bg-white/[0.03] border border-white/10 rounded-xl p-3"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-sm text-white font-bold">
                          {band}
                        </span>
                        <span
                          className={`text-xs font-medium ${getStatusTextColor(currentStatus)}`}
                        >
                          {getStatusLabel(currentStatus).toUpperCase()}
                        </span>
                      </div>

                      {/* 24-hour gradient bar */}
                      <div className="h-2 rounded-full mt-2 overflow-hidden flex">
                        {hourlyData.map((hour, i) => (
                          <div
                            key={i}
                            className={`flex-1 ${i === currentHour ? "ring-1 ring-white/50" : ""}`}
                            style={{
                              backgroundColor: getForecastStatusColor(
                                hour.status,
                              ),
                            }}
                          />
                        ))}
                      </div>

                      {/* Time labels under gradient */}
                      <div className="flex justify-between mt-1 text-[9px] text-gray-600">
                        <span>00</span>
                        <span>06</span>
                        <span>12</span>
                        <span>18</span>
                        <span>23</span>
                      </div>

                      {/* Expanded detail */}
                      {isExpanded && (
                        <div className="mt-3 grid grid-cols-6 gap-1 text-[10px] text-gray-400">
                          {hourlyData.map((hour, i) => (
                            <div
                              key={i}
                              className={`text-center p-1 rounded ${i === currentHour ? "bg-white/10" : ""}`}
                            >
                              <div className="text-gray-500">{hour.time}</div>
                              <div className={getStatusTextColor(hour.status)}>
                                {hour.snr}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Path info */}
            {targetCoords && (
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="bg-white/[0.03] border border-white/10 rounded-lg p-2">
                  <div className="text-[10px] text-gray-500 mb-0.5">
                    Distance
                  </div>
                  <div className="font-mono text-xs text-white">
                    {Math.round(
                      calculateGreatCircleDistance(
                        station.lat,
                        station.lon,
                        targetCoords.lat,
                        targetCoords.lon,
                      ),
                    ).toLocaleString()}{" "}
                    km
                  </div>
                </div>
                <div className="bg-white/[0.03] border border-white/10 rounded-lg p-2">
                  <div className="text-[10px] text-gray-500 mb-0.5">
                    ap equivalent (estimated)
                  </div>
                  <div className="font-mono text-xs text-white">
                    {currentKp !== null ? kpToAp(currentKp) : "—"}
                  </div>
                </div>
                <div className="bg-white/[0.03] border border-white/10 rounded-lg p-2">
                  <div className="text-[10px] text-gray-500 mb-0.5">Peak</div>
                  <div className="font-mono text-xs text-white">
                    {peakStatus(forecast, currentHour)}
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {/* No target prompt */}
        {!targetCoords && !isLoading && (
          <div className="text-center py-8">
            <p className="text-sm text-gray-500">
              Enter a target grid square above to see the projection.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

/** Helper: get peak band name for current hour */
function peakStatus(forecast: HourlyForecast[], hour: number): string {
  const hourData = forecast[hour];
  if (!hourData) return "—";
  const best = [...hourData.bands]
    .filter((b) => b.status !== "closed")
    .sort((a, b) => b.snrEstimate - a.snrEstimate)[0];
  return best ? best.band : "None";
}
