import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useUTCClock } from "@/hooks/useUTCClock";
import { BAND_ORDER } from "@/lib/data/bandRanges";
import {
  baselineKey, buildBaselineLookup, latestCompleteHour, regionalHeatmapCells,
  REGIONAL_RATIO_LABEL, type BaselineInput, type BaselineLookup,
} from "@/lib/widgets/heatmap/baseline";
import { HEATMAP_CONTINENTS, type Continent } from "@/lib/widgets/heatmap/types";

const HOUR_MS = 3_600_000;
const EMPTY_BASELINE: BaselineLookup = new Map();

function compatibleIdentity(row: Record<string, unknown>): boolean {
  return typeof row.band === "string" && BAND_ORDER.some((band) => band === row.band) &&
    HEATMAP_CONTINENTS.includes(row.continent as Continent);
}

function baselineInputs(rows: unknown[]): BaselineInput[] {
  const inputs: BaselineInput[] = [];
  for (const raw of rows) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const row = raw as Record<string, unknown>;
    if (!compatibleIdentity(row) ||
      typeof row.hour_of_day !== "number" || !Number.isInteger(row.hour_of_day) ||
      row.hour_of_day < 0 || row.hour_of_day > 23 ||
      typeof row.p50 !== "number" || !Number.isFinite(row.p50) || row.p50 < 0 ||
      typeof row.sample_count !== "number" || !Number.isInteger(row.sample_count) ||
      row.sample_count < 14) continue;
    // Both sides count full-hour regional raw spots across the collector's
    // sources and endpoint continents; p50 supplies the 90-day median.
    inputs.push({ band: row.band as string, continent: row.continent as Continent,
      utcHour: row.hour_of_day, meanCount: row.p50 });
  }
  return inputs;
}

export function buildHeatMapBaseline(rows: unknown[]): BaselineLookup {
  return buildBaselineLookup(baselineInputs(rows));
}

export interface HeatMapSnapshot {
  baseline: BaselineLookup;
  current: ReadonlyMap<string, number>;
  hourUtc: string;
  fetchedAt: string;
  computedAt: string | null;
  unavailableLabel: string | null;
}

const NEEDS_MORE_SAMPLES = "NEEDS 14 BASELINE SAMPLES";
const NO_BASELINE_THIS_HOUR = "NO BASELINE FOR THIS UTC HOUR";

/**
 * @param ageMs CDN `Age` header (seconds -> ms) at receipt time. The origin's
 * `fetchedAt` is stamped when the edge function computed the body, but the
 * response carries `s-maxage`, so a client can receive a body up to an hour
 * old. Without this correction the hour-validity check below compares the
 * *origin's* position in the hour instead of the client's, and a stale cache
 * hit can never trip `REGIONAL HOUR OUT OF DATE`.
 */
export function buildHeatMapSnapshot(payload: unknown, ageMs = 0): HeatMapSnapshot {
  if (!payload || typeof payload !== "object" || !("baseline" in payload) ||
    !Array.isArray(payload.baseline) || !("current" in payload) || !Array.isArray(payload.current) ||
    !("meta" in payload) || !payload.meta || typeof payload.meta !== "object") {
    throw new Error("Invalid heatmap-baseline response");
  }
  const meta = payload.meta as Record<string, unknown>;
  const hourMs = typeof meta.hour_utc === "string" ? Date.parse(meta.hour_utc) : NaN;
  if (!Number.isFinite(hourMs) || hourMs % HOUR_MS !== 0) throw new Error("Invalid regional hour");
  const hourUtc = new Date(hourMs).toISOString();
  const originFetchedMs = typeof meta.fetchedAt === "string" ? Date.parse(meta.fetchedAt) : NaN;
  if (!Number.isFinite(originFetchedMs)) throw new Error("Invalid regional fetch timestamp");
  const fetchedMs = originFetchedMs + Math.max(0, ageMs);
  const fetchedAt = new Date(fetchedMs).toISOString();
  const utcHour = new Date(hourMs).getUTCHours();
  const baseline = buildHeatMapBaseline(payload.baseline);
  const current = new Map<string, number>();
  for (const raw of payload.current) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const row = raw as Record<string, unknown>;
    if (!compatibleIdentity(row) || typeof row.hour_utc !== "string" ||
      Date.parse(row.hour_utc) !== hourMs || typeof row.spot_count !== "number" ||
      !Number.isSafeInteger(row.spot_count) || row.spot_count < 0) continue;
    current.set(baselineKey(row.band as string, row.continent as Continent, utcHour), row.spot_count);
  }
  const computedAt = typeof meta.computedAt === "string" && Number.isFinite(Date.parse(meta.computedAt))
    ? meta.computedAt : null;
  const compatibleSamples = payload.baseline.some((raw) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return false;
    const row = raw as Record<string, unknown>;
    return compatibleIdentity(row) && typeof row.sample_count === "number" &&
      Number.isInteger(row.sample_count) && row.sample_count >= 0 && row.sample_count < 14;
  });
  const matchedHour = [...baseline.keys()].some((key) => key.endsWith(`|${utcHour}`));
  const unavailableLabel = hourUtc !== latestCompleteHour(fetchedMs) ? "REGIONAL HOUR OUT OF DATE"
    : payload.current.length === 0 ? "NO COMPLETE-HOUR DATA (COLLECTOR GAP)"
    : current.size === 0 ? "NO COMPATIBLE REGIONAL DATA"
    : payload.baseline.length === 0 ? "NO BASELINE DATA"
    : baseline.size === 0 ? compatibleSamples ? NEEDS_MORE_SAMPLES : "NO COMPATIBLE BASELINE DATA"
    : !matchedHour ? NO_BASELINE_THIS_HOUR
    : !computedAt ? "BASELINE AGE UNAVAILABLE" : null;
  return { baseline, current, hourUtc, fetchedAt, computedAt, unavailableLabel };
}

async function fetchHeatMapBaseline(signal: AbortSignal): Promise<HeatMapSnapshot> {
  const response = await fetch("/api/spots/heatmap-baseline", { signal });
  if (!response.ok) throw new Error(`heatmap-baseline request failed (${response.status})`);
  const ageMs = Number(response.headers.get("age") ?? 0) * 1000;
  return buildHeatMapSnapshot(await response.json(), ageMs);
}

/** The two "waiting on the collector's climatology job" states resolve only
 * at the next UTC hour, same as the healthy case; every other unavailable
 * state (including the collector-gap read) keeps the 60 s poll. Named rather
 * than repeated as literals so rewording the operator-facing copy cannot
 * silently drop a state back to the 60 s poll. */
const HOUR_BOUNDARY_LABELS: ReadonlySet<string> = new Set([
  NEEDS_MORE_SAMPLES,
  NO_BASELINE_THIS_HOUR,
]);

/** Pure so item 4's back-off can be asserted without driving react-query's
 * own refetch scheduler. `fetchedAt` already carries the CDN `Age`
 * correction (see `buildHeatMapSnapshot`), so adding client-side elapsed
 * time here lands on the true next hour boundary. */
export function heatMapRefetchDelayMs(
  snapshot: HeatMapSnapshot | undefined,
  dataUpdatedAt: number,
  now: number,
): number {
  if (!snapshot) return 60_000;
  if (snapshot.unavailableLabel && !HOUR_BOUNDARY_LABELS.has(snapshot.unavailableLabel)) return 60_000;
  const elapsed = Math.max(0, now - dataUpdatedAt);
  const serverNow = Date.parse(snapshot.fetchedAt) + elapsed;
  return Math.max(1000, HOUR_MS - (serverNow % HOUR_MS));
}

function utcLabel(timestamp: string): string {
  return `${new Date(timestamp).toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

/**
 * @param options.enabled Defaults to `true`. Pass `false` to call the hook
 * unconditionally from a component that only needs the baseline for one of
 * several rendered states (e.g. a preset switch), without triggering the
 * fetch until that state is actually selected.
 */
export function useHeatMapBaseline(options?: { enabled?: boolean }) {
  const enabled = options?.enabled ?? true;
  const now = useUTCClock(60_000);
  const query = useQuery({
    queryKey: ["heatmap-baseline"],
    queryFn: ({ signal }) => fetchHeatMapBaseline(signal),
    staleTime: HOUR_MS,
    enabled,
    // Server boundary plus elapsed client time, not the client's UTC hour.
    refetchInterval: (entry) => heatMapRefetchDelayMs(entry.state.data, entry.state.dataUpdatedAt, Date.now()),
    retry: 1,
  });
  const snapshot = query.isError ? undefined : query.data;
  const unavailableLabel = query.isError ? "REGIONAL DATA UNAVAILABLE"
    : query.isPending ? "REGIONAL DATA LOADING"
    : snapshot?.unavailableLabel ?? null;
  const available = unavailableLabel === null;
  const regionalCells = useMemo(() => available && snapshot
    ? regionalHeatmapCells(snapshot.baseline, snapshot.current, snapshot.hourUtc) : [], [available, snapshot]);
  const serverNow = snapshot ? Date.parse(snapshot.fetchedAt) + Math.max(0, now.getTime() - query.dataUpdatedAt) : null;
  const ageMinutes = snapshot?.computedAt && serverNow !== null ? Math.max(0, Math.floor((serverNow - Date.parse(snapshot.computedAt)) / 60_000)) : null;
  const age = ageMinutes === null ? "" : ageMinutes < 60 ? `${ageMinutes} MIN AGO` : `${Math.floor(ageMinutes / 60)} H AGO`;
  return {
    ...query, baseline: snapshot?.baseline ?? EMPTY_BASELINE, regionalCells,
    available, unavailableLabel, hourUtc: snapshot?.hourUtc ?? null,
    basisLabel: snapshot ? `${REGIONAL_RATIO_LABEL} \u00b7 as of ${utcLabel(snapshot.hourUtc)}` : REGIONAL_RATIO_LABEL,
    baselineAgeLabel: snapshot?.computedAt ? `BASELINE AS OF ${utcLabel(snapshot.computedAt)} (${age})` : "BASELINE AGE UNAVAILABLE",
  };
}
