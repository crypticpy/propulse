import type { TextScale } from "@/types/user";
import type { HomeRegion } from "@/stores/hamclockDisplayStore";

export const HAMCLOCK_TEXT_SCALE: Record<TextScale | "200" | "250", number> = {
  sm: 0.9,
  md: 1,
  lg: 1.15,
  xl: 1.375,
  "200": 2,
  "250": 2.5,
};

export function hamClockPanelWidths(
  width: number,
  scale: number,
  smart: boolean,
  infoVisible: boolean,
  spotsVisible: boolean,
) {
  const info = infoVisible ? 260 * scale : 0;
  const spots = spotsVisible ? 310 * scale : 0;
  const mapSpace = smart
    ? Math.min(640, width * 0.45)
    : Math.min(320, width * 0.4);
  const fit =
    info + spots > 0 ? Math.min(1, (width - mapSpace) / (info + spots)) : 1;
  return { info: Math.round(info * fit), spots: Math.round(spots * fit) };
}

/** Operating context: home plus the neighboring intercontinental paths. */
export function hamClockHomeRegion(lat: number, lon: number): HomeRegion {
  if (lat >= 24 && lat <= 50 && lon >= -125 && lon <= -66) {
    // Americas → Atlantic → Europe/Africa, reaching the western Middle East.
    return { lat: 10, lon: -40, latitudeSpan: 140, longitudeSpan: 220 };
  }
  // Large continents need a regional window, not an entire-continent fit.
  return {
    lat: Math.max(-55, Math.min(55, lat)),
    lon,
    latitudeSpan: 110,
    longitudeSpan: 180,
  };
}

export function globeRegionDistance(
  region: HomeRegion,
  verticalFov: number,
  aspect: number,
) {
  const tan = Math.tan((verticalFov * Math.PI) / 360);
  const vertical = (region.latitudeSpan * Math.PI) / 360;
  const horizontal = (region.longitudeSpan * Math.PI) / 360;
  return Math.max(
    1.35,
    Math.cos(vertical) + Math.sin(vertical) / tan,
    Math.cos(horizontal) + Math.sin(horizontal) / (tan * Math.max(0.2, aspect)),
  );
}

/** The single-world flat renderer needs a full-world fallback across the seam. */
export function flatHomeRegion(region: HomeRegion): HomeRegion {
  const crossesDateline = Math.abs(region.lon) + region.longitudeSpan / 2 > 180;
  return crossesDateline
    ? { lat: 0, lon: 0, latitudeSpan: 180, longitudeSpan: 360 }
    : region;
}

/** AZ currently has no logged-contact renderer; retain the choice for Flat/3D. */
export function hamClockProjectionContent(
  projection: string,
  content: "activity" | "contacts" | "both",
) {
  return projection === "azimuthal" ? "activity" : content;
}
