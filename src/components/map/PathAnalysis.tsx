/**
 * PathAnalysis Component
 *
 * Displays path metrics between home station and target location.
 * Shows distance, bearing, hop count, difficulty rating, and
 * MUF/LUF/FOT/HPF frequency limits. Designed for right-side panel
 * in the framed layout.
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
import { getFrequencyLimits } from "@/lib/api/muf";
import { useSolarFlux } from "@/hooks/useSolarData";
import { Card } from "@/components/ui/Card";
import type { FrequencyLimits } from "@/types/propagation";

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

  // Fetch current solar data for frequency limits
  const { data: solarFluxData } = useSolarFlux();

  const currentSfi = useMemo(() => {
    if (!solarFluxData || solarFluxData.length === 0) return 100;
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
      <Card className={`${className} h-full`}>
        <div className="h-full flex items-center justify-center text-gray-500">
          <p className="text-sm text-center px-4">
            Set your QTH in settings to see path analysis
          </p>
        </div>
      </Card>
    );
  }

  // No target selected
  if (!target) {
    return (
      <Card className={`${className} h-full`}>
        <div className="h-full flex items-center justify-center text-gray-500">
          <p className="text-sm text-center px-4">
            Click on the map to select a target location
          </p>
        </div>
      </Card>
    );
  }

  if (!metrics) return null;

  return (
    <Card className={`${className} h-full flex flex-col`}>
      <div className="flex flex-col h-full overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 pb-3 flex-shrink-0">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-white">Path Analysis</h3>
            <p className="text-xs text-gray-500 truncate">
              {station.callsign} → {target.name || target.grid || "Target"}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <div
              className={`px-2 py-0.5 rounded-full text-[10px] font-medium
                ${DIFFICULTY_COLORS[metrics.difficulty]} bg-white/5`}
            >
              {DIFFICULTY_LABELS[metrics.difficulty]}
            </div>
            {!isTargetSaved && (
              <button
                onClick={openSaveModal}
                className="p-1 bg-plasma-orange/20 border border-plasma-orange/50 rounded
                           text-plasma-orange hover:bg-plasma-orange/30 transition-colors"
                title="Save this target"
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
                    d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"
                  />
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* Short Path */}
        <div className="space-y-2 pt-3">
          <h4 className="text-xs font-medium text-gray-400">Short Path</h4>
          <div className="grid grid-cols-3 gap-2">
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
        <div className="space-y-2 pt-3 border-t border-white/5 mt-3">
          <h4 className="text-xs font-medium text-gray-400">Long Path</h4>
          <div className="grid grid-cols-3 gap-2">
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
        <div className="space-y-2 pt-3 border-t border-white/5 mt-3">
          <h4 className="text-xs font-medium text-gray-400">Propagation</h4>
          <div className="grid grid-cols-3 gap-2">
            <MetricItem
              label="Est. Hops"
              value={`${metrics.hops}`}
              subValue="F-layer"
            />
            <MetricItem
              label="Path Light"
              value={`${Math.round(illumination)}%`}
              subValue={illumination > 50 ? "Day" : "Night"}
            />
            <MetricItem
              label="Midpoint"
              value={`${metrics.midpoint.lat.toFixed(0)}°`}
              subValue={`${metrics.midpoint.lon.toFixed(0)}°`}
            />
          </div>
        </div>

        {/* Frequency Limits Section */}
        <FrequencyLimitsDisplay limits={frequencyLimits} />

        {/* Target coordinates footer */}
        <div className="mt-auto pt-3 border-t border-white/5 text-[10px] text-gray-600 font-mono flex-shrink-0">
          {target.lat.toFixed(2)}°, {target.lon.toFixed(2)}°
          {target.grid && <span className="ml-1">({target.grid})</span>}
        </div>
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
      <div className="text-[10px] text-gray-500 mb-0.5">{label}</div>
      <div className="text-sm font-mono text-white">{value}</div>
      {subValue && <div className="text-[10px] text-gray-600">{subValue}</div>}
    </div>
  );
}

/**
 * Frequency Limits display component - compact version
 */
function FrequencyLimitsDisplay({
  limits,
}: {
  limits: FrequencyLimits | null;
}) {
  if (!limits) {
    return (
      <div className="space-y-2 pt-3 border-t border-white/5 mt-3">
        <h4 className="text-xs font-medium text-gray-400">Freq Limits</h4>
        <div className="p-2 rounded-lg border border-white/10 bg-white/5 text-center text-gray-500 text-[10px]">
          Calculating...
        </div>
      </div>
    );
  }

  const getMufColor = (muf: number): string => {
    if (muf >= 21) return "text-signal-green";
    if (muf >= 14) return "text-good";
    if (muf >= 7) return "text-caution-amber";
    return "text-alert-red";
  };

  const getLufColor = (luf: number): string => {
    if (luf <= 3) return "text-signal-green";
    if (luf <= 5) return "text-good";
    if (luf <= 8) return "text-caution-amber";
    return "text-alert-red";
  };

  return (
    <div className="space-y-2 pt-3 border-t border-white/5 mt-3">
      <h4 className="text-xs font-medium text-gray-400">Freq Limits</h4>
      <div className="p-2 rounded-lg border border-white/10 bg-white/5">
        <div className="grid grid-cols-2 gap-x-3 gap-y-1 font-mono text-[10px]">
          <div className="flex justify-between">
            <span className="text-gray-500">MUF:</span>
            <span className={getMufColor(limits.muf)}>
              {limits.muf.toFixed(1)}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">FOT:</span>
            <span className="text-white">{limits.fot.toFixed(1)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">LUF:</span>
            <span className={getLufColor(limits.luf)}>
              {limits.luf.toFixed(1)}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">HPF:</span>
            <span className="text-white">{limits.hpf.toFixed(1)}</span>
          </div>
        </div>
        {/* Compact frequency window bar */}
        <FrequencyWindowBar limits={limits} />
      </div>
    </div>
  );
}

/**
 * Visual frequency window bar - compact version
 */
function FrequencyWindowBar({ limits }: { limits: FrequencyLimits }) {
  const minFreq = 1.8;
  const maxFreq = 30;
  const range = maxFreq - minFreq;

  const lufPercent = ((limits.luf - minFreq) / range) * 100;
  const mufPercent = ((limits.muf - minFreq) / range) * 100;
  const fotPercent = ((limits.fot - minFreq) / range) * 100;

  return (
    <div className="mt-2 relative h-1.5 bg-gray-800 rounded-full overflow-hidden">
      <div
        className="absolute top-0 left-0 h-full bg-alert-red/30"
        style={{ width: `${lufPercent}%` }}
      />
      <div
        className="absolute top-0 h-full bg-signal-green/40"
        style={{
          left: `${lufPercent}%`,
          width: `${mufPercent - lufPercent}%`,
        }}
      />
      <div
        className="absolute top-0 h-full w-0.5 bg-signal-green"
        style={{ left: `${fotPercent}%` }}
      />
      <div
        className="absolute top-0 h-full w-0.5 bg-caution-amber"
        style={{ left: `${mufPercent}%` }}
      />
    </div>
  );
}
