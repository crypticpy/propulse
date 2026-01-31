/**
 * PathAnalysis Component
 *
 * Displays path metrics between home station and target location.
 * Shows distance, bearing, hop count, difficulty rating, and band-by-band
 * propagation conditions with SNR estimates based on current solar data.
 * Enhanced with MUF/LUF/FOT/HPF frequency limits and S-meter readings.
 */

import { useMemo, useState, useCallback } from "react";
import { useMapStore } from "@/stores/mapStore";
import { useUserStore } from "@/stores/userStore";
import {
  getPathMetrics,
  formatBearing,
  formatDistance,
  getPathIllumination,
} from "@/lib/utils/path";
import {
  getBandConditionsForPath,
  getEnhancedBandConditions,
  getPathStatusColor,
  getPathStatusBgColor,
  type PathBandCondition,
} from "@/lib/utils/bands";
import { getFrequencyLimits } from "@/lib/api/muf";
import { useKIndex, useSolarFlux } from "@/hooks/useSolarData";
import { Card } from "@/components/ui/Card";
import type { FrequencyLimits } from "@/types/propagation";
import type { SUnit } from "@/types/signal";
import { RecommendationsPanel } from "./RecommendationsPanel";

interface PathAnalysisProps {
  /** Current display time for illumination calculation */
  displayTime: Date;
  className?: string;
}

const DIFFICULTY_LABELS = [
  "",
  "Easy",
  "Moderate",
  "Challenging",
  "Difficult",
  "Extreme",
];
const DIFFICULTY_COLORS = [
  "",
  "text-signal-green",
  "text-good",
  "text-caution-amber",
  "text-plasma-orange",
  "text-alert-red",
];

export function PathAnalysis({
  displayTime,
  className = "",
}: PathAnalysisProps) {
  const { target } = useMapStore();
  const { station, preferences, savedTargets, addTarget } = useUserStore();
  const useImperial = preferences.units === "imperial";

  // Save target modal state
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [targetName, setTargetName] = useState("");

  // Band conditions expansion state
  const [bandConditionsExpanded, setBandConditionsExpanded] = useState(false);

  // Fetch current solar data
  const { data: kIndexData } = useKIndex();
  const { data: solarFluxData } = useSolarFlux();

  // Get current Kp and SFI values
  const currentKp = useMemo(() => {
    if (!kIndexData || kIndexData.length === 0) return 3; // Default fallback
    return kIndexData[kIndexData.length - 1].kp_index;
  }, [kIndexData]);

  const currentSfi = useMemo(() => {
    if (!solarFluxData || solarFluxData.length === 0) return 100; // Default fallback
    return solarFluxData[solarFluxData.length - 1].flux;
  }, [solarFluxData]);

  // Check if current target is already saved
  const isTargetSaved = useMemo(() => {
    if (!target) return false;
    return savedTargets.some(
      (t) => t.lat === target.lat && t.lon === target.lon,
    );
  }, [target, savedTargets]);

  // Handle save target
  const handleSaveTarget = useCallback(() => {
    if (!target || !targetName.trim()) return;
    addTarget({
      name: targetName.trim(),
      lat: target.lat,
      lon: target.lon,
      grid: target.grid,
    });
    setTargetName("");
    setShowSaveModal(false);
  }, [target, targetName, addTarget]);

  // Open save modal with default name
  const openSaveModal = useCallback(() => {
    if (!target) return;
    setTargetName(target.name || target.grid || "");
    setShowSaveModal(true);
  }, [target]);

  // Calculate path metrics
  const metrics = useMemo(() => {
    if (!station || !target) return null;
    return getPathMetrics(station.lat, station.lon, target.lat, target.lon);
  }, [station, target]);

  // Calculate path illumination
  const illumination = useMemo(() => {
    if (!station || !target) return 0;
    return getPathIllumination(
      station.lat,
      station.lon,
      target.lat,
      target.lon,
      displayTime,
    );
  }, [station, target, displayTime]);

  // Calculate band conditions for this path (basic version for fallback)
  const basicBandConditions = useMemo(() => {
    if (!station || !target) return [];
    return getBandConditionsForPath(
      station.lat,
      station.lon,
      target.lat,
      target.lon,
      currentKp,
      currentSfi,
      illumination,
    );
  }, [station, target, currentKp, currentSfi, illumination]);

  // Calculate enhanced band conditions with S-unit readings and path loss
  const enhancedBandConditions = useMemo(() => {
    if (!station || !target) return null;
    try {
      return getEnhancedBandConditions(
        station.lat,
        station.lon,
        target.lat,
        target.lon,
        currentKp,
        currentSfi,
        displayTime,
        100, // Default 100W TX power
        "FT8", // Default to FT8 mode
      );
    } catch {
      // Fall back to basic conditions if enhanced calculation fails
      return null;
    }
  }, [station, target, currentKp, currentSfi, displayTime]);

  // Use enhanced conditions if available, otherwise fall back to basic
  const bandConditions = enhancedBandConditions || basicBandConditions;

  // Calculate frequency limits (MUF, FOT, LUF, HPF) at path midpoint
  const frequencyLimits = useMemo((): FrequencyLimits | null => {
    if (!station || !target || !metrics) return null;
    try {
      return getFrequencyLimits(
        metrics.midpoint.lat,
        metrics.midpoint.lon,
        currentSfi,
        displayTime,
        100, // Default 100W TX power
        "SSB", // Default to SSB for frequency limit calculations
      );
    } catch {
      return null;
    }
  }, [station, target, metrics, currentSfi, displayTime]);

  // No station configured
  if (!station) {
    return (
      <Card className={className}>
        <div className="text-center py-8 text-gray-500">
          <p className="text-sm">
            Set your QTH in settings to see path analysis
          </p>
        </div>
      </Card>
    );
  }

  // No target selected
  if (!target) {
    return (
      <Card className={className}>
        <div className="text-center py-8 text-gray-500">
          <p className="text-sm">
            Click on the map to select a target location
          </p>
        </div>
      </Card>
    );
  }

  if (!metrics) return null;

  return (
    <Card className={className}>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 pb-3">
          <div>
            <h3 className="text-lg font-semibold text-white">Path Analysis</h3>
            <p className="text-xs text-gray-500">
              {station.callsign} → {target.name || target.grid || "Target"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div
              className={`px-3 py-1 rounded-full text-xs font-medium
                ${DIFFICULTY_COLORS[metrics.difficulty]} bg-white/5`}
            >
              {DIFFICULTY_LABELS[metrics.difficulty]}
            </div>
            {!isTargetSaved && (
              <button
                onClick={openSaveModal}
                className="px-3 py-1 bg-plasma-orange/20 border border-plasma-orange/50 rounded-full
                           text-plasma-orange text-xs font-medium hover:bg-plasma-orange/30
                           transition-colors"
                title="Save this target"
              >
                Save
              </button>
            )}
          </div>
        </div>

        {/* Short Path */}
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-gray-400">Short Path</h4>
          <div className="grid grid-cols-3 gap-3">
            <MetricItem
              label="Distance"
              value={formatDistance(metrics.shortPath.distance, useImperial)}
            />
            <MetricItem
              label="Bearing"
              value={`${Math.round(metrics.shortPath.bearing)}°`}
              subValue={formatBearing(metrics.shortPath.bearing)}
            />
            <MetricItem
              label="Return"
              value={`${Math.round(metrics.shortPath.reciprocal)}°`}
              subValue={formatBearing(metrics.shortPath.reciprocal)}
            />
          </div>
        </div>

        {/* Long Path */}
        <div className="space-y-2 pt-2 border-t border-white/5">
          <h4 className="text-sm font-medium text-gray-400">Long Path</h4>
          <div className="grid grid-cols-3 gap-3">
            <MetricItem
              label="Distance"
              value={formatDistance(metrics.longPath.distance, useImperial)}
            />
            <MetricItem
              label="Bearing"
              value={`${Math.round(metrics.longPath.bearing)}°`}
              subValue={formatBearing(metrics.longPath.bearing)}
            />
            <MetricItem
              label="Return"
              value={`${Math.round(metrics.longPath.reciprocal)}°`}
              subValue={formatBearing(metrics.longPath.reciprocal)}
            />
          </div>
        </div>

        {/* Propagation Info */}
        <div className="space-y-2 pt-2 border-t border-white/5">
          <h4 className="text-sm font-medium text-gray-400">Propagation</h4>
          <div className="grid grid-cols-3 gap-3">
            <MetricItem
              label="Est. Hops"
              value={`${metrics.hops}`}
              subValue="F-layer"
            />
            <MetricItem
              label="Path Light"
              value={`${Math.round(illumination)}%`}
              subValue={illumination > 50 ? "Day path" : "Night path"}
            />
            <MetricItem
              label="Midpoint"
              value={`${metrics.midpoint.lat.toFixed(1)}°`}
              subValue={`${metrics.midpoint.lon.toFixed(1)}°`}
            />
          </div>
        </div>

        {/* Frequency Limits Section */}
        <FrequencyLimitsDisplay limits={frequencyLimits} />

        {/* Band Conditions - Collapsible Section */}
        <div className="pt-2 border-t border-white/5">
          <button
            onClick={() => setBandConditionsExpanded(!bandConditionsExpanded)}
            className="w-full flex items-center justify-between py-2 text-sm font-medium text-gray-400 hover:text-white transition-colors"
          >
            <span className="flex items-center gap-2">
              Band Conditions
              <span className="text-xs text-gray-600">
                (Kp={currentKp}, SFI={currentSfi})
              </span>
            </span>
            <svg
              className={`w-4 h-4 transition-transform ${bandConditionsExpanded ? "rotate-180" : ""}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 9l-7 7-7-7"
              />
            </svg>
          </button>

          {bandConditionsExpanded && (
            <div className="mt-2 overflow-hidden rounded-lg border border-white/5">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-white/5 text-gray-400">
                    <th className="px-2 py-1.5 text-left font-medium">Band</th>
                    <th className="px-2 py-1.5 text-center font-medium">
                      Status
                    </th>
                    <th className="px-2 py-1.5 text-center font-medium">
                      S-Unit
                    </th>
                    <th className="px-2 py-1.5 text-center font-medium">SNR</th>
                    <th className="px-2 py-1.5 text-left font-medium">Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {bandConditions.map((condition) => (
                    <BandConditionRow
                      key={condition.band}
                      condition={condition}
                      hasEnhancedData={!!enhancedBandConditions}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Intelligent Recommendations */}
        {station && target && (
          <div className="pt-3 border-t border-white/5">
            <RecommendationsPanel
              homeLat={station.lat}
              homeLon={station.lon}
              targetLat={target.lat}
              targetLon={target.lon}
              displayTime={displayTime}
            />
          </div>
        )}

        {/* Target coordinates */}
        <div className="pt-2 border-t border-white/5 text-xs text-gray-500 font-mono">
          Target: {target.lat.toFixed(4)}°, {target.lon.toFixed(4)}°
          {target.grid && <span className="ml-2">({target.grid})</span>}
        </div>

        {/* Save Target Modal */}
        {showSaveModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setShowSaveModal(false)}
            />
            <Card className="relative z-10 w-full max-w-sm p-5" animate>
              <h3 className="text-lg font-semibold text-white mb-4">
                Save Target
              </h3>
              <div className="space-y-4">
                <div>
                  <label
                    htmlFor="target-name"
                    className="block text-sm font-medium text-gray-300 mb-1"
                  >
                    Target Name
                  </label>
                  <input
                    type="text"
                    id="target-name"
                    value={targetName}
                    onChange={(e) => setTargetName(e.target.value)}
                    placeholder="e.g., DX Station, Contest Target"
                    className="w-full px-3 py-2 bg-deep-space border border-white/10 rounded-lg
                               text-white placeholder-gray-500
                               focus:outline-none focus:border-plasma-orange/50"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && targetName.trim()) {
                        handleSaveTarget();
                      } else if (e.key === "Escape") {
                        setShowSaveModal(false);
                      }
                    }}
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    {target.grid} ({target.lat.toFixed(2)}°,{" "}
                    {target.lon.toFixed(2)}°)
                  </p>
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={() => setShowSaveModal(false)}
                    className="flex-1 px-4 py-2 bg-nebula-blue border border-white/10 rounded-lg
                               text-gray-300 hover:text-white hover:border-white/20
                               transition-colors font-medium text-sm"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSaveTarget}
                    disabled={!targetName.trim()}
                    className="flex-1 px-4 py-2 bg-plasma-orange/20 border border-plasma-orange/50 rounded-lg
                               text-plasma-orange hover:bg-plasma-orange/30
                               transition-colors font-medium text-sm
                               disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Save
                  </button>
                </div>
              </div>
            </Card>
          </div>
        )}
      </div>
    </Card>
  );
}

/**
 * Individual metric display item
 */
function MetricItem({
  label,
  value,
  subValue,
}: {
  label: string;
  value: string;
  subValue?: string;
}) {
  return (
    <div className="text-center">
      <div className="text-xs text-gray-500 mb-0.5">{label}</div>
      <div className="text-lg font-mono text-white">{value}</div>
      {subValue && <div className="text-xs text-gray-600">{subValue}</div>}
    </div>
  );
}

/**
 * Band condition table row with optional S-unit and path loss display
 */
function BandConditionRow({
  condition,
  hasEnhancedData,
}: {
  condition: PathBandCondition;
  hasEnhancedData: boolean;
}) {
  const statusColor = getPathStatusColor(condition.status);
  const statusBgColor = getPathStatusBgColor(condition.status);

  // Format status label
  const statusLabel =
    condition.status.charAt(0).toUpperCase() + condition.status.slice(1);

  // Get S-unit display text
  const sUnitText = condition.sUnit?.text || "N/A";
  const sUnitColor = getSUnitColor(condition.sUnit);

  return (
    <tr className="hover:bg-white/5 transition-colors">
      <td className="px-2 py-1.5">
        <div className="font-mono text-white">{condition.band}</div>
        <div className="text-gray-600 text-[10px]">{condition.frequency}</div>
      </td>
      <td className="px-2 py-1.5 text-center">
        <span
          className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-medium ${statusColor} ${statusBgColor}`}
        >
          {statusLabel}
        </span>
      </td>
      <td className="px-2 py-1.5 text-center">
        <div className="flex items-center justify-center gap-1">
          <SMeterIndicator sUnit={condition.sUnit} />
          <span className={`font-mono text-[10px] ${sUnitColor}`}>
            {sUnitText}
          </span>
        </div>
      </td>
      <td className="px-2 py-1.5 text-center font-mono">
        <span
          className={
            condition.snrEstimate <= -24 ? "text-gray-500" : "text-white"
          }
        >
          {condition.snrEstimate} dB
        </span>
      </td>
      <td className="px-2 py-1.5 text-gray-400 truncate max-w-[100px]">
        {condition.notes}
        {hasEnhancedData && condition.pathLoss !== undefined && (
          <span className="block text-[9px] text-gray-600">
            Loss: {Math.round(condition.pathLoss)} dB
          </span>
        )}
      </td>
    </tr>
  );
}

/**
 * Get color class for S-unit display
 */
function getSUnitColor(sUnit?: SUnit): string {
  if (!sUnit) return "text-gray-500";
  const value = sUnit.value;
  if (value >= 8) return "text-signal-green";
  if (value >= 5) return "text-caution-amber";
  return "text-alert-red";
}

/**
 * S-meter visual indicator component
 * Displays a simple bar graph representing signal strength
 */
function SMeterIndicator({ sUnit }: { sUnit?: SUnit }) {
  if (!sUnit) {
    return (
      <div className="flex gap-0.5">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="w-1 h-2 rounded-sm bg-gray-700" />
        ))}
      </div>
    );
  }

  const value = sUnit.value;
  // Map S-units to 5 bars: S1-2 = 1 bar, S3-4 = 2 bars, S5-6 = 3 bars, S7-8 = 4 bars, S9+ = 5 bars
  const filledBars = Math.min(5, Math.max(1, Math.ceil(value / 2)));

  // Determine bar color based on signal strength
  const getBarColor = (_barIndex: number, filled: boolean): string => {
    if (!filled) return "bg-gray-700";
    if (value >= 8) return "bg-signal-green";
    if (value >= 5) return "bg-caution-amber";
    return "bg-alert-red";
  };

  return (
    <div className="flex gap-0.5" title={`${sUnit.text} (${sUnit.dBm} dBm)`}>
      {[...Array(5)].map((_, i) => (
        <div
          key={i}
          className={`w-1 rounded-sm transition-colors ${getBarColor(i, i < filledBars)}`}
          style={{ height: `${6 + i * 2}px` }}
        />
      ))}
    </div>
  );
}

/**
 * Frequency Limits display component
 * Shows MUF, FOT, LUF, and HPF in a clean info box
 */
function FrequencyLimitsDisplay({
  limits,
}: {
  limits: FrequencyLimits | null;
}) {
  if (!limits) {
    return (
      <div className="space-y-2 pt-2 border-t border-white/5">
        <h4 className="text-sm font-medium text-gray-400">Frequency Limits</h4>
        <div className="p-3 rounded-lg border border-white/10 bg-white/5 text-center text-gray-500 text-xs">
          Calculating...
        </div>
      </div>
    );
  }

  // Determine color based on MUF value
  const getMufColor = (muf: number): string => {
    if (muf >= 21) return "text-signal-green";
    if (muf >= 14) return "text-good";
    if (muf >= 7) return "text-caution-amber";
    return "text-alert-red";
  };

  // Determine color based on LUF value (lower is better)
  const getLufColor = (luf: number): string => {
    if (luf <= 3) return "text-signal-green";
    if (luf <= 5) return "text-good";
    if (luf <= 8) return "text-caution-amber";
    return "text-alert-red";
  };

  return (
    <div className="space-y-2 pt-2 border-t border-white/5">
      <h4 className="text-sm font-medium text-gray-400">Frequency Limits</h4>
      <div className="p-3 rounded-lg border border-white/10 bg-white/5">
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 font-mono text-xs">
          {/* Row 1: MUF and FOT */}
          <div className="flex justify-between">
            <span className="text-gray-500">MUF:</span>
            <span className={getMufColor(limits.muf)}>
              {limits.muf.toFixed(1)} MHz
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">FOT:</span>
            <span className="text-white">{limits.fot.toFixed(1)} MHz</span>
          </div>
          {/* Row 2: LUF and HPF */}
          <div className="flex justify-between">
            <span className="text-gray-500">LUF:</span>
            <span className={getLufColor(limits.luf)}>
              {limits.luf.toFixed(1)} MHz
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">HPF:</span>
            <span className="text-white">{limits.hpf.toFixed(1)} MHz</span>
          </div>
        </div>
        {/* Usable window indicator */}
        <div className="mt-2 pt-2 border-t border-white/10">
          <div className="text-[10px] text-gray-500 text-center">
            Usable window: {limits.luf.toFixed(1)} - {limits.muf.toFixed(1)} MHz
          </div>
          <FrequencyWindowBar limits={limits} />
        </div>
      </div>
    </div>
  );
}

/**
 * Visual frequency window bar showing usable spectrum
 */
function FrequencyWindowBar({ limits }: { limits: FrequencyLimits }) {
  // Map frequency range 1.8 - 30 MHz to a percentage for visualization
  const minFreq = 1.8;
  const maxFreq = 30;
  const range = maxFreq - minFreq;

  const lufPercent = ((limits.luf - minFreq) / range) * 100;
  const mufPercent = ((limits.muf - minFreq) / range) * 100;
  const fotPercent = ((limits.fot - minFreq) / range) * 100;

  return (
    <div className="mt-1 relative h-2 bg-gray-800 rounded-full overflow-hidden">
      {/* Unusable low frequency zone (below LUF) */}
      <div
        className="absolute top-0 left-0 h-full bg-alert-red/30"
        style={{ width: `${lufPercent}%` }}
      />
      {/* Usable frequency zone */}
      <div
        className="absolute top-0 h-full bg-signal-green/40"
        style={{
          left: `${lufPercent}%`,
          width: `${mufPercent - lufPercent}%`,
        }}
      />
      {/* FOT indicator */}
      <div
        className="absolute top-0 h-full w-0.5 bg-signal-green"
        style={{ left: `${fotPercent}%` }}
        title={`FOT: ${limits.fot.toFixed(1)} MHz`}
      />
      {/* MUF indicator */}
      <div
        className="absolute top-0 h-full w-0.5 bg-caution-amber"
        style={{ left: `${mufPercent}%` }}
        title={`MUF: ${limits.muf.toFixed(1)} MHz`}
      />
    </div>
  );
}
