/**
 * useDxpeditions Hook
 *
 * Fetches the upcoming/active DXpedition schedule (NG3K ADXO) via the
 * /api/dx/dxpeditions edge proxy. The upstream page is scraped and cached
 * server-side for 6h, so client polling stays coarse.
 *
 * @module hooks/useDxpeditions
 */

import { useQuery } from "@tanstack/react-query";

const MINUTE = 60 * 1000;

export interface DxpeditionEntry {
  callsign: string;
  entity: string;
  startDate: string; // ISO yyyy-mm-dd
  endDate: string; // ISO yyyy-mm-dd
  bands: string;
  modes: string;
  qslInfo: string;
  info: string;
  source: "NG3K ADXO";
}

export type DxpeditionsStatus = "ok" | "unreachable" | "too_large" | "empty";

interface DxpeditionsResponse {
  status: DxpeditionsStatus;
  dxpeditions: DxpeditionEntry[];
}

function isoParts(iso: string): { y: number; m: number; d: number } {
  const [y, m, d] = iso.split("-").map(Number);
  return { y, m, d };
}

function monthDay(y: number, m: number, d: number): string {
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function dayOnly(y: number, m: number, d: number): string {
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    day: "numeric",
    timeZone: "UTC",
  });
}

/**
 * Compact date-range label: "Sep 3–14" when start/end share a month,
 * "Aug 28–Sep 5" across months, "Dec 30, 2026–Jan 4, 2027" across years.
 */
export function formatDateRange(startIso: string, endIso: string): string {
  const start = isoParts(startIso);
  const end = isoParts(endIso);
  const startLabel = monthDay(start.y, start.m, start.d);

  if (start.y !== end.y) {
    return `${startLabel}, ${start.y}–${monthDay(end.y, end.m, end.d)}, ${end.y}`;
  }
  if (start.m !== end.m) {
    return `${startLabel}–${monthDay(end.y, end.m, end.d)}`;
  }
  return `${startLabel}–${dayOnly(end.y, end.m, end.d)}`;
}

export interface PartitionedDxpedition {
  entry: DxpeditionEntry;
  isActive: boolean;
}

/**
 * Splits entries into active-first order (startDate <= todayIso <= endDate
 * counts as active). Each group preserves the incoming (already
 * start-date-sorted) order.
 */
export function partitionActive(
  entries: DxpeditionEntry[],
  todayIso: string,
): PartitionedDxpedition[] {
  const active: PartitionedDxpedition[] = [];
  const upcoming: PartitionedDxpedition[] = [];
  for (const entry of entries) {
    const isActive = entry.startDate <= todayIso && todayIso <= entry.endDate;
    (isActive ? active : upcoming).push({ entry, isActive });
  }
  return [...active, ...upcoming];
}

export function useDxpeditions() {
  const { data, isLoading, error } = useQuery<DxpeditionsResponse>({
    queryKey: ["dxpeditions"],
    queryFn: async ({ signal }) => {
      const res = await fetch("/api/dx/dxpeditions", { signal });
      if (!res.ok) throw new Error(`DXpeditions fetch failed: ${res.status}`);
      return res.json();
    },
    staleTime: 60 * MINUTE,
    gcTime: 90 * MINUTE,
    refetchInterval: 60 * MINUTE,
    refetchOnWindowFocus: false,
    retry: 2,
  });

  return {
    entries: data?.dxpeditions ?? [],
    status: data?.status ?? "ok",
    isLoading,
    error: error as Error | null,
  };
}

export default useDxpeditions;
