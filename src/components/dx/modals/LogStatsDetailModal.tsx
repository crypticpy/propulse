import { useMemo } from "react";
import { DetailModal } from "@/components/ui/DetailModal";
import { useLogbook } from "@/hooks/useLogbook";
import { getEntityFromCallsign } from "@/lib/utils/gridUtils";
import { getBandColor } from "@/lib/api/dxcluster";

export interface LogStatsDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
}

/** Canonical band order for sorting */
const BAND_ORDER = [
  "160m",
  "80m",
  "60m",
  "40m",
  "30m",
  "20m",
  "17m",
  "15m",
  "12m",
  "10m",
  "6m",
];

/**
 * LogStatsDetailModal
 *
 * Comprehensive logbook statistics modal opened from the LogStatsCard tile.
 * Displays summary counts, band breakdown bars, recent QSOs, and QSL stats.
 */
export function LogStatsDetailModal({
  isOpen,
  onClose,
}: LogStatsDetailModalProps) {
  const { entries } = useLogbook();

  // ---------------------------------------------------------------------------
  // Computed statistics
  // ---------------------------------------------------------------------------

  const stats = useMemo(() => {
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10); // YYYY-MM-DD

    // Week boundary: most recent Monday 00:00
    const dayOfWeek = now.getDay(); // 0=Sun
    const mondayOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - mondayOffset);
    weekStart.setHours(0, 0, 0, 0);
    const weekStartStr = weekStart.toISOString().slice(0, 10);

    // Month boundary
    const monthStartStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;

    let todayCount = 0;
    let weekCount = 0;
    let monthCount = 0;

    const entityNames = new Set<string>();

    // Band counts
    const bandCounts: Record<string, number> = {};

    // QSL counters
    let qslSentCount = 0;
    let qslRcvdCount = 0;
    let lotwCount = 0;
    let eqslCount = 0;
    let hasAnyQsl = false;

    for (const entry of entries) {
      // Time-based counts
      if (entry.date === todayStr) todayCount++;
      if (entry.date >= weekStartStr) weekCount++;
      if (entry.date >= monthStartStr) monthCount++;

      // DXCC entities
      const entity = getEntityFromCallsign(entry.callsign);
      if (entity) {
        entityNames.add(entity.name);
      }

      // Band counts
      if (entry.band) {
        bandCounts[entry.band] = (bandCounts[entry.band] || 0) + 1;
      }

      // QSL stats
      if (entry.qslSent === "Y") {
        qslSentCount++;
        hasAnyQsl = true;
      }
      if (entry.qslRcvd === "Y") {
        qslRcvdCount++;
        hasAnyQsl = true;
      }
      if (entry.lotw) {
        lotwCount++;
        hasAnyQsl = true;
      }
      if (entry.eqsl) {
        eqslCount++;
        hasAnyQsl = true;
      }
    }

    // Sort bands by canonical order
    const sortedBands = Object.entries(bandCounts).sort(([a], [b]) => {
      const ia = BAND_ORDER.indexOf(a);
      const ib = BAND_ORDER.indexOf(b);
      // Bands not in canonical list go to end
      return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
    });

    const maxBandCount = Math.max(...Object.values(bandCounts), 1);

    return {
      todayCount,
      weekCount,
      monthCount,
      dxccCount: entityNames.size,
      totalCount: entries.length,
      sortedBands,
      maxBandCount,
      recentQsos: entries.slice(0, 10),
      qslSentCount,
      qslRcvdCount,
      lotwCount,
      eqslCount,
      hasAnyQsl,
    };
  }, [entries]);

  return (
    <DetailModal
      isOpen={isOpen}
      onClose={onClose}
      title="Logbook Statistics"
      subtitle={`${stats.totalCount.toLocaleString()} total QSOs`}
      size="lg"
    >
      {entries.length === 0 ? (
        <p className="text-center text-gray-400 py-12">No QSOs logged yet</p>
      ) : (
        <div className="space-y-0">
          {/* ---- Summary Row ---- */}
          <div className="grid grid-cols-5 gap-3 text-center">
            {[
              { value: stats.todayCount, label: "Today" },
              { value: stats.weekCount, label: "Week" },
              { value: stats.monthCount, label: "Month" },
              { value: stats.dxccCount, label: "DXCC" },
              { value: stats.totalCount, label: "Total" },
            ].map(({ value, label }) => (
              <div key={label} className="bg-white/5 rounded-lg p-3">
                <div className="text-2xl font-bold font-mono tabular-nums text-white">
                  {value.toLocaleString()}
                </div>
                <div className="text-[10px] text-gray-400 uppercase">
                  {label}
                </div>
              </div>
            ))}
          </div>

          {/* ---- Band Breakdown ---- */}
          <div className="border-t border-white/10 pt-4 mt-4">
            <h3 className="text-xs font-semibold text-gray-300 uppercase tracking-wider mb-3">
              Band Breakdown
            </h3>
            <div className="space-y-2">
              {stats.sortedBands.map(([band, count]) => {
                const { color } = getBandColor(band);
                const widthPct = (count / stats.maxBandCount) * 100;

                return (
                  <div key={band} className="flex items-center gap-3">
                    <span className="w-10 text-xs font-mono text-gray-300 text-right shrink-0">
                      {band}
                    </span>
                    <div className="flex-1 h-5 bg-white/5 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${widthPct}%`,
                          backgroundColor: color,
                        }}
                      />
                    </div>
                    <span className="w-10 text-xs font-mono text-gray-400 shrink-0">
                      {count}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ---- Recent QSOs ---- */}
          <div className="border-t border-white/10 pt-4 mt-4">
            <h3 className="text-xs font-semibold text-gray-300 uppercase tracking-wider mb-3">
              Recent QSOs
            </h3>
            <div className="overflow-x-auto">
              {/* Header */}
              <div className="grid grid-cols-4 gap-2 px-2 py-1 text-[10px] text-gray-400 uppercase">
                <span>Callsign</span>
                <span>Band</span>
                <span>Mode</span>
                <span>Date</span>
              </div>
              {/* Rows */}
              {stats.recentQsos.map((entry, idx) => (
                <div
                  key={entry.id}
                  className={`grid grid-cols-4 gap-2 px-2 py-1.5 text-xs font-mono ${
                    idx % 2 === 1 ? "bg-white/[0.02]" : ""
                  }`}
                >
                  <span className="text-white truncate">{entry.callsign}</span>
                  <span className="text-gray-300">{entry.band}</span>
                  <span className="text-gray-300">{entry.mode}</span>
                  <span className="text-gray-400">{entry.date}</span>
                </div>
              ))}
            </div>
          </div>

          {/* ---- QSL Stats ---- */}
          {stats.hasAnyQsl && (
            <div className="border-t border-white/10 pt-4 mt-4">
              <h3 className="text-xs font-semibold text-gray-300 uppercase tracking-wider mb-3">
                QSL Statistics
              </h3>
              <div className="grid grid-cols-4 gap-3 text-center">
                {[
                  { value: stats.qslSentCount, label: "QSL Sent" },
                  { value: stats.qslRcvdCount, label: "QSL Rcvd" },
                  { value: stats.lotwCount, label: "LoTW" },
                  { value: stats.eqslCount, label: "eQSL" },
                ].map(({ value, label }) => (
                  <div key={label} className="bg-white/5 rounded-lg p-3">
                    <div className="text-2xl font-bold font-mono tabular-nums text-white">
                      {value.toLocaleString()}
                    </div>
                    <div className="text-[10px] text-gray-400 uppercase">
                      {label}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </DetailModal>
  );
}

export default LogStatsDetailModal;
