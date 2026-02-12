/**
 * Compute QSO statistics from local IndexedDB data.
 * Recomputes when refresh() is called.
 */

import { useState, useEffect, useCallback } from "react";
import type { QSOStats } from "@/types/qso";
import { getAllLogEntries } from "@/lib/db/logStore";

const EMPTY_STATS: QSOStats = {
  totalQsos: 0,
  uniqueCallsigns: 0,
  uniqueDxcc: 0,
  uniqueGrids: 0,
  bandBreakdown: {},
  modeBreakdown: {},
  dailyRate: 0,
  lastQso: null,
};

export function useQSOStats() {
  const [stats, setStats] = useState<QSOStats>(EMPTY_STATS);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const entries = await getAllLogEntries();
      if (entries.length === 0) {
        setStats(EMPTY_STATS);
        return;
      }

      const callsigns = new Set<string>();
      const dxccs = new Set<number>();
      const grids = new Set<string>();
      const bandCounts: Record<string, number> = {};
      const modeCounts: Record<string, number> = {};
      let lastQso: string | null = null;

      for (const e of entries) {
        callsigns.add(e.callsign.toUpperCase());
        if (e.dxcc) dxccs.add(e.dxcc);
        if (e.grid) grids.add(e.grid.substring(0, 4).toUpperCase());
        if (e.band) bandCounts[e.band] = (bandCounts[e.band] ?? 0) + 1;
        if (e.mode) modeCounts[e.mode] = (modeCounts[e.mode] ?? 0) + 1;
        if (!lastQso || e.createdAt > lastQso) lastQso = e.createdAt;
      }

      // Daily rate: total / days since first entry
      const firstEntry = entries.reduce((a, b) =>
        a.createdAt < b.createdAt ? a : b,
      );
      const daysSinceFirst = Math.max(
        1,
        (Date.now() - new Date(firstEntry.createdAt).getTime()) / 86_400_000,
      );

      setStats({
        totalQsos: entries.length,
        uniqueCallsigns: callsigns.size,
        uniqueDxcc: dxccs.size,
        uniqueGrids: grids.size,
        bandBreakdown: bandCounts,
        modeBreakdown: modeCounts,
        dailyRate: Math.round((entries.length / daysSinceFirst) * 10) / 10,
        lastQso,
      });
    } catch (err) {
      console.error("[useQSOStats] refresh failed:", err);
      setError(err instanceof Error ? err.message : "Failed to compute stats");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { stats, loading, error, refresh };
}
