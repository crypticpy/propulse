import { useQueries, useQuery } from "@tanstack/react-query";
import { nowCastIssueBucket, type NowCastBandInput } from "@/hooks/useNowCastBandPredictions";
import { resolveFutureCastHorizons, resolveNowCastCapabilityAccess } from "@/lib/propagation/capabilityAccess";
import { propagationModelClient, propagationModelEnabled, propagationModelMode } from "@/lib/propagation/modelClient";
import { buildFutureCastReportRequests } from "./futureCastRequests";
import { modelEvidence, FORECAST_HOUR_MS } from "./forecastEvidence";

/** The report consumes the established service gates; it cannot activate a
 * horizon or convert a fallback/current response into a future prediction. */
export function useFutureCastReport(input: NowCastBandInput) {
  const now = Date.now();
  const issueTime = nowCastIssueBucket(now);
  const capabilities = useQuery({
    queryKey: ["propagation-v4", "capabilities"] as const,
    queryFn: ({ signal }) => {
      if (!propagationModelClient) throw new Error("Propagation model is disabled");
      return propagationModelClient.capabilities(signal);
    },
    enabled: propagationModelEnabled,
    staleTime: 300_000,
    refetchInterval: 300_000,
    refetchIntervalInBackground: true,
    retry: 1,
  });
  const access = resolveNowCastCapabilityAccess(capabilities.data, propagationModelMode);
  const active = propagationModelEnabled && !capabilities.isError && access.coreNowCast ? resolveFutureCastHorizons(capabilities.data, propagationModelMode) : [];
  const offReason = !propagationModelEnabled ? "MODEL DISABLED"
    : capabilities.isError ? "CAPABILITY SERVICE UNREACHABLE"
    : capabilities.isPending ? "CHECKING MODEL CAPABILITIES"
    : !access.coreNowCast ? "CORE MODEL CAPABILITY UNAVAILABLE"
    : "HORIZON NOT ACTIVATED BY MODEL CAPABILITIES";
  const requests = buildFutureCastReportRequests(input, new Date(issueTime), access.coreNowCast ? active : [], access.stationCast);
  const queries = useQueries({ queries: requests.map(({ hours, request }) => ({
    queryKey: ["hamclock-futurecast", hours, request] as const,
    queryFn: ({ signal }: { signal: AbortSignal }) => {
      if (!propagationModelClient) throw new Error("Propagation model is disabled");
      return propagationModelClient.path(request, signal);
    },
    enabled: propagationModelEnabled && active.includes(hours as 3 | 6 | 12 | 24),
    staleTime: 60_000,
    retry: 1,
  })) });
  const evidence = new Map(requests.map(({ hours, request }, index) => {
    const query = queries[index];
    const result = modelEvidence(query.data, {
      band: request.band, targetGrid: input.target?.grid ?? null, mode: request.mode,
      hourIndex: Math.floor((issueTime + hours * FORECAST_HOUR_MS) / FORECAST_HOUR_MS), now,
    });
    return [`${request.band}:${hours}`, {
      ...result,
      reason: query.isError ? "MODEL REQUEST FAILED" : result.reason,
      personalized: !!request.station,
      stale: query.isError || !!result.prediction?.ood_flags.some(flag => /stale/i.test(flag)),
    }] as const;
  }));
  return { active, offReason, issueTime, evidence, pending: queries.some(query => query.isPending) };
}
