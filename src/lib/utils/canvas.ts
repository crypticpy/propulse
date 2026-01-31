/**
 * Canvas Utilities
 * Shared functions for map canvas rendering
 */

// Re-export spot age opacity from LiveSpotArcs
export { getAgeOpacity as getSpotAgeOpacity } from "@/components/map/LiveSpotArcs";

/**
 * Convert lat/lon to canvas coordinates (equirectangular projection)
 */
export function latLonToCanvas(
  lat: number,
  lon: number,
  mapWidth: number = 1024,
  mapHeight: number = 512,
): { x: number; y: number } {
  const x = ((lon + 180) / 360) * mapWidth;
  const y = ((90 - lat) / 180) * mapHeight;
  return { x, y };
}

/**
 * Convert canvas coordinates to lat/lon
 */
export function canvasToLatLon(
  x: number,
  y: number,
  canvasWidth: number,
  canvasHeight: number,
): { lat: number; lon: number } {
  const lon = (x / canvasWidth) * 360 - 180;
  const lat = 90 - (y / canvasHeight) * 180;
  return { lat, lon };
}
