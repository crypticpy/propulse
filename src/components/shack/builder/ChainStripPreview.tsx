/**
 * ChainStripPreview -- Compact 60px-tall horizontal strip showing a collapsed
 * chain's signal path at a glance.
 *
 * Renders node type indicators (colored dots with 2-letter abbreviations) in
 * order with small arrows between them, plus a total loss/gain badge on the
 * right. Color-coded left border indicates chain health.
 */

import type { StationChain, ChainNode } from "@/types/stationChain";

// ---- Props ------------------------------------------------------------------

export interface ChainStripPreviewProps {
  chain: StationChain;
  /** Total loss in dB for the selected band */
  totalLossDb?: number;
  /** Total gain in dB for the selected band */
  totalGainDb?: number;
  /** Chain health status */
  health: "complete" | "incomplete" | "error";
}

// ---- Node type display config -----------------------------------------------

interface NodeTypeConfig {
  abbrev: string;
  color: string;
  bg: string;
}

function getNodeTypeConfig(node: ChainNode): NodeTypeConfig {
  switch (node.type) {
    case "radio":
      return {
        abbrev: "Rd",
        color: "text-plasma-orange",
        bg: "bg-plasma-orange/20",
      };
    case "accessory":
      return {
        abbrev: "Am",
        color: "text-nebula-blue",
        bg: "bg-nebula-blue/20",
      };
    case "feedline_run":
      return {
        abbrev: "FL",
        color: "text-feedline-teal",
        bg: "bg-feedline-teal/20",
      };
    case "antenna":
      return {
        abbrev: "An",
        color: "text-signal-green",
        bg: "bg-signal-green/20",
      };
    default:
      return { abbrev: "??", color: "text-gray-400", bg: "bg-white/10" };
  }
}

// ---- Health border colors ---------------------------------------------------

const HEALTH_BORDER: Record<ChainStripPreviewProps["health"], string> = {
  complete: "border-l-signal-green",
  incomplete: "border-l-caution-amber",
  error: "border-l-alert-red",
};

// ---- Component --------------------------------------------------------------

export function ChainStripPreview({
  chain,
  totalLossDb,
  totalGainDb,
  health,
}: ChainStripPreviewProps) {
  const netDb =
    totalGainDb != null && totalLossDb != null
      ? totalGainDb - totalLossDb
      : null;

  return (
    <div
      className={`
        bg-panel/20 border border-white/5 rounded-xl px-4 py-3 h-[60px]
        flex items-center justify-between gap-4 border-l-[3px]
        ${HEALTH_BORDER[health]}
      `}
    >
      {/* Left: Node type indicators */}
      <div className="flex items-center gap-1 min-w-0 overflow-x-auto scrollbar-hide">
        {chain.nodes.length === 0 ? (
          <span className="text-xs text-gray-500 italic">
            Empty signal path
          </span>
        ) : (
          chain.nodes.map((node, i) => {
            const config = getNodeTypeConfig(node);
            return (
              <div key={i} className="flex items-center gap-1 shrink-0">
                {i > 0 && (
                  <svg
                    className="w-3 h-3 text-gray-600 shrink-0"
                    viewBox="0 0 12 12"
                    fill="currentColor"
                  >
                    <path d="M2 5.5h6l-2-2 .7-.7L10 6.1 6.7 9.4 6 8.7l2-2H2z" />
                  </svg>
                )}
                <div
                  className={`
                    w-7 h-7 rounded-full flex items-center justify-center
                    ${config.bg}
                  `}
                  title={node.type === "feedline_run" ? "Feedline" : node.type}
                >
                  <span className={`text-[9px] font-bold ${config.color}`}>
                    {config.abbrev}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Right: Total loss/gain badge */}
      {netDb != null && (
        <div
          className={`
            shrink-0 px-2.5 py-1 rounded-lg text-xs font-semibold whitespace-nowrap
            ${
              netDb >= 0
                ? "bg-signal-green/10 text-signal-green border border-signal-green/20"
                : "bg-alert-red/10 text-alert-red border border-alert-red/20"
            }
          `}
        >
          {netDb >= 0
            ? `Net +${netDb.toFixed(1)} dB`
            : `${netDb.toFixed(1)} dB total`}
        </div>
      )}
    </div>
  );
}
