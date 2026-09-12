/**
 * useMirrorHeight: the modelled mirror reflection height for one point, with
 * its source (PROP-03, #1108).
 *
 * The climatology behind it is a 274 kB asset fetched once, so the first frame
 * of a report cannot have a modelled height. This hook says that plainly: it
 * returns the labelled 300 km stand-in until the asset resolves, and the
 * modelled provenance afterwards. It never returns null and never throws, so a
 * caller can pass the result straight to `traceRayPath` on every render.
 *
 * The key is the rounded position and the hour of the instant, because the CCIR
 * map is a monthly median on a 5-degree grid read at an hour: a metre of GPS
 * jitter or a minute of clock drift cannot change the answer, and neither
 * should refetch it.
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

/** The start of the UTC hour the instant falls in. */
function hourKey(at: Date): string {
  const hour = new Date(at.getTime());
  hour.setUTCMinutes(0, 0, 0);
  return hour.toISOString();
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
): ResolvedMirrorHeight {
  const hasPosition = latitude != null && longitude != null;
  const lat = hasPosition ? roundedDegrees(latitude) : null;
  const lon = hasPosition ? roundedDegrees(longitude) : null;
  const hour = hourKey(at);

  const { data } = useQuery<ResolvedMirrorHeight>({
    queryKey: ["mirror-height", lat, lon, hour],
    // The leaf labels its own failures, so a rejection here is not reachable
    // and a retry would only delay the stand-in the caller already has.
    queryFn: () =>
      resolveMirrorHeight({
        latitude: lat!,
        longitude: lon!,
        at: new Date(hour),
      }),
    enabled: hasPosition,
    staleTime: 60 * MINUTE,
    gcTime: 120 * MINUTE,
    refetchOnWindowFocus: false,
    retry: false,
  });

  return data ?? PENDING;
}
