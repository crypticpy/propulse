/**
 * Upcoming orbital launches from Launch Library 2 via `/api/events/launches`.
 * The edge function caches 15 minutes; the client polls on that same cadence.
 */

import { useQuery } from "@tanstack/react-query";

const MINUTE = 60 * 1000;

export type LaunchTimePrecision =
  | "second"
  | "minute"
  | "hour"
  | "day"
  | "coarser"
  | "unknown";

export interface LaunchRecord {
  id: string;
  name: string;
  provider: string;
  providerAbbrev: string;
  pad: string;
  location: string;
  net: string | null;
  windowStart: string | null;
  windowEnd: string | null;
  status: string;
  statusName: string;
  precision: LaunchTimePrecision;
  webcastLive: boolean;
  sourceUpdatedAt: string | null;
}

export interface LaunchesPayload {
  status: "ok" | "stale" | "unavailable";
  stale: boolean;
  retrievedAt: string;
  launches: LaunchRecord[];
}

export const LAUNCHES_QUERY_KEY = ["launches"] as const;

const EMPTY: LaunchesPayload = {
  status: "unavailable",
  stale: false,
  retrievedAt: "",
  launches: [],
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asLaunch(value: unknown): LaunchRecord | null {
  if (!isRecord(value)) return null;
  const id = asString(value.id);
  const name = asString(value.name);
  if (!id || !name) return null;
  const precision = asString(value.precision);
  const allowed: LaunchTimePrecision[] = [
    "second",
    "minute",
    "hour",
    "day",
    "coarser",
    "unknown",
  ];
  return {
    id,
    name,
    provider: asString(value.provider),
    providerAbbrev: asString(value.providerAbbrev),
    pad: asString(value.pad),
    location: asString(value.location),
    net: asString(value.net) || null,
    windowStart: asString(value.windowStart) || null,
    windowEnd: asString(value.windowEnd) || null,
    status: asString(value.status),
    statusName: asString(value.statusName),
    precision: allowed.includes(precision as LaunchTimePrecision)
      ? (precision as LaunchTimePrecision)
      : "unknown",
    webcastLive: value.webcastLive === true,
    sourceUpdatedAt: asString(value.sourceUpdatedAt) || null,
  };
}

export const POST_NET_WINDOW_MS = 2 * 60 * 60 * 1000;

function formatSpan(minutes: number): string {
  const whole = Math.max(0, Math.round(minutes));
  if (whole < 60) return `${whole}m`;
  const hours = Math.floor(whole / 60);
  if (hours >= 24) return `${Math.floor(hours / 24)}d ${hours % 24}h`;
  return `${hours}h ${whole % 60}m`;
}

export function parseLaunchesPayload(raw: unknown): LaunchesPayload {
  if (!isRecord(raw)) return EMPTY;
  const launches = Array.isArray(raw.launches)
    ? raw.launches.map(asLaunch).filter((row): row is LaunchRecord => row !== null)
    : [];
  const status =
    raw.status === "ok" || raw.status === "stale" || raw.status === "unavailable"
      ? raw.status
      : launches.length > 0
        ? "ok"
        : "unavailable";
  return {
    status,
    stale: raw.stale === true || status === "stale",
    retrievedAt: asString(raw.retrievedAt),
    launches,
  };
}

async function fetchLaunches(signal?: AbortSignal): Promise<LaunchesPayload> {
  const res = await fetch("/api/events/launches", { signal });
  if (!res.ok) throw new Error(`Launch fetch failed: ${res.status}`);
  return parseLaunchesPayload(await res.json());
}

/** Precise enough to count down; TBD/TBC windows never get a ticking T-minus. */
export function countdownAllowed(launch: LaunchRecord): boolean {
  if (!launch.net) return false;
  const status = launch.status.toUpperCase();
  if (status === "TBD" || status === "TBC") return false;
  return (
    launch.precision === "second" ||
    launch.precision === "minute" ||
    launch.precision === "hour"
  );
}

export function launchProvider(launch: LaunchRecord): string {
  return launch.providerAbbrev || launch.provider || "—";
}

export function launchPad(launch: LaunchRecord): string {
  return launch.pad || launch.location || "—";
}

export function isLaunchCurrent(launch: LaunchRecord, now: Date): boolean {
  const status = launch.status.toUpperCase();
  if (launch.webcastLive || status === "IN FLIGHT") {
    return (
      !launch.net ||
      now.getTime() - Date.parse(launch.net) <= POST_NET_WINDOW_MS
    );
  }
  if (!launch.net) return true;
  const net = Date.parse(launch.net);
  if (!Number.isFinite(net)) return true;
  return now.getTime() - net <= POST_NET_WINDOW_MS;
}

export function pickNextLaunch(
  launches: readonly LaunchRecord[],
  now: Date,
): LaunchRecord | null {
  return launches.find((row) => isLaunchCurrent(row, now)) ?? null;
}

export function launchTimingLabel(launch: LaunchRecord, now: Date): string {
  const status = launch.status.toUpperCase();
  if (
    (launch.webcastLive || status === "IN FLIGHT") &&
    (!launch.net ||
      now.getTime() - Date.parse(launch.net) <= POST_NET_WINDOW_MS)
  ) {
    return "LIVE";
  }
  if (!countdownAllowed(launch) || !launch.net) {
    return launch.net ? netDateLabel(launch.net, now) : status || "TBD";
  }
  const minutes = (Date.parse(launch.net) - now.getTime()) / 60_000;
  if (minutes > 0) return `T- ${formatSpan(minutes)}`;
  if (now.getTime() - Date.parse(launch.net) <= POST_NET_WINDOW_MS) {
    return `T+ ${formatSpan(-minutes)}`;
  }
  return netDateLabel(launch.net, now);
}

const UTC_MONTHS = [
  "JAN",
  "FEB",
  "MAR",
  "APR",
  "MAY",
  "JUN",
  "JUL",
  "AUG",
  "SEP",
  "OCT",
  "NOV",
  "DEC",
] as const;

export function netDateLabel(netIso: string, now: Date): string {
  const net = new Date(netIso);
  if (Number.isNaN(net.getTime())) return "—";
  const day = net.getUTCDate();
  const month = UTC_MONTHS[net.getUTCMonth()];
  if (net.getUTCFullYear() === now.getUTCFullYear()) {
    return `${day} ${month}`;
  }
  return `${day} ${month} ${net.getUTCFullYear()}`;
}

export interface UseLaunchesResult {
  launches: LaunchRecord[];
  next: LaunchRecord | null;
  status: LaunchesPayload["status"];
  stale: boolean;
  retrievedAt: string | null;
  isLoading: boolean;
  error: Error | null;
}

export function useLaunches(enabled = true): UseLaunchesResult {
  const { data, isLoading, error } = useQuery({
    queryKey: LAUNCHES_QUERY_KEY,
    queryFn: ({ signal }) => fetchLaunches(signal),
    enabled,
    staleTime: 15 * MINUTE,
    gcTime: 30 * MINUTE,
    refetchInterval: enabled ? 15 * MINUTE : false,
    refetchOnWindowFocus: false,
    retry: 1,
  });

  const payload = data ?? EMPTY;
  const next = pickNextLaunch(payload.launches, new Date());
  return {
    launches: payload.launches,
    next,
    status: payload.status,
    stale: payload.stale,
    retrievedAt: payload.retrievedAt || null,
    isLoading,
    error: error instanceof Error ? error : error ? new Error(String(error)) : null,
  };
}
