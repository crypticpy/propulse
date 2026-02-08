/**
 * LossBudgetBar -- Horizontal waterfall diagram showing cumulative dB
 * gain/loss at each stage in the signal chain, with an interactive band selector.
 *
 * Layout:
 *   Band pills row  (clickable, selected = plasma-orange)
 *   Waterfall row    (starting power -> node segments -> final ERP)
 */

import type { BandChainPerformance } from "@/hooks/useChainPerformance";

// ---- Props -----------------------------------------------------------------

export interface LossBudgetBarProps {
  bandPerformance: BandChainPerformance | null;
  availableBands: string[];
  selectedBand: string;
  onSelectBand: (band: string) => void;
}

// ---- Helpers ---------------------------------------------------------------

function formatWatts(w: number): string {
  if (w >= 1000) return `${(w / 1000).toFixed(1)}kW`;
  if (w >= 100) return `${w.toFixed(0)}W`;
  if (w >= 1) return `${w.toFixed(1)}W`;
  return `${(w * 1000).toFixed(0)}mW`;
}

function formatDb(db: number): string {
  const sign = db >= 0 ? "+" : "";
  return `${sign}${db.toFixed(1)} dB`;
}

function dbColor(db: number): string {
  if (db > 0) return "text-signal-green";
  if (db < 0) return "text-alert-red";
  return "text-gray-400";
}

function dbBgColor(db: number): string {
  if (db > 0) return "bg-signal-green/10 border-signal-green/20";
  if (db < 0) return "bg-alert-red/10 border-alert-red/20";
  return "bg-white/5 border-white/10";
}

// ---- Component -------------------------------------------------------------

export function LossBudgetBar({
  bandPerformance,
  availableBands,
  selectedBand,
  onSelectBand,
}: LossBudgetBarProps) {
  return (
    <div className="space-y-3">
      {/* Band selector pills */}
      <div className="flex flex-wrap gap-1.5">
        {availableBands.map((band) => {
          const isSelected = band === selectedBand;
          return (
            <button
              key={band}
              type="button"
              onClick={() => onSelectBand(band)}
              className={`px-2.5 py-1 rounded text-[11px] font-medium border transition-colors ${
                isSelected
                  ? "bg-plasma-orange text-white border-plasma-orange/50"
                  : "bg-white/5 text-gray-400 border-white/10 hover:bg-white/10 hover:text-gray-300"
              }`}
            >
              {band}
            </button>
          );
        })}
      </div>

      {/* Waterfall diagram */}
      {bandPerformance == null ? (
        <div className="text-sm text-gray-500 italic py-4 text-center">
          Select a chain to view loss budget
        </div>
      ) : (
        <WaterfallRow bandPerformance={bandPerformance} />
      )}
    </div>
  );
}

// ---- Waterfall Row ---------------------------------------------------------

function WaterfallRow({
  bandPerformance,
}: {
  bandPerformance: BandChainPerformance;
}) {
  const { nodes, erpWatts } = bandPerformance;

  if (nodes.length === 0) {
    return (
      <div className="text-sm text-gray-500 italic py-4 text-center">
        No nodes in chain
      </div>
    );
  }

  const startingPower = nodes[0].inputPowerWatts;

  return (
    <div className="flex items-center gap-0 overflow-x-auto pb-1">
      {/* Starting power */}
      <div className="flex flex-col items-center shrink-0 min-w-[56px]">
        <span className="text-sm font-bold text-white">
          {formatWatts(startingPower)}
        </span>
        <span className="text-[10px] text-gray-500 mt-0.5">Input</span>
      </div>

      {/* Node segments */}
      {nodes.map((node, i) => {
        // Radio node is the source (0 dB) -- skip the segment for it
        // but still show the label
        const isSource = node.nodeType === "radio";
        const netDb = node.netDb;

        return (
          <div key={i} className="flex items-center shrink-0">
            {/* Arrow */}
            <div className="flex items-center text-gray-600 mx-1">
              <svg
                width="20"
                height="12"
                viewBox="0 0 20 12"
                className="fill-current"
              >
                <path d="M0 5h14l-3-3 1.5-1.5L18 6l-5.5 5.5L11 10l3-3H0z" />
              </svg>
            </div>

            {/* Segment */}
            <div
              className={`flex flex-col items-center px-2 py-1.5 rounded-lg border min-w-[72px] ${
                isSource ? "bg-white/5 border-white/10" : dbBgColor(netDb)
              }`}
            >
              <span
                className={`text-xs font-semibold ${
                  isSource ? "text-gray-300" : dbColor(netDb)
                }`}
              >
                {isSource ? "0 dB" : formatDb(netDb)}
              </span>
              <span
                className="text-[10px] text-gray-500 mt-0.5 max-w-[72px] truncate"
                title={node.label}
              >
                {node.label}
              </span>
            </div>
          </div>
        );
      })}

      {/* Final ERP */}
      <div className="flex items-center shrink-0">
        <div className="flex items-center text-gray-600 mx-1">
          <svg
            width="24"
            height="12"
            viewBox="0 0 24 12"
            className="fill-current"
          >
            <path d="M0 4h6v-1h2v1h6v-1h2v1h2l-3-3 1.5-1.5L22 6l-5.5 5.5L15 10l3-3h-2v1h-2v-1H8v1H6v-1H0z" />
          </svg>
        </div>
        <div className="flex flex-col items-center shrink-0 min-w-[64px]">
          <span className="text-sm font-bold text-plasma-orange">
            {formatWatts(erpWatts)}
          </span>
          <span className="text-[10px] text-gray-500 mt-0.5">ERP</span>
        </div>
      </div>
    </div>
  );
}
