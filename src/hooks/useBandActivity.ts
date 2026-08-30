/**
 * useBandActivity — per-band Activity Index feed (BH1) + scoped counts (BH2).
 *
 * Backed by `/api/spots/band-activity`: trailing 60-min raw counts (the
 * climatology's population), 20-min deduplicated observations + mode-class
 * breakdown, trend windows, and this hour's percentile thresholds.
 * Same-population rule: this endpoint is the only honest numerator for
 * percentile claims — never substitute the client's grid-scoped spot feeds.
 *
 * Scope selects the population (§4): global (default), one continent
 * (Regional), or a Maidenhead field pair in both directions (DX).
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
import type { ContinentCode } from "@/lib/utils/continent";

const MINUTE = 60 * 1000;

export type BandActivityScope =
  | { type: "global" }
  | { type: "regional"; continent: ContinentCode }
  | { type: "pair"; txField: string; rxField: string };

export interface BandActivityStatus extends BandActivityEntry {
  /** Percentile level vs this scope × hour climatology; null = no baseline */
  level: ActivityLevel | null;
  trend: ActivityTrend;
  crowded: boolean;
}

export function scopeQueryString(scope: BandActivityScope): string {
  if (scope.type === "regional") {
    return `?continent=${encodeURIComponent(scope.continent)}`;
  }
  if (scope.type === "pair") {
    return `?tx_field=${encodeURIComponent(scope.txField)}&rx_field=${encodeURIComponent(scope.rxField)}`;
  }
  return "";
}

async function fetchBandActivity(
  scope: BandActivityScope,
): Promise<Map<string, BandActivityStatus>> {
  const response = await fetch(
    `/api/spots/band-activity${scopeQueryString(scope)}`,
  );
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

const GLOBAL_SCOPE: BandActivityScope = { type: "global" };

export function useBandActivity(
  scope: BandActivityScope = GLOBAL_SCOPE,
  enabled = true,
) {
  return useQuery({
    queryKey: ["band-activity", scopeQueryString(scope)],
    queryFn: () => fetchBandActivity(scope),
    refetchInterval: MINUTE,
    staleTime: 55 * 1000,
    retry: 1,
    enabled,
  });
}
