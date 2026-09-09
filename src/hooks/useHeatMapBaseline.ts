import { useQuery } from "@tanstack/react-query";
import { BAND_ORDER } from "@/lib/data/bandRanges";
import {
  buildBaselineLookup,
  type BaselineInput,
  type BaselineLookup,
} from "@/lib/widgets/heatmap/baseline";
import { HEATMAP_CONTINENTS, type Continent } from "@/lib/widgets/heatmap/types";

const HOUR_MS = 60 * 60 * 1000;
const EMPTY_BASELINE: BaselineLookup = new Map();

export function buildHeatMapBaseline(rows: unknown[]): BaselineLookup {
  const inputs: BaselineInput[] = [];
  for (const raw of rows) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const row = raw as Record<string, unknown>;
    if (
      typeof row.band !== "string" || !BAND_ORDER.some((band) => band === row.band) ||
      !HEATMAP_CONTINENTS.includes(row.continent as Continent) ||
      typeof row.hour_of_day !== "number" || !Number.isInteger(row.hour_of_day) ||
      row.hour_of_day < 0 || row.hour_of_day > 23 ||
      typeof row.p50 !== "number" || !Number.isFinite(row.p50) || row.p50 < 0 ||
      typeof row.sample_count !== "number" || !Number.isInteger(row.sample_count) ||
      row.sample_count < 14
    ) continue;
    inputs.push({
      band: row.band,
      continent: row.continent as Continent,
      utcHour: row.hour_of_day,
      // The existing 90-day climatology supplies a median, not an arithmetic
      // mean. The smoothed log2 ratio accepts p50 through the meanCount field.
      meanCount: row.p50,
    });
  }
  return buildBaselineLookup(inputs);
}

async function fetchHeatMapBaseline(signal: AbortSignal): Promise<BaselineLookup> {
  const response = await fetch("/api/spots/heatmap-baseline", { signal });
  if (!response.ok) throw new Error(`heatmap-baseline request failed (${response.status})`);
  const payload: unknown = await response.json();
  if (!payload || typeof payload !== "object" ||
    !("rows" in payload) || !Array.isArray(payload.rows)) {
    throw new Error("Invalid heatmap-baseline response");
  }
  return buildHeatMapBaseline(payload.rows);
}

export function useHeatMapBaseline() {
  const query = useQuery({
    queryKey: ["heatmap-baseline"],
    queryFn: ({ signal }) => fetchHeatMapBaseline(signal),
    staleTime: HOUR_MS,
    refetchInterval: HOUR_MS,
    retry: 1,
  });
  // React Query retains data on a failed refetch. A failed request must
  // disable the ratio rather than continue to present the retained baseline.
  const baseline = query.isError ? EMPTY_BASELINE : query.data ?? EMPTY_BASELINE;
  const unavailableLabel = query.isError
    ? "BASELINE UNAVAILABLE"
    : query.isPending
      ? "BASELINE LOADING"
      : baseline.size === 0 ? "NEEDS 14 BASELINE SAMPLES" : null;
  return { ...query, baseline, unavailableLabel };
}
