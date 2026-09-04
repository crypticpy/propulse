/**
 * PerformanceSection -- Wrapper for analysis components with context header.
 *
 * Shows the active signal path, then renders PerformanceDashboard,
 * WhatIfSimulator, and PathComparison. Upgrade copy is informational only.
 */

import { useMemo } from "react";
import { useActiveChain, useStationInventory } from "@/stores/shackStore";
import { useChainPerformance } from "@/hooks/useChainPerformance";
import { useKIndex } from "@/hooks/useSolarData";
import {
  openingTiedChallenge,
  suggestFeedlineUpgrade,
} from "@/lib/station/stationUpgrade";
import { PerformanceDashboard } from "./PerformanceDashboard";
import { WhatIfSimulator } from "./WhatIfSimulator";
import { PathComparison } from "./PathComparison";

export function PerformanceSection() {
  const chain = useActiveChain();
  const inventory = useStationInventory();
  const performance = useChainPerformance();
  const kIndexQuery = useKIndex();
  const kp = kIndexQuery.data?.[kIndexQuery.data.length - 1]?.kp_index;

  const upgrade = useMemo(
    () => suggestFeedlineUpgrade(chain, inventory, performance.bands),
    [chain, inventory, performance.bands],
  );
  const challenge = useMemo(
    () => openingTiedChallenge(upgrade, kp == null || kp < 4),
    [kp, upgrade],
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <svg
          className="w-4 h-4 text-gray-500"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
          />
        </svg>
        {chain ? (
          <p className="text-sm text-gray-300">
            Analyzing:{" "}
            <span className="font-semibold text-gray-200">{chain.name}</span>
          </p>
        ) : (
          <p className="text-sm text-gray-500">
            Activate a signal path in the Diagram lab
          </p>
        )}
      </div>

      {upgrade && (
        <div className="bg-panel/30 backdrop-blur-sm border border-white/10 rounded-2xl px-4 py-3">
          <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">
            Quantified upgrade
          </p>
          <p className="text-sm text-gray-200">{upgrade.message}</p>
        </div>
      )}

      {challenge && (
        <div className="bg-plasma-orange/10 border border-plasma-orange/20 rounded-2xl px-4 py-3">
          <p className="text-[10px] uppercase tracking-wider text-plasma-orange/70 mb-1">
            Opening
          </p>
          <p className="text-sm text-gray-200">{challenge}</p>
        </div>
      )}

      <PerformanceDashboard />
      <WhatIfSimulator />
      <PathComparison />
    </div>
  );
}
