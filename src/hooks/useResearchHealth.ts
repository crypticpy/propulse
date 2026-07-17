import { useQuery } from "@tanstack/react-query";
import {
  parseResearchHealthResponse,
  type ResearchHealthResponse,
} from "@/lib/propagation/researchHealth";
import { propagationRuntimeModeIsActivated } from "@/lib/propagation/runtimeActivation";

export const RESEARCH_HEALTH_QUERY_KEY = [
  "system-health",
  "nowcast-research",
] as const;

export const RESEARCH_HEALTH_ENABLED =
  import.meta.env.VITE_PROPAGATION_RESEARCH_HEALTH_ENABLED === "true" &&
  propagationRuntimeModeIsActivated("system_health_view");

async function fetchResearchHealth(): Promise<ResearchHealthResponse> {
  const response = await fetch("/api/propagation/research-health", {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error("NowCast health unavailable");
  }
  const parsed = parseResearchHealthResponse(await response.json());
  if (!parsed) {
    throw new Error("NowCast health response is invalid");
  }
  return parsed;
}

export function useResearchHealth() {
  return useQuery({
    queryKey: RESEARCH_HEALTH_QUERY_KEY,
    queryFn: fetchResearchHealth,
    enabled: RESEARCH_HEALTH_ENABLED,
    staleTime: 30_000,
    refetchInterval: 60_000,
    retry: 1,
  });
}
