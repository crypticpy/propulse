import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { classifyError } from "@/lib/errors/classifyError";
import {
  fetchSolarResource,
  readSolarCachedResource,
} from "@/lib/api/solarClient";
import type {
  SolarResource,
  SolarSourceId,
} from "@/lib/solar/contracts";
import {
  getSolarSourcePolicy,
  SOLAR_QUERY_KEYS,
} from "@/lib/solar/sourcePolicies";
import { useDataSourceStatus } from "@/stores/dataSourceStatusStore";
import { recordSolarTelemetry } from "@/lib/solar/telemetry";

export function useSolarResource<T>(sourceId: SolarSourceId, enabled = true) {
  const policy = getSolarSourcePolicy(sourceId);
  const queryClient = useQueryClient();
  const query = useQuery<SolarResource<T>>({
    queryKey: SOLAR_QUERY_KEYS[sourceId],
    enabled,
    queryFn: async () => {
      try {
        const resource = await fetchSolarResource<T>(sourceId);
        const status = useDataSourceStatus.getState();
        const previous = status.sources[sourceId];
        if (resource.lastError) {
          status.reportError(
            sourceId,
            classifyError(
              Object.assign(new Error(resource.lastError.error.message), {
                status: resource.lastError.error.upstreamStatus,
                endpoint: policy.endpoint,
              }),
              policy.endpoint,
            ),
            {
              observedAt: Date.parse(resource.envelope.observedAt),
              cacheOutcome: resource.cacheOutcome,
              staleness: "stale",
            },
          );
          recordSolarTelemetry({
            event: "solar_source_failure",
            sourceId,
            outcome: resource.lastError.error.code,
            consecutiveFailures: (previous?.consecutiveErrors ?? 0) + 1,
          });
        } else {
          status.reportSuccess(sourceId, {
            observedAt: Date.parse(resource.envelope.observedAt),
            cacheOutcome: resource.cacheOutcome,
            staleness: resource.state === "fresh" ? "fresh" : "stale",
          });
          if (previous?.errorSince) {
            recordSolarTelemetry({
              event: "solar_source_recovery",
              sourceId,
              recoveryDurationMs: Date.now() - previous.errorSince,
            });
          }
        }
        return resource;
      } catch (error) {
        const status = useDataSourceStatus.getState();
        const previous = status.sources[sourceId];
        const classified = classifyError(error, policy.endpoint);
        status.reportError(sourceId, classified);
        recordSolarTelemetry({
          event: "solar_source_failure",
          sourceId,
          outcome: classified.category,
          consecutiveFailures: (previous?.consecutiveErrors ?? 0) + 1,
        });
        throw error;
      }
    },
    staleTime: policy.softTtlMs,
    refetchInterval: enabled ? policy.refetchMs : false,
    retry: (failureCount, error) => {
      const retryable =
        typeof error === "object" &&
        error !== null &&
        "body" in error &&
        Boolean(
          (error as { body?: { error?: { retryable?: boolean } } }).body?.error
            ?.retryable,
        );
      return retryable && failureCount < policy.retries;
    },
    retryDelay: (attempt) => Math.min(750 * 2 ** attempt, 8_000),
    placeholderData: (previous) => previous,
    refetchOnWindowFocus: true,
  });

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    void readSolarCachedResource<T>(sourceId).then((cached) => {
      if (!active || !cached) return;
      const current = queryClient.getQueryData<SolarResource<T>>(
        SOLAR_QUERY_KEYS[sourceId],
      );
      const currentFetchedAt = current
        ? Date.parse(current.envelope.fetchedAt)
        : -Infinity;
      const cachedFetchedAt = Date.parse(cached.envelope.fetchedAt);
      if (!current || cachedFetchedAt > currentFetchedAt) {
        queryClient.setQueryData(SOLAR_QUERY_KEYS[sourceId], cached);
      }
    });
    return () => {
      active = false;
    };
  }, [enabled, queryClient, sourceId]);

  return query;
}
