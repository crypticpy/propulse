/**
 * Polygon analysis utilities for EmComm alert zone analysis.
 *
 * Provides point-in-polygon testing (ray-casting) and repeater-in-alert-zone
 * matching for the AtmosPulse EmComm suite.
 */

import type { Repeater } from "@/lib/api/repeaters";
import type { WeatherAlert } from "@/lib/api/weather";

/**
 * Ray-casting point-in-polygon test.
 * @param lat - Test point latitude
 * @param lon - Test point longitude
 * @param polygon - Array of [lon, lat] pairs (GeoJSON convention: longitude first)
 */
export function pointInPolygon(
  lat: number,
  lon: number,
  polygon: number[][],
): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i][1]; // lat
    const yi = polygon[i][0]; // lon
    const xj = polygon[j][1];
    const yj = polygon[j][0];

    if (
      yi > lon !== yj > lon &&
      lat < ((xj - xi) * (lon - yi)) / (yj - yi) + xi
    ) {
      inside = !inside;
    }
  }
  return inside;
}

/** Result of repeater-in-polygon analysis */
export interface RepeaterAlertMatch {
  alertId: string;
  alertEvent: string;
  alertSeverity: string;
  repeaters: Repeater[];
}

/**
 * Find repeaters located inside active alert polygons.
 *
 * When pinnedAlertIds is provided and non-empty, only those alerts are
 * considered. Otherwise, defaults to Extreme and Severe alerts.
 */
export function getRepeatersInsideAlerts(
  repeaters: Repeater[],
  alerts: WeatherAlert[],
  pinnedAlertIds?: string[],
): RepeaterAlertMatch[] {
  // Filter to alerts that have polygons
  const targetAlerts = alerts.filter((a) => {
    if (!a.polygon || a.polygon.length < 3) return false;
    if (pinnedAlertIds && pinnedAlertIds.length > 0) {
      return pinnedAlertIds.includes(a.id);
    }
    return a.severity === "Extreme" || a.severity === "Severe";
  });

  const results: RepeaterAlertMatch[] = [];
  for (const alert of targetAlerts) {
    if (!alert.polygon) continue;
    const matching = repeaters.filter((r) =>
      pointInPolygon(r.lat, r.lon, alert.polygon!),
    );
    results.push({
      alertId: alert.id,
      alertEvent: alert.event,
      alertSeverity: alert.severity,
      repeaters: matching,
    });
  }
  return results;
}
