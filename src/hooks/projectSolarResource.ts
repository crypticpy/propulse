import type { UseQueryResult } from "@tanstack/react-query";
import type { SolarResource } from "@/lib/solar/contracts";

/**
 * Compatibility projection for existing non-Solar-Pulse consumers. The query,
 * cache, retry, status, and provenance remain owned by useSolarResource; only
 * the validated data shape is projected for older call sites.
 */
export function projectSolarResource<T, U>(
  query: UseQueryResult<SolarResource<T>>,
  transform: (data: T) => U,
) {
  const { data: resource, ...queryState } = query;
  const observedAt = resource
    ? Date.parse(resource.envelope.observedAt)
    : Number.NaN;
  return {
    ...queryState,
    data: resource ? transform(resource.envelope.data) : undefined,
    dataUpdatedAt: Number.isFinite(observedAt)
      ? observedAt
      : query.dataUpdatedAt,
    solarResource: resource,
    solarState: resource?.state,
    cacheOutcome: resource?.cacheOutcome,
  };
}

export function oldestKnownTimestamp(
  values: Array<number | undefined>,
): number | undefined {
  const known = values.filter(
    (value): value is number => typeof value === "number" && value > 0,
  );
  return known.length > 0 ? Math.min(...known) : undefined;
}
