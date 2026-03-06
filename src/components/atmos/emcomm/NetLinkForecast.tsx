/**
 * NetLinkForecast -- 12-hour reliability forecast for the active frequency plan.
 * Displays a compact heatmap of projected band conditions per frequency entry.
 *
 * Uses current Kp and SFI from solar data hooks, and projects how conditions
 * will change over the next 12 hours using a simplified band assessment model.
 */

import { useMemo } from "react";
import { useKIndex, useSolarFlux } from "@/hooks/useSolarData";
import { useEmcommStore } from "@/stores/emcommStore";
import type { FrequencyPlanEntry } from "@/types/emcomm";

// ── Condition rating ────────────────────────────────────────────────────────

type LinkQuality = "good" | "marginal" | "poor";

/**
 * Assess link quality for a given frequency, Kp, and SFI at a projected hour.
 *
 * Logic:
 * - HF below 10 MHz:  good when Kp < 3 and SFI > 80
 * - HF 10-30 MHz:     good when Kp < 4 and SFI > 100
 * - VHF+ (>30 MHz):   generally good unless Kp > 6
 *
 * Hour offset is used to apply diurnal variation (higher bands degrade at night).
 */
function assessLinkQuality(
  frequencyHz: number,
  kp: number,
  sfi: number,
  hourOffset: number,
): LinkQuality {
  const freqMHz = frequencyHz / 1_000_000;

  // Simple diurnal penalty: assume we're projecting forward from "now",
  // night hours (offset 6-18 in a 24h cycle) penalise higher bands.
  // We use a soft penalty rather than hard cutoff.
  const localHourEstimate = (new Date().getUTCHours() + hourOffset) % 24;
  const isNight = localHourEstimate < 6 || localHourEstimate > 18;

  if (freqMHz > 30) {
    // VHF+: mostly line-of-sight, resilient except severe storms
    if (kp > 6) return "poor";
    if (kp > 4) return "marginal";
    return "good";
  }

  if (freqMHz >= 10) {
    // Upper HF (10-30 MHz)
    const sfiOk = sfi > 100;
    const kpOk = kp < 4;
    const nightPenalty = isNight && freqMHz > 18;

    if (nightPenalty) {
      return kpOk ? "marginal" : "poor";
    }
    if (sfiOk && kpOk) return "good";
    if (sfiOk || kpOk) return "marginal";
    return "poor";
  }

  // Lower HF (< 10 MHz)
  const sfiOk = sfi > 80;
  const kpOk = kp < 3;
  // Lower bands actually improve at night (less D-layer absorption)
  const nightBonus = isNight;

  if (sfiOk && kpOk) return "good";
  if ((sfiOk || kpOk) && nightBonus) return "good";
  if (sfiOk || kpOk) return "marginal";
  return "poor";
}

const QUALITY_COLORS: Record<LinkQuality, string> = {
  good: "bg-[#22c55e]",
  marginal: "bg-[#f59e0b]",
  poor: "bg-[#ef4444]",
};

const QUALITY_LABELS: Record<LinkQuality, string> = {
  good: "Good",
  marginal: "Marginal",
  poor: "Poor",
};

// ── Hour markers ────────────────────────────────────────────────────────────

const HOUR_LABELS = [
  { offset: 0, label: "NOW" },
  { offset: 3, label: "+3" },
  { offset: 6, label: "+6" },
  { offset: 9, label: "+9" },
  { offset: 11, label: "+11" },
];

// ── Component ───────────────────────────────────────────────────────────────

function formatFreq(hz: number): string {
  const mhz = hz / 1_000_000;
  if (mhz >= 100) return `${mhz.toFixed(1)}`;
  return `${mhz.toFixed(3)}`;
}

export function NetLinkForecast() {
  const selectedPlanId = useEmcommStore((s) => s.selectedPlanId);
  const frequencyPlans = useEmcommStore((s) => s.frequencyPlans);

  const { data: kData } = useKIndex();
  const { data: fluxData } = useSolarFlux();

  const activePlan = selectedPlanId
    ? frequencyPlans.find((p) => p.id === selectedPlanId)
    : null;

  const kp = useMemo<number>(() => {
    if (!kData || kData.length === 0) return 3; // default moderate
    const last = kData[kData.length - 1];
    return typeof last.kp_index === "number" ? last.kp_index : 3;
  }, [kData]);

  const sfi = useMemo<number>(() => {
    if (!fluxData || fluxData.length === 0) return 100; // default moderate
    const last = fluxData[fluxData.length - 1];
    return typeof last.flux === "number" ? last.flux : 100;
  }, [fluxData]);

  // Build forecast grid: entries x 12 hours
  const forecast = useMemo(() => {
    if (!activePlan) return null;
    return activePlan.entries.map((entry: FrequencyPlanEntry) => ({
      entry,
      hours: Array.from({ length: 12 }, (_, h) =>
        assessLinkQuality(entry.frequencyHz, kp, sfi, h),
      ),
    }));
  }, [activePlan, kp, sfi]);

  if (!activePlan) {
    return (
      <div className="text-center py-2">
        <p className="text-[10px] text-gray-600">Select a frequency plan</p>
      </div>
    );
  }

  if (!forecast || forecast.length === 0) {
    return (
      <div className="text-center py-2">
        <p className="text-[10px] text-gray-600">No frequencies in plan</p>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      {/* Hour markers */}
      <div className="flex items-end gap-0">
        {/* Label column spacer */}
        <div className="w-16 shrink-0" />
        <div className="flex-1 flex">
          {Array.from({ length: 12 }, (_, i) => {
            const marker = HOUR_LABELS.find((h) => h.offset === i);
            return (
              <div key={i} className="flex-1 flex justify-center">
                {marker ? (
                  <span className="text-[8px] font-mono text-gray-600">
                    {marker.label}
                  </span>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>

      {/* Forecast rows */}
      {forecast.map(({ entry, hours }, rowIdx) => (
        <div
          key={`${entry.frequencyHz}-${rowIdx}`}
          className="flex items-center gap-0"
        >
          {/* Frequency label */}
          <div className="w-16 shrink-0 text-right pr-2">
            <span className="text-[10px] font-mono text-gray-400 truncate block">
              {formatFreq(entry.frequencyHz)}
            </span>
          </div>

          {/* Condition bars */}
          <div className="flex-1 flex gap-px">
            {hours.map((quality, h) => (
              <div
                key={h}
                className={`flex-1 h-4 rounded-sm ${QUALITY_COLORS[quality]} opacity-80`}
                title={`${formatFreq(entry.frequencyHz)} MHz +${h}h: ${QUALITY_LABELS[quality]}`}
              />
            ))}
          </div>
        </div>
      ))}

      {/* Legend */}
      <div className="flex items-center gap-3 pt-1">
        {(["good", "marginal", "poor"] as const).map((q) => (
          <div key={q} className="flex items-center gap-1">
            <div className={`w-2 h-2 rounded-sm ${QUALITY_COLORS[q]}`} />
            <span className="text-[8px] font-mono text-gray-600 capitalize">
              {q}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
