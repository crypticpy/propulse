/**
 * SKYWARN spotter activation status
 * Derives activation status from NWS weather alerts - no external API needed
 */

import type { WeatherAlert } from "@/lib/api/weather";

export type SkywarnStatus = "inactive" | "possible" | "activated";

/** Check if SKYWARN spotters are likely activated based on NWS alerts */
export function deriveSkywarnStatus(alerts: WeatherAlert[]): {
  status: SkywarnStatus;
  activatingAlerts: string[];
} {
  const activatingEvents = [
    "Tornado Warning",
    "Tornado Watch",
    "Severe Thunderstorm Warning",
    "Severe Thunderstorm Watch",
  ];

  const possibleEvents = [
    "Special Weather Statement",
    "Severe Weather Statement",
  ];

  const activating = alerts.filter((a) =>
    activatingEvents.some((e) => a.event.includes(e)),
  );

  const possible = alerts.filter(
    (a) =>
      possibleEvents.some((e) => a.event.includes(e)) &&
      (a.headline?.toLowerCase().includes("skywarn") ||
        a.headline?.toLowerCase().includes("spotter") ||
        a.instruction?.toLowerCase().includes("skywarn") ||
        a.instruction?.toLowerCase().includes("spotter")),
  );

  if (activating.length > 0) {
    return {
      status: "activated",
      activatingAlerts: activating.map((a) => a.event),
    };
  }

  if (possible.length > 0) {
    return {
      status: "possible",
      activatingAlerts: possible.map((a) => a.event),
    };
  }

  return { status: "inactive", activatingAlerts: [] };
}
