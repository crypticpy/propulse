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
 * operating frequency and the hop length, and for a circuit longer than dmax
 * it is the mean over the Table 1c control points), so the hook takes both
 * ends of the circuit and the frequency, and is disabled until it has all
 * three. The leaf resolves the route and picks the control points itself.
 *
 * The key is each endpoint rounded to a thousandth of a degree, the frequency
 * to 0.01 MHz and the instant to the minute, and the leaf
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

/**
 * ~110 m. Coarser than any GPS jitter, and fine enough that the route the
 * leaf resolves from the rounded ends is within 0.2 km of the one the trace
 * walks from the exact ends: `traceRayPath` only draws the modelled mode when
 * the provenance's distance is within 1 km of its own, so a tenth of a degree
 * here (up to 11 km per end) would have the trace set every modelled height
 * aside as solved for another circuit.
 */
function roundedDegrees(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/** The instant rounded to the nearest UTC minute. */
function minuteKey(at: Date): string {
  return new Date(Math.round(at.getTime() / MINUTE) * MINUTE).toISOString();
}

/** 0.01 MHz, finer than any band-edge decision this feeds. */
function roundedMegahertz(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Nothing has been resolved yet, so nothing has been supplied to the engine.
 * That is `no_provider_supplied`, the same thing `traceRayPath` says when a
 * caller passes no height at all.
 */
const PENDING = declaredMirrorHeightStandin("no_provider_supplied");

export function useMirrorHeight(
  startLatitude: number | null | undefined,
  startLongitude: number | null | undefined,
  endLatitude: number | null | undefined,
  endLongitude: number | null | undefined,
  at: Date,
  frequencyMHz: number | null | undefined,
): ResolvedMirrorHeight {
  const hasCircuit =
    startLatitude != null &&
    startLongitude != null &&
    endLatitude != null &&
    endLongitude != null;
  const hasFrequency = frequencyMHz != null;
  const startLat = hasCircuit ? roundedDegrees(startLatitude) : null;
  const startLon = hasCircuit ? roundedDegrees(startLongitude) : null;
  const endLat = hasCircuit ? roundedDegrees(endLatitude) : null;
  const endLon = hasCircuit ? roundedDegrees(endLongitude) : null;
  const frequency = hasFrequency ? roundedMegahertz(frequencyMHz) : null;
  const minute = minuteKey(at);

  const { data } = useQuery<ResolvedMirrorHeight>({
    queryKey: [
      "mirror-height",
      startLat,
      startLon,
      endLat,
      endLon,
      minute,
      frequency,
    ],
    // The leaf labels its own failures, so a rejection here is not reachable
    // and a retry would only delay the stand-in the caller already has.
    queryFn: () =>
      resolveMirrorHeight({
        start: { latitude: startLat!, longitude: startLon! },
        end: { latitude: endLat!, longitude: endLon! },
        at: new Date(minute),
        frequencyMHz: frequency!,
      }),
    enabled: hasCircuit && hasFrequency,
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
