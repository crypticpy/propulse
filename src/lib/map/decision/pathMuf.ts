import { calculateFOT, calculateHPF, calculateLUF } from "@/lib/api/muf";
import {
  calculateReflectionPoints,
  evaluateHopQuality,
} from "@/lib/utils/rayTrace";
import { getDistance } from "@/lib/utils/path";
import type { PathMufHop, PathMufSample } from "./types";
import type { OperatingMode } from "@/types/signal";

const EARTH_RADIUS_KM = 6371;
const EARTH_CIRCUMFERENCE_KM = 2 * Math.PI * EARTH_RADIUS_KM;
const TYPICAL_F2_HOP_KM = 3000;
const MAX_HOPS = 12;
/** Probe frequency for hop absorption only; hop MUF is geometry × foF2. */
const PROBE_MHZ = 14.1;

export interface SamplePathMufInput {
  startLat: number;
  startLon: number;
  endLat: number;
  endLon: number;
  date: Date;
  sfi: number;
  kp: number;
  /** When true, Kp was defaulted (not supplied by the caller). */
  kpAssumed?: boolean;
  txPowerWatts?: number;
  mode?: OperatingMode;
  pathMode?: "short" | "long";
  sfiObservedAt?: string | null;
  sfiFetchedAt?: string | null;
  /** Wall-clock of this sample; used for fetchedAt when the flux fetch time is unknown. */
  computedAt?: Date;
}

function hopCount(totalDistanceKm: number): number {
  return Math.max(
    1,
    Math.min(MAX_HOPS, Math.ceil(totalDistanceKm / TYPICAL_F2_HOP_KM)),
  );
}

function totalDistanceKm(
  startLat: number,
  startLon: number,
  endLat: number,
  endLon: number,
  pathMode: "short" | "long",
): number {
  const shortKm = getDistance(startLat, startLon, endLat, endLon);
  return pathMode === "long" ? EARTH_CIRCUMFERENCE_KM - shortKm : shortKm;
}

/**
 * Path MUF is the minimum hop MUF along the great-circle control points
 * from the ray-trace engine — not the midpoint-only estimate.
 *
 * Returns `null` when the ray-trace engine yields no control points, because
 * then there is no hop to take a minimum over and no limiting hop to name. A
 * circuit whose endpoints determine no great circle is the case that reaches
 * this, and it is a real answer rather than a failure: there is no path to
 * report a MUF for. Every consumer already holds the result as
 * `PathMufSample | null`, so nothing downstream changes shape.
 */
export function samplePathMuf(input: SamplePathMufInput): PathMufSample | null {
  const pathMode = input.pathMode ?? "short";
  const mode = input.mode ?? "SSB";
  const txPowerWatts = input.txPowerWatts ?? 100;
  const distanceKm = totalDistanceKm(
    input.startLat,
    input.startLon,
    input.endLat,
    input.endLon,
    pathMode,
  );
  const numHops = hopCount(distanceKm);
  const hopDistanceKm = distanceKm / numHops;

  const points = calculateReflectionPoints(
    input.startLat,
    input.startLon,
    input.endLat,
    input.endLon,
    numHops,
    input.date,
    pathMode,
  );

  if (points.length === 0) {
    return null;
  }

  const hops: PathMufHop[] = points.map((point) => {
    const hop = evaluateHopQuality(
      point.lat,
      point.lon,
      PROBE_MHZ,
      input.date,
      input.sfi,
      input.kp,
      hopDistanceKm,
    );
    return {
      lat: point.lat,
      lon: point.lon,
      muf: hop.muf,
      f0F2: hop.f0F2,
    };
  });

  let limitingHop = 0;
  let pathMuf = hops[0]?.muf ?? 0;
  for (let i = 1; i < hops.length; i++) {
    if (hops[i].muf < pathMuf) {
      pathMuf = hops[i].muf;
      limitingHop = i;
    }
  }

  const lufs = hops.map((hop) =>
    calculateLUF(hop.lat, hop.lon, input.sfi, input.date, txPowerWatts, mode),
  );
  const luf = lufs.length > 0 ? Math.max(...lufs) : 1.8;
  // `points` is non-empty above, so `hops` is too and this index exists.
  const limiting = hops[limitingHop];

  const kpLabel = input.kpAssumed ? `Kp ${input.kp} assumed` : `Kp ${input.kp}`;
  const basis = `ITU-R P.533 ray-trace, ${numHops} hop${numHops === 1 ? "" : "s"}, limiting hop ${limitingHop + 1} at ${limiting.lat.toFixed(1)}°, ${limiting.lon.toFixed(1)}° (SFI ${input.sfi}, ${kpLabel})`;
  const computedAt = input.computedAt;
  const computedIso =
    computedAt && !Number.isNaN(computedAt.getTime())
      ? computedAt.toISOString()
      : !Number.isNaN(input.date.getTime())
        ? input.date.toISOString()
        : null;

  return {
    muf: pathMuf,
    fot: calculateFOT(pathMuf),
    luf,
    hpf: calculateHPF(pathMuf),
    hopCount: numHops,
    limitingHop,
    limitingLat: limiting.lat,
    limitingLon: limiting.lon,
    hops,
    evidence: {
      basis,
      observedAt: input.sfiObservedAt ?? null,
      fetchedAt: input.sfiFetchedAt ?? computedIso,
    },
  };
}
