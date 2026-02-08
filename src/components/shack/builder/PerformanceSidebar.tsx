/**
 * PerformanceSidebar -- Per-band performance table with summary cards
 * and optional per-node waterfall breakdown.
 *
 * Designed for the Station Builder Lab context; consumes the
 * ChainPerformanceResult from useChainPerformance.
 */

import { useMemo, useState } from "react";
import type {
  ChainPerformanceResult,
  BandChainPerformance,
  NodePerformance,
} from "@/hooks/useChainPerformance";

// ---- Props -----------------------------------------------------------------

export interface PerformanceSidebarProps {
  chainPerformance: ChainPerformanceResult;
  selectedBand?: string;
  onSelectBand?: (band: string) => void;
}

// ---- Helpers ---------------------------------------------------------------

function formatWatts(w: number): string {
  if (w >= 1000) return `${(w / 1000).toFixed(1)}kW`;
  if (w >= 100) return `${w.toFixed(0)}W`;
  if (w >= 1) return `${w.toFixed(1)}W`;
  return `${(w * 1000).toFixed(0)}mW`;
}

function dbClass(value: number): string {
  if (value > 0) return "text-signal-green";
  if (value < 0) return "text-alert-red";
  return "text-gray-400";
}

function formatDb(value: number, alwaysSign = true): string {
  const sign = value > 0 ? "+" : value === 0 && alwaysSign ? "+" : "";
  return `${sign}${value.toFixed(1)}`;
}

function nodeTypeLabel(type: string): string {
  switch (type) {
    case "radio":
      return "Radio";
    case "accessory":
      return "Accessory";
    case "feedline_run":
      return "Feedline";
    case "antenna":
      return "Antenna";
    default:
      return type;
  }
}

// ---- Derived metrics for each band -----------------------------------------

interface BandRow {
  band: string;
  txPower: number;
  systemLoss: number;
  systemGain: number;
  antennaGain: number;
  erp: number;
}

function deriveBandRow(bp: BandChainPerformance): BandRow {
  let systemLoss = 0;
  let systemGain = 0;
  let antennaGain = 0;

  for (const node of bp.nodes) {
    if (node.nodeType === "antenna") {
      antennaGain = node.gainDb;
    } else {
      systemLoss += node.lossDb;
      systemGain += node.gainDb;
    }
  }

  const txPower = bp.nodes.length > 0 ? bp.nodes[0].inputPowerWatts : 0;

  return {
    band: bp.band,
    txPower,
    systemLoss,
    systemGain,
    antennaGain,
    erp: bp.erpWatts,
  };
}

// ---- Component -------------------------------------------------------------

export function PerformanceSidebar({
  chainPerformance,
  selectedBand: controlledBand,
  onSelectBand,
}: PerformanceSidebarProps) {
  const [internalBand, setInternalBand] = useState<string | undefined>(
    undefined,
  );
  const selectedBand = controlledBand ?? internalBand;

  const handleSelectBand = (band: string) => {
    const next = band === selectedBand ? undefined : band;
    if (onSelectBand) {
      onSelectBand(next ?? "");
    } else {
      setInternalBand(next);
    }
  };

  const { chain, bands, bestBand, worstBand } = chainPerformance;

  // Loss range across all bands
  const lossRange = useMemo(() => {
    if (bands.length === 0) return null;
    const rows = bands.map(deriveBandRow);
    const losses = rows.map((r) => r.systemLoss - r.systemGain);
    const min = Math.min(...losses);
    const max = Math.max(...losses);
    return { min, max };
  }, [bands]);

  // Selected band performance
  const selectedBandPerf = useMemo(
    () =>
      selectedBand
        ? (bands.find((b) => b.band === selectedBand) ?? null)
        : null,
    [bands, selectedBand],
  );

  if (!chain || bands.length === 0) {
    return (
      <div className="bg-panel/30 backdrop-blur-sm border border-white/5 rounded-2xl p-6">
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
          Performance Analysis
        </h3>
        <p className="text-center text-gray-500 text-sm">
          {!chain
            ? "Select a chain to view performance data"
            : "No band data available. Ensure the antenna has bands configured."}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-panel/30 backdrop-blur-sm border border-white/5 rounded-2xl p-4">
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
          Performance Analysis
        </h3>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {bestBand && (
          <div className="bg-panel/30 backdrop-blur-sm border border-white/5 rounded-2xl p-4">
            <div className="text-xs text-gray-400 mb-1">Best Band</div>
            <div className="text-lg font-bold text-signal-green">
              {bestBand.band}
            </div>
            <div className="text-xs text-gray-500">
              {formatWatts(bestBand.erpWatts)} ERP
            </div>
          </div>
        )}
        {worstBand && (
          <div className="bg-panel/30 backdrop-blur-sm border border-white/5 rounded-2xl p-4">
            <div className="text-xs text-gray-400 mb-1">Worst Band</div>
            <div className="text-lg font-bold text-alert-red">
              {worstBand.band}
            </div>
            <div className="text-xs text-gray-500">
              {formatWatts(worstBand.erpWatts)} ERP
            </div>
          </div>
        )}
        {lossRange && (
          <div className="bg-panel/30 backdrop-blur-sm border border-white/5 rounded-2xl p-4">
            <div className="text-xs text-gray-400 mb-1">Net Loss Range</div>
            <div className="text-lg font-bold text-caution-amber">
              {lossRange.min.toFixed(1)} - {lossRange.max.toFixed(1)} dB
            </div>
            <div className="text-xs text-gray-500">Across all bands</div>
          </div>
        )}
      </div>

      {/* Per-band table */}
      <div className="bg-panel/30 backdrop-blur-sm border border-white/5 rounded-2xl p-4">
        <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
          Per-Band Performance
        </h4>
        <div className="overflow-x-auto -mx-4 px-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10">
                <th className="text-left py-2 pr-3 text-xs text-gray-400 font-medium whitespace-nowrap">
                  Band
                </th>
                <th className="text-right py-2 px-3 text-xs text-gray-400 font-medium whitespace-nowrap">
                  TX Power
                </th>
                <th className="text-right py-2 px-3 text-xs text-gray-400 font-medium whitespace-nowrap">
                  System Loss
                </th>
                <th className="text-right py-2 px-3 text-xs text-gray-400 font-medium whitespace-nowrap">
                  Ant. Gain
                </th>
                <th className="text-right py-2 pl-3 text-xs text-gray-400 font-medium whitespace-nowrap">
                  ERP
                </th>
              </tr>
            </thead>
            <tbody>
              {bands.map((bp) => {
                const row = deriveBandRow(bp);
                const netSystemDb = row.systemGain - row.systemLoss;
                const isSelected = bp.band === selectedBand;

                return (
                  <tr
                    key={bp.band}
                    onClick={() => handleSelectBand(bp.band)}
                    className={`border-b border-white/5 cursor-pointer transition-colors ${
                      isSelected ? "bg-plasma-orange/10" : "hover:bg-white/5"
                    }`}
                  >
                    <td className="py-2 pr-3 font-medium text-gray-200 whitespace-nowrap">
                      {bp.band}
                    </td>
                    <td className="py-2 px-3 text-right text-gray-300 whitespace-nowrap">
                      {formatWatts(row.txPower)}
                    </td>
                    <td
                      className={`py-2 px-3 text-right whitespace-nowrap ${dbClass(netSystemDb)}`}
                    >
                      {formatDb(netSystemDb)} dB
                    </td>
                    <td
                      className={`py-2 px-3 text-right whitespace-nowrap ${dbClass(row.antennaGain)}`}
                    >
                      {formatDb(row.antennaGain)} dBi
                    </td>
                    <td className="py-2 pl-3 text-right font-medium text-plasma-orange whitespace-nowrap">
                      {formatWatts(row.erp)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Per-node breakdown for selected band */}
      {selectedBandPerf && (
        <NodeBreakdownTable bandPerformance={selectedBandPerf} />
      )}
    </div>
  );
}

// ---- Node Breakdown Table --------------------------------------------------

function NodeBreakdownTable({
  bandPerformance,
}: {
  bandPerformance: BandChainPerformance;
}) {
  return (
    <div className="bg-panel/30 backdrop-blur-sm border border-white/5 rounded-2xl p-4">
      <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
        Node Breakdown &mdash; {bandPerformance.band}
      </h4>
      <div className="overflow-x-auto -mx-4 px-4">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/10">
              <th className="text-left py-2 pr-2 text-xs text-gray-400 font-medium whitespace-nowrap">
                Node
              </th>
              <th className="text-left py-2 px-2 text-xs text-gray-400 font-medium whitespace-nowrap">
                Type
              </th>
              <th className="text-right py-2 px-2 text-xs text-gray-400 font-medium whitespace-nowrap">
                Input
              </th>
              <th className="text-right py-2 px-2 text-xs text-gray-400 font-medium whitespace-nowrap">
                Gain
              </th>
              <th className="text-right py-2 px-2 text-xs text-gray-400 font-medium whitespace-nowrap">
                Loss
              </th>
              <th className="text-right py-2 px-2 text-xs text-gray-400 font-medium whitespace-nowrap">
                Net
              </th>
              <th className="text-right py-2 pl-2 text-xs text-gray-400 font-medium whitespace-nowrap">
                Output
              </th>
            </tr>
          </thead>
          <tbody>
            {bandPerformance.nodes.map((node: NodePerformance) => (
              <tr
                key={node.nodeIndex}
                className="border-b border-white/5 hover:bg-white/5 transition-colors"
              >
                <td
                  className="py-2 pr-2 text-gray-200 whitespace-nowrap max-w-[100px] truncate"
                  title={node.label}
                >
                  {node.label}
                </td>
                <td className="py-2 px-2 text-gray-400 whitespace-nowrap text-xs">
                  {nodeTypeLabel(node.nodeType)}
                </td>
                <td className="py-2 px-2 text-right text-gray-300 whitespace-nowrap">
                  {formatWatts(node.inputPowerWatts)}
                </td>
                <td
                  className={`py-2 px-2 text-right whitespace-nowrap ${
                    node.gainDb > 0 ? "text-signal-green" : "text-gray-500"
                  }`}
                >
                  {node.gainDb > 0
                    ? `+${node.gainDb.toFixed(1)}`
                    : node.gainDb.toFixed(1)}
                </td>
                <td
                  className={`py-2 px-2 text-right whitespace-nowrap ${
                    node.lossDb > 0 ? "text-alert-red" : "text-gray-500"
                  }`}
                >
                  {node.lossDb > 0
                    ? `-${node.lossDb.toFixed(1)}`
                    : node.lossDb.toFixed(1)}
                </td>
                <td
                  className={`py-2 px-2 text-right whitespace-nowrap font-medium ${dbClass(node.netDb)}`}
                >
                  {formatDb(node.netDb)}
                </td>
                <td className="py-2 pl-2 text-right text-gray-300 whitespace-nowrap">
                  {formatWatts(node.outputPowerWatts)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Totals row */}
      <div className="flex items-center justify-between mt-3 pt-2 border-t border-white/10">
        <span className="text-xs text-gray-400">Total System</span>
        <span
          className={`text-sm font-semibold ${dbClass(bandPerformance.totalSystemGainDb)}`}
        >
          {formatDb(bandPerformance.totalSystemGainDb)} dB
        </span>
        <span className="text-sm font-bold text-plasma-orange">
          {formatWatts(bandPerformance.erpWatts)} ERP
        </span>
      </div>
    </div>
  );
}
