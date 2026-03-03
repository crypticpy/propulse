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

/**
 * Default TTLs for alerts without explicit "Valid To" lines.
 * SWPC warnings have explicit validity windows; alerts/summaries don't.
 * These are conservative defaults based on typical event durations.
 */
const DEFAULT_TTL_MS: Record<string, number> = {
  blackout: 3 * 60 * 60 * 1000, // R-scale: 3 hours (flare HF impact fades)
  storm: 12 * 60 * 60 * 1000, // G-scale: 12 hours (storm period)
  radiation: 24 * 60 * 60 * 1000, // S-scale: 24 hours (proton events linger)
  flare: 3 * 60 * 60 * 1000, // flare summaries: 3 hours
  other: 6 * 60 * 60 * 1000, // catch-all: 6 hours
};

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
 * Parse "Valid To: YYYY Mon DD HHMM UTC" from SWPC warning messages.
 * Returns null if the message doesn't contain a valid-to line.
 * Format example: "Valid To: 2026 Feb 26 0300 UTC"
 */
const MONTH_MAP: Record<string, number> = {
  Jan: 0,
  Feb: 1,
  Mar: 2,
  Apr: 3,
  May: 4,
  Jun: 5,
  Jul: 6,
  Aug: 7,
  Sep: 8,
  Oct: 9,
  Nov: 10,
  Dec: 11,
};

function parseValidTo(message: string): Date | null {
  const m = message.match(
    /Valid\s+To:\s*(\d{4})\s+(\w{3})\s+(\d{1,2})\s+(\d{4})\s+UTC/i,
  );
  if (!m) return null;
  const [, year, mon, day, hhmm] = m;
  const monthIdx = MONTH_MAP[mon];
  if (monthIdx === undefined) return null;
  const hh = Number(hhmm.slice(0, 2));
  const mm = Number(hhmm.slice(2));
  const d = new Date(Date.UTC(Number(year), monthIdx, Number(day), hh, mm));
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Compute when an alert expires:
 * 1. If message contains "Valid To:" → use that explicit expiration
 * 2. Otherwise → issue time + category-based default TTL
 */
function computeExpiresAt(
  parsedDate: Date,
  category: SwpcAlertCategory,
  message: string,
): Date {
  const validTo = parseValidTo(message);
  if (validTo) return validTo;
  const ttl = DEFAULT_TTL_MS[category] ?? DEFAULT_TTL_MS.other;
  return new Date(parsedDate.getTime() + ttl);
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
  const expiresAt = computeExpiresAt(parsedDate, category, raw.message);

  return {
    ...raw,
    parsedDate,
    noaaScaleCode,
    severity,
    summaryLine,
    isHamRelevant,
    category,
    expiresAt,
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

        const now = Date.now();
        const parsed = raw
          .map(parseAlert)
          // Drop expired alerts: those past their "Valid To" time or
          // past their category-based TTL from issue time
          .filter((a) => a.expiresAt.getTime() > now);

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
