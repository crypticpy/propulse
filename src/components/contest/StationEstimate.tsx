/**
 * StationEstimate — Visual station performance estimate card
 *
 * Shows estimated QSO range as a bar gauge, tier badge, and operating tips.
 * Reads the user's shack profile from shackStore to build the estimate.
 *
 * @module components/contest/StationEstimate
 */

import { useMemo } from "react";
import { useShackStore, useUserRadios } from "@/stores/shackStore";
import {
  estimateContestPerformance,
  antennaTypeToCategory,
  type PerformanceEstimate,
} from "@/lib/contest/stationEstimator";

interface StationEstimateProps {
  /** Contest mode hint (e.g., "CW", "SSB") for rate adjustment */
  contestType?: string;
  className?: string;
}

// ---------------------------------------------------------------------------
// Tier → color mapping
// ---------------------------------------------------------------------------

const TIER_COLORS: Record<string, string> = {
  Adventurous: "text-caution-amber bg-caution-amber/15 border-caution-amber/30",
  "Bold Explorer":
    "text-plasma-orange bg-plasma-orange/15 border-plasma-orange/30",
  Capable: "text-nebula-blue bg-nebula-blue/15 border-nebula-blue/30",
  Competitive: "text-signal-green bg-signal-green/15 border-signal-green/30",
  "Serious Contester": "text-purple-400 bg-purple-400/15 border-purple-400/30",
  "Top Gun": "text-yellow-400 bg-yellow-400/15 border-yellow-400/30",
};

function getTierClasses(tier: string): string {
  return TIER_COLORS[tier] ?? "text-gray-400 bg-gray-400/15 border-gray-400/30";
}

// ---------------------------------------------------------------------------
// Gauge bar
// ---------------------------------------------------------------------------

/** Visual bar showing the estimated QSO range on a log scale */
function QSOGauge({ low, high }: { low: number; high: number }) {
  // Map QSO counts to a 0-100 percentage on a log scale (10 → 0%, 3000 → 100%)
  const logMin = Math.log10(10);
  const logMax = Math.log10(3000);
  const pctLow = Math.max(
    2,
    Math.min(
      98,
      ((Math.log10(Math.max(low, 10)) - logMin) / (logMax - logMin)) * 100,
    ),
  );
  const pctHigh = Math.max(
    pctLow + 2,
    Math.min(
      100,
      ((Math.log10(Math.max(high, 10)) - logMin) / (logMax - logMin)) * 100,
    ),
  );

  return (
    <div className="w-full">
      <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
        <span>10</span>
        <span>100</span>
        <span>1000</span>
        <span>3000+</span>
      </div>
      <div className="relative h-3 rounded-full bg-white/5 overflow-hidden">
        <div
          className="absolute top-0 h-full rounded-full bg-gradient-to-r from-nebula-blue/60 to-signal-green/60"
          style={{ left: `${pctLow}%`, width: `${pctHigh - pctLow}%` }}
        />
      </div>
      <div className="flex items-center justify-between text-xs mt-1.5">
        <span className="text-gray-400">
          Est. <span className="font-semibold text-white">{low}</span> &ndash;{" "}
          <span className="font-semibold text-white">{high}</span> QSOs
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function StationEstimate({
  contestType,
  className = "",
}: StationEstimateProps) {
  const radios = useUserRadios();
  const activeRadioId = useShackStore((s) => s.activeRadioId);
  const antennas = useShackStore((s) => s.antennas);

  const estimate = useMemo<PerformanceEstimate | null>(() => {
    // Determine power from active radio (or first radio)
    const activeRadio =
      radios.find((r) => r.userRadio.id === activeRadioId) ?? radios[0];
    if (!activeRadio) return null;

    const equipment = activeRadio.equipment;
    const powerWatts =
      activeRadio.userRadio.customPowerLimit ?? equipment?.maxPower ?? 100;

    // Determine antenna category from first antenna
    const firstAntenna = antennas[0];
    const antennaCategory = firstAntenna
      ? antennaTypeToCategory(firstAntenna.antennaType)
      : "unknown";

    return estimateContestPerformance(
      { powerWatts, antennaCategory },
      contestType,
    );
  }, [radios, activeRadioId, antennas, contestType]);

  // No shack profile — show encouragement
  if (!estimate) {
    return (
      <div
        className={`rounded-xl border border-white/5 bg-panel p-4 ${className}`}
      >
        <h3 className="text-sm font-semibold text-white mb-2">
          Station Estimate
        </h3>
        <p className="text-sm text-gray-400 leading-relaxed">
          Add radios and antennas in{" "}
          <span className="text-plasma-orange font-medium">My Shack</span> to
          see your estimated contest performance. Any station can participate
          and have fun!
        </p>
      </div>
    );
  }

  return (
    <div
      className={`rounded-xl border border-white/5 bg-panel p-4 ${className}`}
    >
      <div className="flex items-center gap-3 mb-3">
        <h3 className="text-sm font-semibold text-white">Station Estimate</h3>
        <span
          className={`px-2.5 py-0.5 text-xs font-semibold rounded-full border ${getTierClasses(estimate.tier)}`}
        >
          {estimate.tier}
        </span>
      </div>

      <QSOGauge low={estimate.lowEstimate} high={estimate.highEstimate} />

      {estimate.tips.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {estimate.tips.slice(0, 3).map((tip, i) => (
            <li
              key={i}
              className="flex gap-2 text-xs text-gray-400 leading-relaxed"
            >
              <span className="text-signal-green mt-0.5 flex-shrink-0">
                &#9679;
              </span>
              <span>{tip}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
