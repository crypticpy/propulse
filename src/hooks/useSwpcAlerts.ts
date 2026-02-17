/**
 * useSwpcAlerts — React Query hook for SWPC alerts.json
 *
 * Fetches, parses, enriches, and filters SWPC space weather alerts.
 * Replaces the manual fetch + useState that previously lived in SolarPulse.tsx.
 *
 * Returns both ham-relevant alerts (filtered) and all parsed alerts.
 */

import { useQuery } from "@tanstack/react-query";
import { useDataSourceStatus } from "@/stores/dataSourceStatusStore";
import { classifyError } from "@/lib/errors/classifyError";
import type {
  SwpcAlertItem,
  SwpcAlertParsed,
  SwpcAlertSeverity,
  SwpcAlertCategory,
} from "@/types/swpcAlerts";

// =============================================================================
// CONSTANTS
// =============================================================================

const SWPC_ALERTS_URL =
  "https://services.swpc.noaa.gov/products/alerts.json" as const;

const QUERY_KEY = ["swpc", "alerts"] as const;

const ONE_MINUTE = 60_000;

// =============================================================================
// PARSING HELPERS  (moved from SolarPulse.tsx)
// =============================================================================

/**
 * Parse the SWPC "YYYY-MM-DD HH:MM:SS.sss" datetime string as UTC Date.
 */
export function parseIssueDatetimeUtc(issueDatetime: string): Date {
  const iso = `${issueDatetime.replace(" ", "T")}Z`;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? new Date(0) : d;
}

/**
 * Returns true when an SWPC alert message is relevant to amateur radio.
 */
export function isHamRelevantAlert(a: SwpcAlertItem): boolean {
  const m = a.message;
  return (
    /NOAA Scale:\s*[RSG]\d/i.test(m) ||
    /HF\b/i.test(m) ||
    /radio\b/i.test(m) ||
    /Geomagnetic Storm/i.test(m) ||
    /Solar Radiation Storm/i.test(m)
  );
}

/**
 * Extract the first meaningful summary line from a message body.
 * Prefers lines starting with SUMMARY:, ALERT:, WATCH:, or WARNING:.
 */
export function alertSummaryLine(message: string): string {
  const lines = message
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);

  const firstKeyLine = lines.find((l) =>
    /^(SUMMARY:|ALERT:|WATCH:|WARNING:)/i.test(l),
  );
  return firstKeyLine ?? lines[0] ?? "";
}

/**
 * Extract the NOAA scale code from a message body.
 * Example match: "NOAA Scale: R2 - Moderate" -> "R2"
 */
export function parseNoaaScaleCode(message: string): string | null {
  const m = message.match(/NOAA Scale:\s*([RSG]\d)\s*-/i);
  return m?.[1]?.toUpperCase() ?? null;
}

/**
 * Map a NOAA scale code (e.g. "G3") to a severity bucket.
 */
export function severityFromNoaaScaleCode(
  code: string | null,
): SwpcAlertSeverity {
  if (!code) return "minor";
  const n = Number(code.slice(1));
  if (!Number.isFinite(n)) return "minor";
  if (n <= 1) return "minor";
  if (n === 2) return "moderate";
  if (n === 3) return "major";
  return "extreme";
}

/**
 * Derive the alert category from the NOAA scale letter or message keywords.
 */
function categorizeAlert(
  code: string | null,
  message: string,
): SwpcAlertCategory {
  if (code) {
    const letter = code[0].toUpperCase();
    if (letter === "G") return "storm";
    if (letter === "R") return "blackout";
    if (letter === "S") return "radiation";
  }
  // Fallback keyword matching
  if (/flare/i.test(message)) return "flare";
  if (/geomagnetic/i.test(message) || /storm/i.test(message)) return "storm";
  if (/blackout/i.test(message) || /radio/i.test(message)) return "blackout";
  if (/radiation/i.test(message) || /proton/i.test(message)) return "radiation";
  return "other";
}

/**
 * Transform a raw SwpcAlertItem into a fully parsed SwpcAlertParsed.
 */
function parseAlert(raw: SwpcAlertItem): SwpcAlertParsed {
  const parsedDate = parseIssueDatetimeUtc(raw.issue_datetime);
  const noaaScaleCode = parseNoaaScaleCode(raw.message);
  const severity = severityFromNoaaScaleCode(noaaScaleCode);
  const summaryLine = alertSummaryLine(raw.message);
  const isHamRelevant = isHamRelevantAlert(raw);
  const category = categorizeAlert(noaaScaleCode, raw.message);

  return {
    ...raw,
    parsedDate,
    noaaScaleCode,
    severity,
    summaryLine,
    isHamRelevant,
    category,
  };
}

// =============================================================================
// HOOK
// =============================================================================

export interface UseSwpcAlertsReturn {
  /** Ham-relevant alerts only, sorted newest-first */
  data: SwpcAlertParsed[];
  /** All parsed alerts (unfiltered), sorted newest-first */
  allAlerts: SwpcAlertParsed[];
  isLoading: boolean;
  error: Error | null;
}

/**
 * Fetch, parse, and return SWPC alerts with automatic 60-second refresh.
 */
export function useSwpcAlerts(): UseSwpcAlertsReturn {
  const query = useQuery({
    queryKey: QUERY_KEY,
    queryFn: async (): Promise<SwpcAlertParsed[]> => {
      try {
        const res = await fetch(SWPC_ALERTS_URL, { cache: "no-store" });
        if (!res.ok) {
          throw new Error(`${res.status} ${res.statusText}`);
        }
        const raw: SwpcAlertItem[] = await res.json();

        const parsed = raw.map(parseAlert);

        // Sort newest-first by parsedDate
        parsed.sort((a, b) => b.parsedDate.getTime() - a.parsedDate.getTime());

        useDataSourceStatus.getState().reportSuccess("swpc-alerts");
        return parsed;
      } catch (err) {
        const classified = classifyError(err, "swpc-alerts");
        useDataSourceStatus.getState().reportError("swpc-alerts", classified);
        throw err;
      }
    },
    staleTime: ONE_MINUTE,
    refetchInterval: ONE_MINUTE,
    retry: 3,
    retryDelay: (attemptIndex: number) =>
      Math.min(1000 * 2 ** attemptIndex, 30000),
  });

  const allAlerts = query.data ?? [];
  const hamAlerts = allAlerts.filter((a) => a.isHamRelevant);

  return {
    data: hamAlerts,
    allAlerts,
    isLoading: query.isLoading,
    error: query.error as Error | null,
  };
}
