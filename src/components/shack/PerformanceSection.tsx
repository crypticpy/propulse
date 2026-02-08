/**
 * PerformanceSection -- Wrapper for analysis components with context header.
 *
 * Shows what radio is being analyzed, then renders PerformanceDashboard,
 * WhatIfSimulator, and PresetComparison in a stacked panel layout.
 */

import { useActiveRadio } from "@/stores/shackStore";
import { PerformanceDashboard } from "./PerformanceDashboard";
import { WhatIfSimulator } from "./WhatIfSimulator";
import { PresetComparison } from "./PresetComparison";

// ---- Component --------------------------------------------------------------

export function PerformanceSection() {
  const activeRadio = useActiveRadio();

  const radioName = activeRadio
    ? activeRadio.displayName?.trim() ||
      `${activeRadio.manufacturer} ${activeRadio.model}`
    : null;

  return (
    <div className="space-y-6">
      {/* Context header */}
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
        {radioName ? (
          <p className="text-sm text-gray-300">
            Analyzing:{" "}
            <span className="font-semibold text-gray-200">{radioName}</span>
          </p>
        ) : (
          <p className="text-sm text-gray-500">No active radio selected</p>
        )}
      </div>

      {/* Performance Dashboard */}
      <div className="bg-panel/30 backdrop-blur-sm border border-white/5 rounded-2xl p-4 md:p-6">
        <PerformanceDashboard />
      </div>

      {/* What-If Simulator */}
      <div className="bg-panel/30 backdrop-blur-sm border border-white/5 rounded-2xl p-4 md:p-6">
        <WhatIfSimulator />
      </div>

      {/* Preset Comparison */}
      <div className="bg-panel/30 backdrop-blur-sm border border-white/5 rounded-2xl p-4 md:p-6">
        <PresetComparison />
      </div>
    </div>
  );
}
