import type { HomeRegion } from "@/stores/hamclockDisplayStore";

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
