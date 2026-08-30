/**
 * useBandActivity — per-band Activity Index feed (BH1).
 *
 * Backed by `/api/spots/band-activity`: trailing 60-min raw counts (the
 * climatology's population), 20-min deduplicated observations, trend
 * windows, and this hour's percentile thresholds. Same-population rule:
 * this endpoint is the only honest numerator for percentile claims — never
 * substitute the client's grid-scoped spot feeds.
 */

import { useQuery } from "@tanstack/react-query";

import {
  classifyActivityLevel,
  computeTrend,
  isCrowded,
  parseBandActivityEntry,
  type ActivityLevel,
  type ActivityTrend,
  type BandActivityEntry,
} from "@/lib/utils/bandActivity";

const MINUTE = 60 * 1000;

export interface BandActivityStatus extends BandActivityEntry {
  /** Percentile level vs this band × hour climatology; null = no baseline */
  level: ActivityLevel | null;
  trend: ActivityTrend;
  crowded: boolean;
}

async function fetchBandActivity(): Promise<Map<string, BandActivityStatus>> {
  const response = await fetch("/api/spots/band-activity");
  if (!response.ok) {
    throw new Error(`band-activity request failed (${response.status})`);
  }
  const payload = (await response.json()) as { bands?: unknown[] };
  const entries = Array.isArray(payload.bands) ? payload.bands : [];

  const byBand = new Map<string, BandActivityStatus>();
  for (const raw of entries) {
    const entry = parseBandActivityEntry(raw);
    if (!entry) continue;
    byBand.set(entry.band, {
      ...entry,
      level: classifyActivityLevel(
        entry.count60m,
        entry.thresholds,
        entry.sampleCount,
      ),
      trend: computeTrend(entry.count10mRecent, entry.count10mPrior),
      crowded: isCrowded(entry.count60m, entry.thresholds, entry.sampleCount),
    });
  }
  return byBand;
}

export function useBandActivity() {
  return useQuery({
    queryKey: ["band-activity"],
    queryFn: fetchBandActivity,
    refetchInterval: MINUTE,
    staleTime: 55 * 1000,
    retry: 1,
  });
}
