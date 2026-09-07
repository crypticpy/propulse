import { useQuery } from "@tanstack/react-query";
import {
  parseStoredBandHistory,
  type BandHistorySnapshot,
} from "@/lib/hamclock/bandHistory";

export async function fetchBandHistory(): Promise<BandHistorySnapshot> {
  const response = await fetch("/api/spots/band-history");
  if (!response.ok)
    throw new Error(`Band history unavailable (${response.status})`);
  const value = await response.json();
  if (
    value?.scope !== "global" ||
    !Array.isArray(value.rows) ||
    value.rows.length > 72 ||
    typeof value.windowStart !== "string" ||
    typeof value.windowEnd !== "string" ||
    Date.parse(value.windowEnd) - Date.parse(value.windowStart) !==
      6 * 3_600_000 ||
    Date.parse(value.windowStart) % 3_600_000 !== 0 ||
    typeof value.fetchedAt !== "string" ||
    !Number.isFinite(Date.parse(value.fetchedAt))
  )
    throw new Error("Invalid band history");
  const rows = value.rows.map((row: Record<string, unknown>) =>
    parseStoredBandHistory({
      hour_utc: row?.hour,
      band: row?.band,
      spot_count: row?.count,
      source_counts: row?.sources,
      mode_counts: row?.modes,
    }),
  );
  const seen = new Set<string>();
  for (const row of rows) {
    if (!row || Date.parse(row.hour) < Date.parse(value.windowStart) ||
      Date.parse(row.hour) >= Date.parse(value.windowEnd) ||
      seen.has(`${row.hour}/${row.band}`))
      throw new Error("Invalid band history rows");
    seen.add(`${row.hour}/${row.band}`);
  }
  return {
    rows,
    scope: "global",
    windowStart: value.windowStart,
    windowEnd: value.windowEnd,
    fetchedAt: value.fetchedAt,
  };
}

export function useBandHistory(enabled: boolean) {
  return useQuery({
    queryKey: ["hamclock-band-history"],
    queryFn: fetchBandHistory,
    enabled,
    refetchInterval: 60_000,
    staleTime: 55_000,
    retry: 1,
  });
}
