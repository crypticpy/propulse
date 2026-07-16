import { useState, useMemo, useCallback } from "react";
import { Card, LoadingSpinner, DataFreshnessIndicator } from "@/components/ui";
import { InfoTip } from "@/components/ui/Tooltip";
import { SOLAR_TOOLTIPS, PROPAGATION_TOOLTIPS } from "@/constants/tooltips";
import { useUserStore } from "@/stores/userStore";
import { DEFAULT_FAVORED_BANDS } from "@/types/user";
import type { BandId } from "@/types/user";
import { useKIndex, useSolarFlux, useMagnetometer } from "@/hooks/useSolarData";
import {
  getForecastForPath,
  getBestWindows,
  getForecastStatusColor,
  calculateGreatCircleDistance,
  type HourlyForecast,
  type BestWindow,
} from "@/lib/utils/bands";
import { kpToAp } from "@/lib/utils/solarConversions";
import { gridToLatLon } from "@/lib/utils/grid";
import { useIsMobile } from "@/hooks/useIsMobile";
import { MobileBandPlanner } from "@/components/mobile/MobileBandPlanner";
import { HelpTooltip } from "@/components/help/HelpTooltip";
import { useStationCastContext } from "@/hooks/useStationCastContext";
import { useNowCastBandPredictions } from "@/hooks/useNowCastBandPredictions";
import { BrainCircuit, Loader2, TriangleAlert } from "lucide-react";
import { ResearchAttemptControl } from "@/components/propagation/ResearchAttemptControl";
import { useResearchParticipation } from "@/hooks/useResearchParticipation";

/**
 * Band Planner Page
 *
 * Comprehensive propagation planning tool that shows:
 * - 24-hour band-by-band forecast
 * - Best operating windows
 * - Mode and power recommendations
 * - Storm/confidence indicators
 */
export function BandPlanner() {
  // User station
  const station = useUserStore((s) => s.station);
  const stationCast = useStationCastContext();
  const operatingStation = useMemo(
    () => station && stationCast.location
      ? {
          ...station,
          grid: stationCast.location.grid,
          lat: stationCast.location.lat,
          lon: stationCast.location.lon,
          timezone: stationCast.location.timezone,
        }
      : station,
    [station, stationCast.location],
  );
  const favoredBands = useUserStore(
    (s) => s.preferences.favoredBands ?? DEFAULT_FAVORED_BANDS,
  );
  const toggleFavoredBand = useUserStore((s) => s.toggleFavoredBand);
  const isMobile = useIsMobile();

  // Target location state
  const [targetGrid, setTargetGrid] = useState("");
  const [targetCoords, setTargetCoords] = useState<{
    lat: number;
    lon: number;
    grid: string;
  } | null>(null);

  // Selected band for detailed view
  const [selectedBand, setSelectedBand] = useState<string | null>(null);

  // Favorites-only filter toggle
  const [favoritesOnly, setFavoritesOnly] = useState(false);

  // Fetch solar data
  const {
    data: kIndexData,
    isLoading: kLoading,
    dataUpdatedAt: kUpdatedAt,
    refetch: refetchK,
    isRefetching: kRefetching,
  } = useKIndex();
  const {
    data: fluxData,
    isLoading: fluxLoading,
    dataUpdatedAt: fluxUpdatedAt,
    refetch: refetchFlux,
    isRefetching: fluxRefetching,
  } = useSolarFlux();
  const {
    data: magnetometerData,
    dataUpdatedAt: magUpdatedAt,
    refetch: refetchMag,
    isRefetching: magRefetching,
  } = useMagnetometer();

  // Current conditions
  const currentKp = kIndexData?.[kIndexData.length - 1]?.kp_index ?? null;
  const currentFlux = fluxData?.[fluxData.length - 1]?.flux ?? null;
  const currentBz =
    magnetometerData
      ?.slice()
      .reverse()
      .find((d) => typeof d.bz_gsm === "number" && Number.isFinite(d.bz_gsm))
      ?.bz_gsm ?? null;

  const isLoading = kLoading || fluxLoading;

  const bandDataUpdatedAt =
    Math.max(kUpdatedAt || 0, fluxUpdatedAt || 0, magUpdatedAt || 0) ||
    undefined;
  const bandIsRefetching = kRefetching || fluxRefetching || magRefetching;
  const refetchBandData = () => {
    refetchK();
    refetchFlux();
    refetchMag();
  };
  const modelWeather = useMemo(
    () => ({
      ...(currentKp == null ? {} : { kp: currentKp }),
      ...(currentFlux == null ? {} : { f107: currentFlux }),
      ...(currentBz == null ? {} : { bz_gsm: currentBz }),
    }),
    [currentKp, currentFlux, currentBz],
  );
  const researchParticipation = useResearchParticipation();
  const modelNowCast = useNowCastBandPredictions({
    origin: stationCast.location,
    target: targetCoords,
    weather: modelWeather,
    weatherUpdatedAt: bandDataUpdatedAt,
    deriveEnvelope: stationCast.deriveEnvelope,
    researchSubjectBinding: researchParticipation.state?.subjectBinding,
  });

  // Parse target grid and calculate coordinates
  const handleTargetChange = useCallback((value: string) => {
    setTargetGrid(value);

    // Try to parse as grid square
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
      !operatingStation ||
      !targetCoords ||
      currentKp === null ||
      currentFlux === null
    ) {
      return [];
    }

    return getForecastForPath(
      operatingStation.lat,
      operatingStation.lon,
      targetCoords.lat,
      targetCoords.lon,
      currentKp,
      currentFlux,
      new Date(),
    );
  }, [operatingStation, targetCoords, currentKp, currentFlux]);

  // Calculate best windows
  const bestWindows = useMemo<BestWindow[]>(() => {
    if (forecast.length === 0) {
      return [];
    }
    return getBestWindows(forecast);
  }, [forecast]);

  // Current UTC hour
  const currentHour = new Date().getUTCHours();

  // Best band at the current hour (for "right now" display)
  const bestBandNow = useMemo(() => {
    if (forecast.length === 0) return null;
    const hourData = forecast[currentHour];
    if (!hourData) return null;

    const open = [...hourData.bands]
      .filter((b) => b.status !== "closed")
      .sort((a, b) => b.snrEstimate - a.snrEstimate);

    return open[0] || null;
  }, [forecast, currentHour]);

  // Sort windows: active now first, then upcoming, then passed
  const sortedWindows = useMemo(() => {
    if (bestWindows.length === 0) return [];

    const active: BestWindow[] = [];
    const upcoming: BestWindow[] = [];
    const passed: BestWindow[] = [];

    for (const w of bestWindows) {
      if (currentHour >= w.startHour && currentHour <= w.endHour) {
        active.push(w);
      } else if (w.startHour > currentHour) {
        upcoming.push(w);
      } else {
        passed.push(w);
      }
    }

    // Sort active windows by current-hour SNR for that band
    const hourData = forecast[currentHour];
    if (hourData) {
      active.sort((a, b) => {
        const aSnr =
          hourData.bands.find((bd) => bd.band === a.band)?.snrEstimate ?? -30;
        const bSnr =
          hourData.bands.find((bd) => bd.band === b.band)?.snrEstimate ?? -30;
        return bSnr - aSnr;
      });
    }

    return [...active, ...upcoming, ...passed];
  }, [bestWindows, currentHour, forecast]);

  // Bands to display (filtered by favorites when toggle is active)
  const allBands = [
    "160m",
    "80m",
    "40m",
    "30m",
    "20m",
    "17m",
    "15m",
    "12m",
    "10m",
  ];

  const bands =
    favoritesOnly && favoredBands.primary.length > 0
      ? allBands.filter((b) => favoredBands.primary.includes(b as BandId))
      : allBands;

  // Mobile viewport: render MobileBandPlanner with all hook data
  if (isMobile && !operatingStation) {
    return (
      <div className="p-4">
        <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-5">
          <h2 className="font-orbitron text-lg text-white mb-2">
            Band Planner
          </h2>
          <p className="text-sm text-gray-400">
            Set your callsign and grid square in Settings to enable propagation
            forecasts.
          </p>
        </div>
      </div>
    );
  }
  if (isMobile && operatingStation) {
    return (
      <MobileBandPlanner
        station={operatingStation}
        currentKp={currentKp}
        currentFlux={currentFlux}
        currentBz={currentBz}
        isLoading={isLoading}
        bandDataUpdatedAt={bandDataUpdatedAt}
        bandIsRefetching={bandIsRefetching}
        refetchBandData={refetchBandData}
      />
    );
  }

  // Storm warning
  const isStormConditions = currentKp !== null && currentKp >= 5;
  const isDisturbedConditions = currentKp !== null && currentKp >= 4;
  const isSouthwardBz = currentBz !== null && currentBz < -5;

  // Confidence level based on conditions stability
  const getConfidenceLevel = (): "high" | "medium" | "low" => {
    if (currentKp === null || currentFlux === null) {
      return "low";
    }
    if (isStormConditions || isSouthwardBz) {
      return "low";
    }
    if (isDisturbedConditions || (currentBz !== null && currentBz < 0)) {
      return "medium";
    }
    return "high";
  };

  const confidenceLevel = getConfidenceLevel();

  return (
    <div className="min-h-screen">
      <main className="max-w-7xl mx-auto p-4 md:p-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-white">Band Planner</h1>
              <HelpTooltip
                section="band-planner"
                tooltip="Learn more about Band Planner"
              />
            </div>
            <p className="text-sm text-gray-400 mt-1">
              Plan your operating session with 24-hour propagation forecasts
            </p>
          </div>

          <div className="flex items-center gap-4">
            <DataFreshnessIndicator
              dataUpdatedAt={bandDataUpdatedAt}
              onRefresh={refetchBandData}
              isRefetching={bandIsRefetching}
            />
          </div>

          {/* Current conditions summary */}
          <div className="flex items-center gap-4 text-sm">
            <div className="flex items-center gap-2">
              <span className="text-gray-400">SFI:</span>
              <InfoTip content={SOLAR_TOOLTIPS.sfi} />
              <span className="font-mono text-plasma-orange">
                {currentFlux ?? "—"}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-gray-400">Kp:</span>
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
              <div className="flex items-center gap-2">
                <span className="text-gray-400">Bz:</span>
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
        </div>

        {/* Warning banners */}
        {isStormConditions && (
          <div className="p-3 bg-alert-red/10 border border-alert-red/30 rounded-lg flex items-center gap-3">
            <svg
              className="w-5 h-5 text-alert-red flex-shrink-0"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path
                fillRule="evenodd"
                d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                clipRule="evenodd"
              />
            </svg>
            <div>
              <div className="font-semibold text-alert-red">
                Geomagnetic Storm in Progress
              </div>
              <p className="text-sm text-gray-300">
                K-index is {currentKp ?? "—"}. Expect significant HF propagation
                degradation. Consider lower bands (40m, 80m) and digital modes.
              </p>
            </div>
          </div>
        )}

        {isSouthwardBz && !isStormConditions && (
          <div className="p-3 bg-caution-amber/10 border border-caution-amber/30 rounded-lg flex items-center gap-3">
            <svg
              className="w-5 h-5 text-caution-amber flex-shrink-0"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path
                fillRule="evenodd"
                d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                clipRule="evenodd"
              />
            </svg>
            <div>
              <div className="font-semibold text-caution-amber">
                Southward IMF Detected
              </div>
              <p className="text-sm text-gray-300">
                Bz is {currentBz?.toFixed(1)} nT. Geomagnetic activity may
                increase. Forecasts have reduced confidence.
              </p>
            </div>
          </div>
        )}

        {/* Station check */}
        {!operatingStation && (
          <Card>
            <div className="text-center py-8">
              <svg
                className="w-12 h-12 text-gray-500 mx-auto mb-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                />
              </svg>
              <h3 className="text-lg font-semibold text-white mb-2">
                Set Your Station Location
              </h3>
              <p className="text-gray-400 text-sm max-w-md mx-auto">
                To use the Band Planner, please configure your station location
                in Settings. We need your coordinates to calculate path-specific
                propagation forecasts.
              </p>
            </div>
          </Card>
        )}

        {operatingStation && (
          <>
            {/* Target input */}
            <Card>
              <div className="flex flex-col md:flex-row md:items-end gap-4">
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Target Location
                  </label>
                  <input
                    type="text"
                    value={targetGrid}
                    onChange={(e) => handleTargetChange(e.target.value)}
                    placeholder="Enter grid square (e.g., JN58, FN31pr)"
                    className="w-full px-4 py-3 bg-void-black/50 border border-white/10 rounded-lg
                             text-white placeholder-gray-500 focus:outline-none focus:border-plasma-orange/50
                             font-mono text-lg uppercase"
                  />
                  <div className="mt-2 flex items-center gap-4 text-xs text-gray-400">
                    <span>
                      Your QTH:{" "}
                      <span className="text-white font-mono">
                        {operatingStation.grid}
                      </span>
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

                {/* Confidence indicator */}
                <div className="text-right">
                  <div className="text-xs text-gray-400 mb-1 flex items-center justify-end gap-1">
                    Forecast Confidence
                    <InfoTip
                      content={PROPAGATION_TOOLTIPS.forecastConfidence}
                    />
                  </div>
                  <div
                    className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg font-medium text-sm"
                    style={{
                      backgroundColor:
                        confidenceLevel === "high"
                          ? "#00ff8820"
                          : confidenceLevel === "medium"
                            ? "#ffaa0020"
                            : "#ff445520",
                      color:
                        confidenceLevel === "high"
                          ? "#00ff88"
                          : confidenceLevel === "medium"
                            ? "#ffaa00"
                            : "#ff4455",
                    }}
                  >
                    {confidenceLevel === "high" && (
                      <>
                        <svg
                          className="w-4 h-4"
                          fill="currentColor"
                          viewBox="0 0 20 20"
                        >
                          <path
                            fillRule="evenodd"
                            d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                            clipRule="evenodd"
                          />
                        </svg>
                        High
                      </>
                    )}
                    {confidenceLevel === "medium" && (
                      <>
                        <svg
                          className="w-4 h-4"
                          fill="currentColor"
                          viewBox="0 0 20 20"
                        >
                          <path
                            fillRule="evenodd"
                            d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                            clipRule="evenodd"
                          />
                        </svg>
                        Medium
                      </>
                    )}
                    {confidenceLevel === "low" && (
                      <>
                        <svg
                          className="w-4 h-4"
                          fill="currentColor"
                          viewBox="0 0 20 20"
                        >
                          <path
                            fillRule="evenodd"
                            d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                            clipRule="evenodd"
                          />
                        </svg>
                        Low
                      </>
                    )}
                  </div>
                </div>
              </div>
            </Card>

            {targetCoords && modelNowCast.visible && (
              <Card>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <BrainCircuit className="h-5 w-5 text-cyan-300" aria-hidden="true" />
                    <div>
                      <h3 className="text-base font-semibold text-white">Model nowcast</h3>
                      <p className="text-xs text-gray-400">
                        {modelNowCast.personalized
                          ? "Single-decode WSPR probability from your active station chain"
                          : "Single-decode WSPR probability from the core model"}
                      </p>
                    </div>
                  </div>
                  {modelNowCast.pending && (
                    <Loader2 className="h-4 w-4 animate-spin text-gray-400" aria-label="Loading model predictions" />
                  )}
                </div>

                {modelNowCast.predictions.size > 0 && (
                  <div className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-md border border-white/10 bg-white/10 sm:grid-cols-3 lg:grid-cols-5">
                    {allBands.map((band) => {
                      const prediction = modelNowCast.predictions.get(band);
                      if (!prediction) return null;
                      const probability = prediction.personalized_probability;
                      const color =
                        probability >= 0.5
                          ? "text-signal-green"
                          : probability >= 0.2
                            ? "text-caution-amber"
                            : "text-gray-300";
                      return (
                        <div
                          key={band}
                          className="bg-void-black/80 px-3 py-2.5"
                          style={{ minHeight: 80 }}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-mono text-sm text-white">{band}</span>
                            <span className={`font-mono text-sm font-semibold ${color}`}>
                              {(probability * 100).toFixed(1)}%
                            </span>
                          </div>
                          <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-gray-500">
                            <span>{prediction.profile === "physics" ? "Physics fallback" : "Nowcast"}</span>
                            <span>{Math.round(prediction.confidence * 100)}% conf.</span>
                          </div>
                          <ResearchAttemptControl prediction={prediction} />
                        </div>
                      );
                    })}
                  </div>
                )}

                {modelNowCast.errors.size > 0 && modelNowCast.predictions.size === 0 && (
                  <div className="mt-4 flex items-center gap-2 border-t border-white/10 pt-3 text-sm text-caution-amber">
                    <TriangleAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
                    <span>Model service unavailable. The established planner remains active.</span>
                  </div>
                )}

                {modelNowCast.partial && (
                  <div className="mt-4 flex items-center gap-2 border-t border-white/10 pt-3 text-sm text-caution-amber">
                    <TriangleAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
                    <span>
                      {modelNowCast.predictions.size}/{modelNowCast.requestedCount} bands scored.
                      {" "}The established planner remains active for the unavailable bands.
                    </span>
                  </div>
                )}

                {modelNowCast.predictions.size > 0 && (
                  <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-gray-500">
                    <span>{[...modelNowCast.predictions.values()][0]?.model_version}</span>
                    <span>Issued {[...modelNowCast.predictions.values()][0]?.issue_time.slice(11, 16)} UTC</span>
                    {modelNowCast.staleInputBands.length > 0 && (
                      <span>
                        Recent path data stale on {modelNowCast.staleInputBands.length} band
                        {modelNowCast.staleInputBands.length === 1 ? "" : "s"}; physics fallback shown
                      </span>
                    )}
                    {modelNowCast.fallbackBands.length > modelNowCast.staleInputBands.length && (
                      <span>
                        Physics fallback active on {modelNowCast.fallbackBands.length} band
                        {modelNowCast.fallbackBands.length === 1 ? "" : "s"}
                      </span>
                    )}
                    {modelNowCast.nowcastBands.length > 0 && (
                      <span>
                        Verified recent path data active on {modelNowCast.nowcastBands.length} band
                        {modelNowCast.nowcastBands.length === 1 ? "" : "s"}
                      </span>
                    )}
                  </div>
                )}
              </Card>
            )}

            {/* No target selected */}
            {!targetCoords && (
              <Card>
                <div className="text-center py-12">
                  <svg
                    className="w-16 h-16 text-gray-600 mx-auto mb-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1}
                      d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                    />
                  </svg>
                  <h3 className="text-lg font-semibold text-white mb-2">
                    Enter a Target Location
                  </h3>
                  <p className="text-gray-400 text-sm max-w-md mx-auto">
                    Enter a grid square (like JN58 for central Europe or VK3 for
                    Melbourne) to see the 24-hour propagation forecast for that
                    path.
                  </p>
                  <div className="mt-6 flex flex-wrap justify-center gap-2">
                    {["JN58", "FN31", "IO91", "PM95", "QF22"].map((grid) => (
                      <button
                        key={grid}
                        onClick={() => handleTargetChange(grid)}
                        className="px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10
                                 rounded-lg text-sm text-gray-300 font-mono transition-colors"
                      >
                        {grid}
                      </button>
                    ))}
                  </div>
                </div>
              </Card>
            )}

            {/* Forecast display */}
            {targetCoords && isLoading && (
              <div className="flex items-center justify-center py-12">
                <LoadingSpinner size="lg" />
              </div>
            )}

            {targetCoords && !isLoading && forecast.length > 0 && (
              <>
                {/* Right Now */}
                <Card>
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold text-white">
                      Right Now
                    </h3>
                    <span className="text-xs text-gray-400 font-mono">
                      {currentHour.toString().padStart(2, "0")}:00 UTC
                    </span>
                  </div>
                  {bestBandNow ? (
                    <div className="mt-3 flex items-center gap-4">
                      <div
                        className="text-3xl font-mono font-bold"
                        style={{
                          color: getForecastStatusColor(bestBandNow.status),
                        }}
                      >
                        {bestBandNow.band}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span
                            className="text-sm font-medium px-2 py-0.5 rounded"
                            style={{
                              backgroundColor: `${getForecastStatusColor(bestBandNow.status)}20`,
                              color: getForecastStatusColor(bestBandNow.status),
                            }}
                          >
                            {bestBandNow.status}
                          </span>
                          <span className="text-sm text-gray-400 font-mono">
                            {bestBandNow.snrLow !== undefined &&
                            bestBandNow.snrHigh !== undefined
                              ? `SNR ${bestBandNow.snrLow} to ${bestBandNow.snrHigh} dB`
                              : `SNR ${bestBandNow.snrEstimate} dB`}
                          </span>
                          {bestBandNow.confidenceLow !== undefined &&
                            bestBandNow.confidenceHigh !== undefined && (
                              <span
                                className="text-xs px-1.5 py-0.5 rounded font-mono"
                                style={{
                                  backgroundColor:
                                    bestBandNow.confidence !== undefined &&
                                    bestBandNow.confidence >= 70
                                      ? "#00ff8820"
                                      : bestBandNow.confidence !== undefined &&
                                          bestBandNow.confidence >= 45
                                        ? "#ffaa0020"
                                        : "#ff445520",
                                  color:
                                    bestBandNow.confidence !== undefined &&
                                    bestBandNow.confidence >= 70
                                      ? "#00ff88"
                                      : bestBandNow.confidence !== undefined &&
                                          bestBandNow.confidence >= 45
                                        ? "#ffaa00"
                                        : "#ff4455",
                                }}
                                title={`Confidence range: ${bestBandNow.confidenceLow}%-${bestBandNow.confidenceHigh}%`}
                              >
                                {bestBandNow.confidenceLow}-
                                {bestBandNow.confidenceHigh}%
                              </span>
                            )}
                        </div>
                        <p className="text-xs text-gray-400 mt-1">
                          {bestBandNow.status === "excellent" ||
                          bestBandNow.status === "good"
                            ? "Good conditions — SSB, CW, and digital modes viable"
                            : bestBandNow.status === "fair"
                              ? "Marginal conditions — digital modes recommended"
                              : "Poor conditions — consider waiting for a better window"}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-3 text-gray-400">
                      No bands currently open on this path. Check the forecast
                      below for upcoming windows.
                    </div>
                  )}
                </Card>

                {/* Best Windows */}
                <Card>
                  <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                    Best Operating Windows
                    <InfoTip content={PROPAGATION_TOOLTIPS.bandCondition} />
                  </h3>
                  {bestWindows.length === 0 ? (
                    <div className="text-center py-6 text-gray-400">
                      No favorable windows found for this path in the next 24
                      hours. Try a different target or wait for conditions to
                      improve.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {sortedWindows.slice(0, 6).map((window) => {
                        const isActive =
                          currentHour >= window.startHour &&
                          currentHour <= window.endHour;
                        const isPassed = window.endHour < currentHour;

                        return (
                          <div
                            key={window.band}
                            role="button"
                            tabIndex={0}
                            aria-label={`Select ${window.band} band`}
                            className={`p-4 rounded-lg border transition-colors cursor-pointer ${
                              isPassed ? "opacity-50 " : ""
                            }${
                              selectedBand === window.band
                                ? "bg-plasma-orange/10 border-plasma-orange/40"
                                : "bg-white/5 border-white/10 hover:border-white/20"
                            }`}
                            onClick={() =>
                              setSelectedBand(
                                selectedBand === window.band
                                  ? null
                                  : window.band,
                              )
                            }
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                setSelectedBand(
                                  selectedBand === window.band
                                    ? null
                                    : window.band,
                                );
                              }
                            }}
                          >
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-xl font-mono font-bold text-white">
                                {window.band}
                              </span>
                              <span
                                className="text-xs px-2 py-0.5 rounded"
                                style={{
                                  backgroundColor: `${getForecastStatusColor(window.peakStatus)}20`,
                                  color: getForecastStatusColor(
                                    window.peakStatus,
                                  ),
                                }}
                              >
                                {window.peakStatus}
                              </span>
                            </div>
                            <div className="text-sm text-gray-300">
                              {window.startHour.toString().padStart(2, "0")}
                              :00 - {window.endHour.toString().padStart(2, "0")}
                              :00 UTC
                            </div>
                            <div className="text-xs text-gray-400 mt-1">
                              Peak at{" "}
                              {window.peakHour.toString().padStart(2, "0")}:00 •
                              SNR {window.peakSnr} dB
                            </div>
                            {/* Confidence interval for selected band */}
                            {selectedBand === window.band &&
                              (() => {
                                const peakBand = forecast[
                                  window.peakHour
                                ]?.bands.find((b) => b.band === window.band);
                                if (
                                  peakBand?.confidenceLow !== undefined &&
                                  peakBand?.confidenceHigh !== undefined
                                ) {
                                  const conf = peakBand.confidence ?? 50;
                                  return (
                                    <div className="mt-1.5 flex items-center gap-2">
                                      <span
                                        className="text-[10px] font-mono px-1.5 py-0.5 rounded"
                                        style={{
                                          backgroundColor:
                                            conf >= 70
                                              ? "#00ff8820"
                                              : conf >= 45
                                                ? "#ffaa0020"
                                                : "#ff445520",
                                          color:
                                            conf >= 70
                                              ? "#00ff88"
                                              : conf >= 45
                                                ? "#ffaa00"
                                                : "#ff4455",
                                        }}
                                      >
                                        Confidence {peakBand.confidenceLow}-
                                        {peakBand.confidenceHigh}%
                                      </span>
                                      {peakBand.snrLow !== undefined &&
                                        peakBand.snrHigh !== undefined && (
                                          <span className="text-[10px] text-gray-400 font-mono">
                                            SNR {peakBand.snrLow} to{" "}
                                            {peakBand.snrHigh} dB
                                          </span>
                                        )}
                                    </div>
                                  );
                                }
                                return null;
                              })()}
                            {isActive && (
                              <div className="mt-2 text-xs text-signal-green font-medium">
                                Active now
                              </div>
                            )}
                            {!isActive && !isPassed && (
                              <div className="mt-2 text-xs text-gray-400">
                                Opens at{" "}
                                {window.startHour.toString().padStart(2, "0")}
                                :00 UTC
                              </div>
                            )}
                            {isPassed && (
                              <div className="mt-2 text-xs text-gray-500">
                                Passed
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </Card>

                {/* 24-Hour Heat Map */}
                <Card>
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                        24-Hour Forecast
                        <InfoTip content={PROPAGATION_TOOLTIPS.bandCondition} />
                      </h3>
                      <button
                        type="button"
                        onClick={() => setFavoritesOnly((v) => !v)}
                        className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                          favoritesOnly
                            ? "bg-plasma-orange/20 border-plasma-orange/50 text-plasma-orange"
                            : "bg-white/5 border-white/10 text-gray-400 hover:text-white hover:border-white/20"
                        }`}
                        title={
                          favoritesOnly
                            ? "Showing favorite bands only"
                            : "Show favorite bands only"
                        }
                      >
                        <svg
                          className="w-3 h-3 inline mr-1 -mt-0.5"
                          fill="currentColor"
                          viewBox="0 0 20 20"
                        >
                          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                        </svg>
                        Favorites
                      </button>
                    </div>
                    <div className="flex items-center gap-4 text-xs">
                      <div className="flex items-center gap-1">
                        <span
                          className="w-3 h-3 rounded"
                          style={{ backgroundColor: "#00ff88" }}
                        />
                        <span className="text-gray-400">Excellent</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <span
                          className="w-3 h-3 rounded"
                          style={{ backgroundColor: "#44dd66" }}
                        />
                        <span className="text-gray-400">Good</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <span
                          className="w-3 h-3 rounded"
                          style={{ backgroundColor: "#ffaa00" }}
                        />
                        <span className="text-gray-400">Fair</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <span
                          className="w-3 h-3 rounded"
                          style={{ backgroundColor: "#ff4455" }}
                        />
                        <span className="text-gray-400">Poor</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <span
                          className="w-3 h-3 rounded"
                          style={{ backgroundColor: "#374151" }}
                        />
                        <span className="text-gray-400">Closed</span>
                      </div>
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr>
                          <th className="text-left py-2 pr-4 text-gray-400 font-medium sticky left-0 bg-deep-space/95 z-10">
                            Band
                          </th>
                          {Array.from({ length: 24 }, (_, i) => (
                            <th
                              key={i}
                              className={`px-1 py-2 text-center font-mono ${
                                i === currentHour
                                  ? "text-plasma-orange font-bold"
                                  : "text-gray-400 font-normal"
                              }`}
                            >
                              {i.toString().padStart(2, "0")}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {bands.map((band) => {
                          return (
                            <tr
                              key={band}
                              tabIndex={0}
                              aria-selected={selectedBand === band}
                              style={{ cursor: "pointer" }}
                              className={`border-t border-white/5 ${
                                selectedBand === band ? "bg-white/5" : ""
                              }`}
                              onClick={() =>
                                setSelectedBand(
                                  selectedBand === band ? null : band,
                                )
                              }
                              onKeyDown={(e) => {
                                if (e.key === "Enter" || e.key === " ") {
                                  e.preventDefault();
                                  setSelectedBand(
                                    selectedBand === band ? null : band,
                                  );
                                }
                              }}
                            >
                              <td
                                className={`py-2 pr-4 font-mono font-semibold sticky left-0 bg-deep-space/95 z-10 cursor-pointer ${
                                  bestBandNow && band === bestBandNow.band
                                    ? "text-plasma-orange"
                                    : "text-white"
                                }`}
                              >
                                <span className="inline-flex items-center gap-1.5">
                                  <button
                                    type="button"
                                    title={
                                      favoredBands.primary.includes(
                                        band as BandId,
                                      )
                                        ? `Remove ${band} from favorites`
                                        : `Add ${band} to favorites`
                                    }
                                    className="text-gray-500 hover:text-plasma-orange transition-colors"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      toggleFavoredBand(band as BandId);
                                    }}
                                  >
                                    <svg
                                      className="w-3.5 h-3.5"
                                      fill={
                                        favoredBands.primary.includes(
                                          band as BandId,
                                        )
                                          ? "currentColor"
                                          : "none"
                                      }
                                      stroke="currentColor"
                                      strokeWidth={1.5}
                                      viewBox="0 0 20 20"
                                    >
                                      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                                    </svg>
                                  </button>
                                  {band}
                                </span>
                              </td>
                              {forecast.map((hour) => {
                                const bandData = hour.bands.find(
                                  (b) => b.band === band,
                                );
                                const color = bandData
                                  ? getForecastStatusColor(bandData.status)
                                  : "#374151";
                                const isCurrentHour = hour.hour === currentHour;
                                return (
                                  <td key={hour.hour} className="px-0.5 py-2">
                                    <div
                                      className={`w-full h-6 rounded transition-all ${
                                        isCurrentHour
                                          ? "ring-2 ring-plasma-orange ring-offset-1 ring-offset-deep-space"
                                          : ""
                                      }`}
                                      style={{ backgroundColor: color }}
                                      title={`${hour.hour}:00 UTC - ${band}: ${bandData?.status || "unknown"} (SNR: ${bandData?.snrEstimate || "N/A"} dB)`}
                                    />
                                  </td>
                                );
                              })}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Time labels */}
                  <div className="mt-2 flex items-center justify-between text-xs text-gray-400">
                    <span>00:00 UTC</span>
                    <span className="text-plasma-orange font-medium">
                      Now: {currentHour.toString().padStart(2, "0")}:00 UTC
                    </span>
                    <span>23:00 UTC</span>
                  </div>
                </Card>

                {/* Operating Recommendations */}
                <Card>
                  <h3 className="text-lg font-semibold text-white mb-4">
                    Operating Recommendations
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Mode recommendations */}
                    <div>
                      <h4 className="text-sm font-mono uppercase tracking-wider text-gray-400 mb-3">
                        Suggested Modes
                      </h4>
                      <div className="space-y-2">
                        {bestBandNow &&
                          (bestBandNow.status === "excellent" ||
                            bestBandNow.status === "good") && (
                            <div className="flex items-center gap-2">
                              <span className="w-2 h-2 rounded-full bg-signal-green" />
                              <span className="text-gray-300">
                                SSB/CW — strong signals on {bestBandNow.band}
                              </span>
                            </div>
                          )}
                        {bestBandNow && bestBandNow.status === "fair" && (
                          <div className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-caution-amber" />
                            <span className="text-gray-300">
                              FT8/FT4 recommended — marginal on{" "}
                              {bestBandNow.band}
                            </span>
                          </div>
                        )}
                        {(!bestBandNow || bestBandNow.status === "poor") && (
                          <div className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-alert-red" />
                            <span className="text-gray-300">
                              {bestBandNow
                                ? "Digital modes only — poor conditions"
                                : "No bands open — wait for better conditions"}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Power recommendations */}
                    <div>
                      <h4 className="text-sm font-mono uppercase tracking-wider text-gray-400 mb-3">
                        Power Guidance
                      </h4>
                      <div className="space-y-2 text-gray-300">
                        {bestBandNow && bestBandNow.snrEstimate >= -10 && (
                          <p>
                            50-100W should be sufficient for contacts on{" "}
                            {bestBandNow.band}
                          </p>
                        )}
                        {bestBandNow &&
                          bestBandNow.snrEstimate < -10 &&
                          bestBandNow.snrEstimate >= -18 && (
                            <p>
                              100W recommended, higher power may help on
                              marginal paths
                            </p>
                          )}
                        {bestBandNow && bestBandNow.snrEstimate < -18 && (
                          <p>
                            Maximum legal power recommended — weak signal
                            conditions
                          </p>
                        )}
                        {!bestBandNow && (
                          <p className="text-gray-400">
                            No bands open — save power for better openings
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                </Card>

                {/* Path Details */}
                <Card>
                  <h3 className="text-lg font-semibold text-white mb-4">
                    Path Information
                  </h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                    <div>
                      <div className="text-xs text-gray-400 mb-1">From</div>
                      <div className="font-mono text-white">{operatingStation.grid}</div>
                      <div className="text-xs text-gray-500">
                        {operatingStation.lat.toFixed(2)}°, {operatingStation.lon.toFixed(2)}°
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-400 mb-1">To</div>
                      <div className="font-mono text-signal-green">
                        {targetCoords.grid}
                      </div>
                      <div className="text-xs text-gray-500">
                        {targetCoords.lat.toFixed(2)}°,{" "}
                        {targetCoords.lon.toFixed(2)}°
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-400 mb-1">Distance</div>
                      <div className="font-mono text-white">
                        {Math.round(
                          calculateGreatCircleDistance(
                            operatingStation.lat,
                            operatingStation.lon,
                            targetCoords.lat,
                            targetCoords.lon,
                          ),
                        ).toLocaleString()}{" "}
                        km
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-400 mb-1">A-Index</div>
                      <div className="font-mono text-white">
                        {currentKp !== null ? kpToAp(currentKp) : "—"}
                      </div>
                    </div>
                  </div>
                </Card>
              </>
            )}
          </>
        )}
      </main>

      {/* Footer */}
      <footer className="max-w-7xl mx-auto px-4 md:px-6 py-8 text-center text-xs text-gray-500">
        <p>
          Forecasts based on current solar indices and simplified ionospheric
          model. Actual conditions may vary.
        </p>
        <p className="mt-1">Propulse Band Planner — Plan your DX</p>
      </footer>
    </div>
  );
}

export default BandPlanner;
