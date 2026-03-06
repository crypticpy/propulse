/**
 * NVISBriefing — Compact sidebar card showing NVIS (Near Vertical Incidence
 * Skywave) analysis for the operator's station location.
 *
 * Displays optimal frequency, coverage radius, recommended bands, and
 * condition summary based on current solar flux and ionospheric parameters.
 */

import { useMemo } from "react";
import { useActiveLocation } from "@/hooks/useActiveLocation";
import { useSolarFlux } from "@/hooks/useSolarData";
import { analyzeNVIS, getNVISConditionColor } from "@/lib/utils/nvis";

export function NVISBriefing() {
  const location = useActiveLocation();
  const { data: fluxData } = useSolarFlux();

  const sfi = useMemo<number | null>(() => {
    if (!fluxData || fluxData.length === 0) return null;
    return fluxData[fluxData.length - 1].flux ?? null;
  }, [fluxData]);

  const analysis = useMemo(() => {
    if (!location || sfi == null) return null;
    return analyzeNVIS(location.lat, location.lon, sfi, new Date());
  }, [location, sfi]);

  // No station location configured
  if (!location) {
    return (
      <div className="text-center py-2">
        <p className="text-[10px] text-gray-600">
          Set station location in Settings
        </p>
      </div>
    );
  }

  // Still loading solar data
  if (!analysis) {
    return (
      <div className="flex items-center justify-center py-3">
        <div className="w-3 h-3 border border-gray-600 border-t-plasma-orange rounded-full animate-spin" />
      </div>
    );
  }

  // NVIS not viable
  if (!analysis.nvisViable) {
    return (
      <div className="space-y-1">
        <div className="flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full bg-alert-red" />
          <span className="text-xs font-medium text-alert-red">
            NVIS Not Viable
          </span>
        </div>
        <p className="text-[10px] text-gray-500 leading-tight">
          f0F2 too low ({analysis.f0F2.toFixed(1)} MHz). Regional skywave
          communications unlikely on HF low bands.
        </p>
      </div>
    );
  }

  // NVIS viable — full display
  const conditionColor = getNVISConditionColor(analysis.reliability);

  return (
    <div className="space-y-2">
      {/* Status header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full bg-signal-green" />
          <span className="text-xs font-medium text-signal-green">
            NVIS Active
          </span>
        </div>
        <span className={`text-[10px] font-mono ${conditionColor}`}>
          {analysis.reliability}%
        </span>
      </div>

      {/* Details grid */}
      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[10px]">
        <div className="text-gray-500">Optimal Freq</div>
        <div className="text-gray-300 font-mono text-right">
          {analysis.optimalFrequency.toFixed(2)} MHz
        </div>

        <div className="text-gray-500">Coverage</div>
        <div className="text-gray-300 font-mono text-right">
          ~{analysis.coverageRadius} km
        </div>

        <div className="text-gray-500">Bands</div>
        <div className="text-gray-300 font-mono text-right">
          {analysis.recommendedBands.join(", ") || "None"}
        </div>

        <div className="text-gray-500">f0F2</div>
        <div className="text-gray-300 font-mono text-right">
          {analysis.f0F2.toFixed(1)} MHz
        </div>
      </div>

      {/* Condition summary */}
      <p className="text-[10px] text-gray-500 leading-tight">
        {analysis.conditionSummary}
      </p>
    </div>
  );
}
