import type { WeatherAlert } from "@/lib/api/weather";

export const SEVERITY_RANK: Record<WeatherAlert["severity"], number> = {
  Extreme: 4,
  Severe: 3,
  Moderate: 2,
  Minor: 1,
  Unknown: 0,
};

export const SEVERITY_TONE: Record<WeatherAlert["severity"], string> = {
  Extreme: "hc-bad",
  Severe: "hc-bad",
  Moderate: "hc-warn",
  Minor: "hc-info-text",
  Unknown: "hc-dim-text",
};

/** Worst first; stable for equal severities. */
export function rankAlerts(alerts: readonly WeatherAlert[]): WeatherAlert[] {
  return [...alerts].sort(
    (a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity],
  );
}
