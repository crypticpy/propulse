/**
 * useAMSATStatus — On-demand hook for AMSAT operational status.
 *
 * Fetches community-reported satellite status from the AMSAT status API.
 * Uses IDB cache (1h TTL) as offline fallback. Only fetches when enabled.
 */

import { useQuery } from "@tanstack/react-query";
import { getCachedResponse, setCachedResponse } from "@/lib/utils/idbCache";
import type {
  AMSATStatusReport,
  AMSATStatusResult,
  AMSATOperationalStatus,
} from "@/types/amsat";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const HOUR = 60 * 60 * 1000;

/** Status reports refresh frequently — 1h cache TTL */
const STATUS_TTL = 1 * HOUR;

// ---------------------------------------------------------------------------
// Hook Interface
// ---------------------------------------------------------------------------

interface UseAMSATStatusResult {
  /** Aggregated AMSAT status, or null while loading / not enabled */
  status: AMSATStatusResult | null;
  /** Whether the query is currently loading */
  isLoading: boolean;
  /** Fetch error, if any */
  error: Error | null;
}

// ---------------------------------------------------------------------------
// Status Derivation
// ---------------------------------------------------------------------------

/**
 * Derive an overall operational status from raw AMSAT reports.
 *
 * - If no reports: "unknown"
 * - Count positive ("heard" or "active", case-insensitive) vs negative ("not heard")
 * - >50% positive → "active"
 * - >0% positive → "semi-active"
 * - All negative → "inactive"
 * - Otherwise → "unknown"
 */
function deriveStatus(reports: AMSATStatusReport[]): AMSATOperationalStatus {
  if (reports.length === 0) return "unknown";

  let positiveCount = 0;
  let negativeCount = 0;

  for (const r of reports) {
    const text = r.report.toLowerCase();

    // "not heard" must be checked before "heard" to avoid false positives
    if (text.includes("not heard")) {
      negativeCount++;
    } else if (text.includes("heard") || text.includes("active")) {
      positiveCount++;
    }
  }

  const total = positiveCount + negativeCount;
  if (total === 0) return "unknown";

  if (positiveCount / total > 0.5) return "active";
  if (positiveCount > 0) return "semi-active";
  return "inactive";
}

// ---------------------------------------------------------------------------
// Hook Implementation
// ---------------------------------------------------------------------------

export function useAMSATStatus(satName: string | null): UseAMSATStatusResult {
  const { data, isLoading, error } = useQuery<AMSATStatusResult>({
    queryKey: ["amsat", "status", satName],
    enabled: satName !== null && satName.length > 0,
    staleTime: STATUS_TTL,
    refetchOnWindowFocus: false,
    retry: 1,
    queryFn: async (): Promise<AMSATStatusResult> => {
      const cacheKey = `amsat-status-${satName}`;

      // 1. Check IDB cache first (offline fallback / fast path)
      try {
        const cached = await getCachedResponse(cacheKey);
        if (cached) return cached as AMSATStatusResult;
      } catch {
        // IDB unavailable — fall through to network
      }

      // 2. Fetch from API
      const res = await fetch(
        `/api/satellites/status?name=${encodeURIComponent(satName!)}`,
      );
      if (!res.ok) {
        throw new Error(`AMSAT status fetch failed: ${res.status}`);
      }

      const reports: AMSATStatusReport[] = await res.json();

      // 3. Build aggregated result
      const result: AMSATStatusResult = {
        status: deriveStatus(reports),
        reportCount: reports.length,
        latestReport: reports.length > 0 ? reports[reports.length - 1] : null,
        reports,
      };

      // 4. Persist to IDB cache
      try {
        await setCachedResponse(cacheKey, result, STATUS_TTL);
      } catch {
        // Swallow write errors — cache is best-effort
      }

      return result;
    },
  });

  return {
    status: data ?? null,
    isLoading,
    error: error as Error | null,
  };
}

export default useAMSATStatus;
