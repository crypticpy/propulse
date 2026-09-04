import { getPathMetrics } from "@/lib/utils/path";

/** Where attention lives. Independent of layoutMode and MapDataScope. */
export type OpsPosture = "observe" | "contact" | "desk";

export const CONTACT_TARGET_OPACITY = 1;
export const CONTACT_NEIGHBOR_OPACITY = 0.7;
export const CONTACT_DIM_OPACITY = 0.35;

export interface LatLon {
  lat: number;
  lon: number;
}

export interface ContactFrame {
  lat: number;
  lon: number;
  distance: number;
}

/**
 * Contact/Desk keep public discovery on the globe. Dimming is visual, not a
 * data cut. Contest scope still wins so unassisted rules stay intact.
 */
export function resolveMapPolicyScope(
  scope: "observe" | "log" | "contest",
  posture: OpsPosture,
): "observe" | "log" | "contest" {
  if (scope === "contest") return "contest";
  if (posture === "contact" || posture === "desk") return "observe";
  return scope;
}

/**
 * Visual weight for a live spot while working one station.
 * Same-band neighbors stay readable so the pileup remains visible.
 */
export function contactSpotOpacity(args: {
  posture: OpsPosture;
  isContactTarget: boolean;
  matchesContactBand: boolean;
}): number {
  if (args.posture !== "contact") return 1;
  if (args.isContactTarget) return CONTACT_TARGET_OPACITY;
  if (args.matchesContactBand) return CONTACT_NEIGHBOR_OPACITY;
  return CONTACT_DIM_OPACITY;
}

/**
 * Camera distance that keeps both QTH and DX on-screen without slamming
 * into the DX pin. Farther endpoints pull the camera back.
 */
export function contactFrameDistance(angularSeparationDeg: number): number {
  const t = Math.min(1, Math.max(0, angularSeparationDeg) / 180);
  return 1.85 + t * 1.35;
}

/** Frame the short-path great circle: look at the midpoint, fit both ends. */
export function computeContactFrame(qth: LatLon, dx: LatLon): ContactFrame {
  const metrics = getPathMetrics(qth.lat, qth.lon, dx.lat, dx.lon);
  const earthRadiusKm = 6371;
  const angularSeparationDeg =
    (metrics.shortPath.distance / earthRadiusKm) * (180 / Math.PI);
  return {
    lat: metrics.midpoint.lat,
    lon: metrics.midpoint.lon,
    distance: contactFrameDistance(angularSeparationDeg),
  };
}

export function isSameStationCall(
  candidate: string | null | undefined,
  contactCallsign: string | null | undefined,
): boolean {
  const a = candidate?.trim().toUpperCase() ?? "";
  const b = contactCallsign?.trim().toUpperCase() ?? "";
  return a.length > 0 && a === b;
}
