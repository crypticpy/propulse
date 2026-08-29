/**
 * useVolcanoes -- TanStack Query hook for USGS elevated volcano alerts
 * (E6 parity)
 *
 * Fetches the current list of US volcanoes at an elevated alert level via
 * the /api/atmos/volcanoes edge proxy. Unlike station-local hooks, this data
 * is not scoped to the operator's QTH, so it is not location-gated.
 *
 * @module hooks/useVolcanoes
 */

import { useQuery } from "@tanstack/react-query";

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

export type VolcanoAlertLevel = "NORMAL" | "ADVISORY" | "WATCH" | "WARNING";
export type VolcanoColorCode = "GREEN" | "YELLOW" | "ORANGE" | "RED";

export interface Volcano {
  volcanoName: string;
  obsAbbr: string;
  alertLevel: string;
  colorCode: string;
  lat: number | null;
  lon: number | null;
  lastUpdate: string | null;
}

export interface VolcanoSeverityPartition {
  /** WATCH/WARNING alert level or ORANGE/RED color code. */
  severe: Volcano[];
  /** Elevated but not severe (e.g. ADVISORY/YELLOW). */
  elevated: Volcano[];
}

const SEVERE_ALERT_LEVELS = new Set(["WATCH", "WARNING"]);
const SEVERE_COLOR_CODES = new Set(["ORANGE", "RED"]);
const NORMAL_ALERT_LEVELS = new Set(["NORMAL"]);
const NORMAL_COLOR_CODES = new Set(["GREEN"]);

function isSevere(volcano: Volcano): boolean {
  return (
    SEVERE_ALERT_LEVELS.has(volcano.alertLevel) ||
    SEVERE_COLOR_CODES.has(volcano.colorCode)
  );
}

function isNormal(volcano: Volcano): boolean {
  return (
    NORMAL_ALERT_LEVELS.has(volcano.alertLevel) &&
    NORMAL_COLOR_CODES.has(volcano.colorCode)
  );
}

/**
 * Splits volcanoes into `severe` (WATCH/WARNING alert level, or ORANGE/RED
 * color code) and `elevated` (any other non-NORMAL/GREEN entry, e.g.
 * ADVISORY/YELLOW). NORMAL/GREEN entries are dropped from both buckets.
 */
export function partitionBySeverity(volcanoes: Volcano[]): VolcanoSeverityPartition {
  const severe: Volcano[] = [];
  const elevated: Volcano[] = [];

  for (const volcano of volcanoes) {
    if (isSevere(volcano)) {
      severe.push(volcano);
    } else if (!isNormal(volcano)) {
      elevated.push(volcano);
    }
  }

  return { severe, elevated };
}

interface VolcanoResponse {
  volcanoes?: Volcano[];
}

async function fetchVolcanoes(signal?: AbortSignal): Promise<Volcano[]> {
  const res = await fetch("/api/atmos/volcanoes", { signal });
  if (!res.ok) throw new Error(`Volcano fetch failed: ${res.status}`);

  const data: VolcanoResponse = await res.json();
  return Array.isArray(data.volcanoes) ? data.volcanoes : [];
}

export interface UseVolcanoesResult {
  volcanoes: Volcano[];
  isLoading: boolean;
  error: Error | null;
}

export function useVolcanoes(enabled = true): UseVolcanoesResult {
  const { data, isLoading, error } = useQuery<Volcano[]>({
    queryKey: ["volcanoes"],
    queryFn: ({ signal }) => fetchVolcanoes(signal),
    enabled,
    staleTime: HOUR,
    gcTime: 2 * HOUR,
    refetchInterval: enabled ? HOUR : false,
    refetchOnWindowFocus: false,
    retry: 2,
  });

  return {
    volcanoes: data ?? [],
    isLoading,
    error: error as Error | null,
  };
}
