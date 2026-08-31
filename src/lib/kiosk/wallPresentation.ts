import { isPointInDaylight } from "@/lib/utils/sun";

interface WallLocation {
  lat: number;
  lon: number;
}

/**
 * Decide whether an unattended wall should be dimmed at this instant.
 * Astronomical daylight at the configured QTH naturally follows its local
 * sunrise/sunset and handles time zones without another location service.
 */
export function shouldDimWallDisplay(
  enabled: boolean,
  station: WallLocation | null,
  now: Date,
): boolean {
  if (!enabled || !station) return false;
  return !isPointInDaylight(station.lat, station.lon, now);
}
