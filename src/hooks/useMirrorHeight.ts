/**
 * useMirrorHeight: the modelled mirror reflection height for one circuit, with
 * its source (PROP-03, #1108).
 *
 * The climatology behind it is a 274 kB asset fetched once, so the first frame
 * of a report cannot have a modelled height. This hook says that plainly: it
 * returns the labelled 300 km stand-in until the asset resolves, and the
 * modelled provenance afterwards. It never returns null and never throws, so a
 * caller can pass the result straight to `traceRayPath` on every render.
 *
 * The height is a circuit quantity (P.533-14 section 5.1: it depends on the
 * operating frequency and the hop length), so the hook takes the frequency and
 * the circuit's ground distance as well as the control point, and is disabled
 * until it has all three.
 *
 * The key is the position rounded to a tenth of a degree, the frequency to
 * 0.01 MHz, the distance to 1 km and the instant to the minute, and the leaf
 * is evaluated at exactly those rounded values so the cached answer is a pure
 * function of its key. The minute, not the hour: the map is a monthly median
 * evaluated continuously in UTC, reading it at a minute costs nothing, and the
 * ray trace this feeds runs at the same `at`, so an hour-truncated height would
 * describe a different instant from the trace it is drawn on. A metre of GPS
 * jitter or seconds of clock drift cannot change the answer and do not refetch.
 */

import { useQuery } from "@tanstack/react-query";
import { resolveMirrorHeight } from "@/lib/propagation/ionosphere/mirrorHeight";
import type { ResolvedMirrorHeight } from "@/lib/propagation/ionosphere/mirrorHeight";
import { declaredMirrorHeightStandin } from "@/lib/utils/rayTrace";

const MINUTE = 60 * 1000;

/** ~11 km, well inside the 5-degree coefficient grid. */
function roundedDegrees(value: number): number {
  return Math.round(value * 10) / 10;
}

/** The instant rounded to the nearest UTC minute. */
function minuteKey(at: Date): string {
  return new Date(Math.round(at.getTime() / MINUTE) * MINUTE).toISOString();
}

/** 0.01 MHz, finer than any band-edge decision this feeds. */
function roundedMegahertz(value: number): number {
  return Math.round(value * 100) / 100;
}

/** 1 km, well inside the route's own resolution on a 6371 km sphere. */
function roundedKilometres(value: number): number {
  return Math.round(value);
}

/**
 * Nothing has been resolved yet, so nothing has been supplied to the engine.
 * That is `no_provider_supplied`, the same thing `traceRayPath` says when a
 * caller passes no height at all.
 */
const PENDING = declaredMirrorHeightStandin("no_provider_supplied");

export function useMirrorHeight(
  latitude: number | null | undefined,
  longitude: number | null | undefined,
  at: Date,
  frequencyMHz: number | null | undefined,
  groundDistanceKm: number | null | undefined,
): ResolvedMirrorHeight {
  const hasPosition = latitude != null && longitude != null;
  const hasCircuit = frequencyMHz != null && groundDistanceKm != null;
  const lat = hasPosition ? roundedDegrees(latitude) : null;
  const lon = hasPosition ? roundedDegrees(longitude) : null;
  const frequency = hasCircuit ? roundedMegahertz(frequencyMHz) : null;
  const distance = hasCircuit ? roundedKilometres(groundDistanceKm) : null;
  const minute = minuteKey(at);

  const { data } = useQuery<ResolvedMirrorHeight>({
    queryKey: ["mirror-height", lat, lon, minute, frequency, distance],
    // The leaf labels its own failures, so a rejection here is not reachable
    // and a retry would only delay the stand-in the caller already has.
    queryFn: () =>
      resolveMirrorHeight({
        latitude: lat!,
        longitude: lon!,
        at: new Date(minute),
        frequencyMHz: frequency!,
        groundDistanceKm: distance!,
      }),
    enabled: hasPosition && hasCircuit,
    // A modelled height is read from a monthly median, good for an hour. A
    // stand-in is a failure to load, and the leaf drops its memo on failure
    // so the next call retries; caching the stand-in for the hour would turn
    // one bad fetch into an hour of 300 km. It goes stale at once, so the next
    // mount of a report asks again.
    staleTime: (query) =>
      query.state.data?.kind === "modelled" ? 60 * MINUTE : 0,
    gcTime: 120 * MINUTE,
    refetchOnWindowFocus: false,
    retry: false,
  });

  return data ?? PENDING;
}
