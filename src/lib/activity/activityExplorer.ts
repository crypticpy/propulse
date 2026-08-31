import type { LiveSpot, SpotSource } from "@/types/livespot";
import { getBandForFrequency } from "@/lib/data/bandRanges";
import { formatBearing, getBearing, getDistance } from "@/lib/utils/path";

export interface ActivityOrigin {
  lat: number;
  lon: number;
}

export type ActivityQuery =
  | { kind: "band"; band: string }
  | { kind: "frequency"; frequencyKHz: number; toleranceKHz: number };

export interface ActivityFilters {
  query: ActivityQuery;
  maxAgeMinutes: number;
  /** null means global; finite values require a located transmitter. */
  maxDistanceKm: number | null;
  now?: Date;
}

export interface ActivityResult {
  id: string;
  callsign: string;
  frequencyKHz: number;
  mode?: string;
  time: Date;
  lat?: number;
  lon?: number;
  locationApproximate: boolean;
  distanceKm: number | null;
  bearing: number | null;
  bearingLabel: string | null;
  heardBy: string[];
  sources: SpotSource[];
  reportCount: number;
  snr?: number;
}

/**
 * Accept operator-friendly input: values below 1000 are treated as MHz,
 * larger values as kHz, and an explicit MHz/kHz suffix always wins.
 */
export function parseActivityFrequency(input: string): number | null {
  const normalized = input.trim().toLowerCase().replace(/,/g, "");
  const match = normalized.match(/^([0-9]+(?:\.[0-9]+)?)\s*(mhz|khz)?$/);
  if (!match) return null;
  const value = Number(match[1]);
  if (!Number.isFinite(value) || value <= 0) return null;
  if (match[2] === "mhz") return value * 1000;
  if (match[2] === "khz") return value;
  return value < 1000 ? value * 1000 : value;
}

function hasCoordinates(spot: LiveSpot): spot is LiveSpot & {
  dxLat: number;
  dxLon: number;
} {
  return (
    Number.isFinite(spot.dxLat) &&
    Number.isFinite(spot.dxLon) &&
    spot.dxLat !== undefined &&
    spot.dxLon !== undefined
  );
}

function matchesQuery(spot: LiveSpot, query: ActivityQuery): boolean {
  if (query.kind === "band") {
    return (spot.band ?? getBandForFrequency(spot.frequency)) === query.band;
  }
  return (
    Math.abs(spot.frequency - query.frequencyKHz) <= query.toleranceKHz
  );
}

/**
 * Build a callsign-oriented activity list from PSKReporter, RBN, WSJT-X, and
 * cluster reports. Multiple receivers hearing the same transmission become
 * one row with a report count instead of visually flooding the operator.
 */
export function buildActivityResults(
  spots: LiveSpot[],
  origin: ActivityOrigin,
  filters: ActivityFilters,
): ActivityResult[] {
  const nowMs = (filters.now ?? new Date()).getTime();
  const cutoff = nowMs - filters.maxAgeMinutes * 60_000;
  const newestFirst = spots
    .filter((spot) => {
      const time = spot.time instanceof Date ? spot.time : new Date(spot.time);
      return (
        Number.isFinite(time.getTime()) &&
        time.getTime() >= cutoff &&
        time.getTime() <= nowMs + 60_000 &&
        Number.isFinite(spot.frequency) &&
        spot.frequency > 0 &&
        Boolean(spot.dx.trim()) &&
        matchesQuery(spot, filters.query)
      );
    })
    .sort((left, right) => right.time.getTime() - left.time.getTime());

  const grouped = new Map<
    string,
    ActivityResult & { heardBySet: Set<string>; sourceSet: Set<SpotSource> }
  >();

  for (const spot of newestFirst) {
    const located = hasCoordinates(spot);
    const distanceKm = located
      ? getDistance(origin.lat, origin.lon, spot.dxLat, spot.dxLon)
      : null;
    if (
      filters.maxDistanceKm !== null &&
      (distanceKm === null || distanceKm > filters.maxDistanceKm)
    ) {
      continue;
    }

    const callsign = spot.dx.trim().toUpperCase();
    // The question this surface answers is "who is active?". Keep one row per
    // callsign in the selected query and retain its newest reported frequency;
    // additional skimmers/receivers become evidence on that row.
    const key = callsign;
    const receiver = (spot.receiverCallsign ?? spot.spotter).trim().toUpperCase();
    const existing = grouped.get(key);
    if (existing) {
      existing.reportCount += 1;
      if (receiver) existing.heardBySet.add(receiver);
      existing.sourceSet.add(spot.source);
      continue;
    }

    const bearing = located
      ? getBearing(origin.lat, origin.lon, spot.dxLat, spot.dxLon)
      : null;
    grouped.set(key, {
      id: key,
      callsign,
      frequencyKHz: spot.frequency,
      mode: spot.mode,
      time: spot.time instanceof Date ? spot.time : new Date(spot.time),
      lat: located ? spot.dxLat : undefined,
      lon: located ? spot.dxLon : undefined,
      locationApproximate: Boolean(spot.dxLocApprox),
      distanceKm,
      bearing,
      bearingLabel: bearing === null ? null : formatBearing(bearing),
      heardBy: [],
      sources: [],
      reportCount: 1,
      snr: spot.snr,
      heardBySet: new Set(receiver ? [receiver] : []),
      sourceSet: new Set([spot.source]),
    });
  }

  return [...grouped.values()].map(({ heardBySet, sourceSet, ...result }) => ({
    ...result,
    heardBy: [...heardBySet],
    sources: [...sourceSet],
  }));
}
