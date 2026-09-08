/**
 * PerformanceDashboard — Per-band capability matrix and system summary.
 *
 * Shows a detailed table of band performance data and summary cards
 * Shows a detailed table of band performance data and summary cards
 * for the active signal path.
 */

import { useChainPerformance } from "@/hooks/useChainPerformance";
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
  return "text-su-muted";
}

function lossClass(value: number): string {
  if (value > 0) return "text-alert-red";
  return "text-su-muted";
}

// ─── Component ────────────────────────────────────────────────────────────────

export function PerformanceDashboard() {
  const perf = useChainPerformance();

  if (!perf.chain) {
    return (
      <div className="bg-panel/30 backdrop-blur-sm border border-su-line/20 rounded-2xl p-6">
        <p className="text-center text-su-muted text-sm">
          Activate a signal path in the Diagram lab to see performance data
        </p>
      </div>
    );
  }

  if (perf.bands.length === 0) {
    return (
      <div className="bg-panel/30 backdrop-blur-sm border border-su-line/20 rounded-2xl p-6">
        <p className="text-center text-su-muted text-sm">
          No band data available for the active signal path. Ensure the antenna
          has bands configured.
        </p>
      </div>
    );
  }

  const losses = perf.bands.map((b) => b.feedlineLossDb);
  const totalLossRangeDb = losses.length
    ? `${Math.min(...losses).toFixed(1)} - ${Math.max(...losses).toFixed(1)}`
    : "";

  const bandLossData = perf.bands.map((b) => ({
    band: b.band,
    lossDb: b.feedlineLossDb,
  }));

  return (
    <div className="space-y-4">
      {/* Band capability strip */}
      <div className="bg-panel/30 backdrop-blur-sm border border-su-line/20 rounded-2xl p-4">
        <h4 className="text-xs font-semibold text-su-muted uppercase tracking-wider mb-3">
          Band Capability
        </h4>
        <BandCapabilityStrip bands={bandLossData} />
      </div>

      {/* System summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {perf.bestBand && (
          <div className="bg-panel/30 backdrop-blur-sm border border-su-line/20 rounded-2xl p-4">
            <div className="text-xs text-su-muted mb-1">Best Band</div>
            <div className="text-lg font-bold text-signal-green">
              {perf.bestBand.band}
            </div>
            <div className="text-xs text-su-muted">
              {formatWatts(perf.bestBand.erpWatts)} ERP
            </div>
          </div>
        )}
        {perf.worstBand && (
          <div className="bg-panel/30 backdrop-blur-sm border border-su-line/20 rounded-2xl p-4">
            <div className="text-xs text-su-muted mb-1">Worst Band</div>
            <div className="text-lg font-bold text-caution-yellow">
              {perf.worstBand.band}
            </div>
            <div className="text-xs text-su-muted">
              {formatWatts(perf.worstBand.erpWatts)} ERP
            </div>
          </div>
        )}
        {totalLossRangeDb && (
          <div className="bg-panel/30 backdrop-blur-sm border border-su-line/20 rounded-2xl p-4">
            <div className="text-xs text-su-muted mb-1">
              Feedline Loss Range
            </div>
            <div className="text-lg font-bold text-su-text">
              {totalLossRangeDb} dB
            </div>
            <div className="text-xs text-su-muted">Across all bands</div>
          </div>
        )}
      </div>

      {/* Per-band capability table */}
      <div className="bg-panel/30 backdrop-blur-sm border border-su-line/20 rounded-2xl p-4">
        <h4 className="text-xs font-semibold text-su-muted uppercase tracking-wider mb-3">
          Per-Band Performance
        </h4>
        <div className="overflow-x-auto -mx-4 px-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-su-line/40">
                <th className="text-left py-2 pr-3 text-xs text-su-muted font-medium whitespace-nowrap">
                  Band
                </th>
                <th className="text-right py-2 px-3 text-xs text-su-muted font-medium whitespace-nowrap">
                  TX Power
                </th>
                <th className="text-right py-2 px-3 text-xs text-su-muted font-medium whitespace-nowrap">
                  Feedline Loss
                </th>
                <th className="text-right py-2 px-3 text-xs text-su-muted font-medium whitespace-nowrap">
                  Acc. Gain/Loss
                </th>
                <th className="text-right py-2 px-3 text-xs text-su-muted font-medium whitespace-nowrap">
                  Power @ Ant.
                </th>
                <th className="text-right py-2 px-3 text-xs text-su-muted font-medium whitespace-nowrap">
                  Ant. Gain
                </th>
                <th className="text-right py-2 pl-3 text-xs text-su-muted font-medium whitespace-nowrap">
                  ERP
                </th>
              </tr>
            </thead>
            <tbody>
              {perf.bands.map((b) => (
                <tr
                  key={b.band}
                  className="border-b border-su-line/20 hover:bg-su-line/10 transition-colors"
                >
                  <td className="py-2 pr-3 font-medium text-su-text whitespace-nowrap">
                    {b.band}
                  </td>
                  <td className="py-2 px-3 text-right text-su-muted whitespace-nowrap">
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
                  <td className="py-2 px-3 text-right text-su-muted whitespace-nowrap">
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
