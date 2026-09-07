import { useQuery } from "@tanstack/react-query";
import { nowCastIssueBucket } from "@/hooks/useNowCastBandPredictions";
import { resolveFutureCastHorizons, resolveNowCastCapabilityAccess } from "@/lib/propagation/capabilityAccess";
import { propagationModelClient, propagationModelEnabled, propagationModelMode } from "@/lib/propagation/modelClient";
import type { ModelEvidence } from "./forecastEvidence";


/** The report consumes the established service gates; it cannot activate a
 * horizon or convert a fallback/current response into a future prediction. */
export function useFutureCastReport() {
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
  const advertised = propagationModelEnabled && !capabilities.isError && access.coreNowCast ? resolveFutureCastHorizons(capabilities.data, propagationModelMode) : [];
  const offReason = !propagationModelEnabled ? "MODEL DISABLED"
    : capabilities.isError ? "CAPABILITY SERVICE UNREACHABLE"
    : capabilities.isPending ? "CHECKING MODEL CAPABILITIES"
    : !access.coreNowCast ? "CORE MODEL CAPABILITY UNAVAILABLE"
    : advertised.length ? "FUTURECAST SCORER NOT AVAILABLE"
    : "HORIZON NOT ACTIVATED BY MODEL CAPABILITIES";
  // The deployed path API selects only NowCast/physics scorers, even for a
  // future valid_time (ml/service/app.py: ModelRegistry.predict_many/path).
  // Capability flags alone do not establish a horizon-aware serving contract.
  // Do not send future timestamps to that endpoint or read its cached scores.
  const active: Array<3 | 6 | 12 | 24> = [];
  const evidence = new Map<string, ModelEvidence & { personalized: boolean; stale: boolean }>();
  return { active, offReason, issueTime, evidence, pending: capabilities.isPending };
}
