/**
 * PerformanceDashboard — Per-band capability matrix and system summary.
 *
 * Shows a detailed table of band performance data and summary cards
 * for the active station preset.
 */

import { useStationPerformance } from "@/hooks/useStationPerformance";
import { BandCapabilityStrip } from "./BandCapabilityStrip";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatWatts(w: number): string {
  if (w >= 1000) return `${(w / 1000).toFixed(1)}kW`;
  if (w >= 100) return `${w.toFixed(0)}W`;
  return `${w.toFixed(1)}W`;
}

function dbClass(value: number): string {
  if (value > 0) return "text-signal-green";
  if (value < 0) return "text-alert-red";
  return "text-gray-400";
}

function lossClass(value: number): string {
  if (value > 0) return "text-alert-red";
  return "text-gray-400";
}

// ─── Component ────────────────────────────────────────────────────────────────

export function PerformanceDashboard() {
  const perf = useStationPerformance();

  if (!perf.preset) {
    return (
      <div className="bg-panel/30 backdrop-blur-sm border border-white/5 rounded-2xl p-6">
        <p className="text-center text-gray-500 text-sm">
          Activate a station preset to see performance data
        </p>
      </div>
    );
  }

  if (perf.bands.length === 0) {
    return (
      <div className="bg-panel/30 backdrop-blur-sm border border-white/5 rounded-2xl p-6">
        <p className="text-center text-gray-500 text-sm">
          No band data available for the active preset. Ensure the antenna has
          bands configured.
        </p>
      </div>
    );
  }

  const bandLossData = perf.bands.map((b) => ({
    band: b.band,
    lossDb: b.feedlineLossDb,
  }));

  return (
    <div className="space-y-4">
      {/* Band capability strip */}
      <div className="bg-panel/30 backdrop-blur-sm border border-white/5 rounded-2xl p-4">
        <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
          Band Capability
        </h4>
        <BandCapabilityStrip bands={bandLossData} />
      </div>

      {/* System summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {perf.bestBand && (
          <div className="bg-panel/30 backdrop-blur-sm border border-white/5 rounded-2xl p-4">
            <div className="text-xs text-gray-400 mb-1">Best Band</div>
            <div className="text-lg font-bold text-signal-green">
              {perf.bestBand.band}
            </div>
            <div className="text-xs text-gray-500">
              {formatWatts(perf.bestBand.erpWatts)} ERP
            </div>
          </div>
        )}
        {perf.worstBand && (
          <div className="bg-panel/30 backdrop-blur-sm border border-white/5 rounded-2xl p-4">
            <div className="text-xs text-gray-400 mb-1">Worst Band</div>
            <div className="text-lg font-bold text-caution-yellow">
              {perf.worstBand.band}
            </div>
            <div className="text-xs text-gray-500">
              {formatWatts(perf.worstBand.erpWatts)} ERP
            </div>
          </div>
        )}
        {perf.totalLossRangeDb && (
          <div className="bg-panel/30 backdrop-blur-sm border border-white/5 rounded-2xl p-4">
            <div className="text-xs text-gray-400 mb-1">
              Feedline Loss Range
            </div>
            <div className="text-lg font-bold text-gray-200">
              {perf.totalLossRangeDb} dB
            </div>
            <div className="text-xs text-gray-500">Across all bands</div>
          </div>
        )}
      </div>

      {/* Per-band capability table */}
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
                  Feedline Loss
                </th>
                <th className="text-right py-2 px-3 text-xs text-gray-400 font-medium whitespace-nowrap">
                  Acc. Gain/Loss
                </th>
                <th className="text-right py-2 px-3 text-xs text-gray-400 font-medium whitespace-nowrap">
                  Power @ Ant.
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
              {perf.bands.map((b) => (
                <tr
                  key={b.band}
                  className="border-b border-white/5 hover:bg-white/5 transition-colors"
                >
                  <td className="py-2 pr-3 font-medium text-gray-200 whitespace-nowrap">
                    {b.band}
                  </td>
                  <td className="py-2 px-3 text-right text-gray-300 whitespace-nowrap">
                    {formatWatts(b.txPowerWatts)}
                  </td>
                  <td
                    className={`py-2 px-3 text-right whitespace-nowrap ${lossClass(b.feedlineLossDb)}`}
                  >
                    -{b.feedlineLossDb.toFixed(1)} dB
                  </td>
                  <td
                    className={`py-2 px-3 text-right whitespace-nowrap ${dbClass(b.accessoryGainDb)}`}
                  >
                    {b.accessoryGainDb >= 0 ? "+" : ""}
                    {b.accessoryGainDb.toFixed(1)} dB
                  </td>
                  <td className="py-2 px-3 text-right text-gray-300 whitespace-nowrap">
                    {formatWatts(b.powerAtAntennaWatts)}
                  </td>
                  <td
                    className={`py-2 px-3 text-right whitespace-nowrap ${dbClass(b.antennaGainDbi)}`}
                  >
                    {b.antennaGainDbi >= 0 ? "+" : ""}
                    {b.antennaGainDbi.toFixed(1)} dBi
                  </td>
                  <td className="py-2 pl-3 text-right font-medium text-plasma-orange whitespace-nowrap">
                    {formatWatts(b.erpWatts)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
