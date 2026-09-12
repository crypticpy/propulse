import type { EffectiveDisplayQuality } from "@/lib/map/displayQuality";

/** Stable size buckets preserve detail without processing UHD pixels on small views. */
export function flatIlluminationRasterSizes(
  worldDevicePixels: number,
  quality: EffectiveDisplayQuality,
): { lights: number; mask: number } {
  const cap =
    quality === "data-saver" ? 1024 : quality === "balanced" ? 2048 : 4096;
  const requested = 2 ** Math.ceil(Math.log2(Math.max(256, worldDevicePixels)));
  const lights = Math.min(cap, requested);
  return { lights, mask: Math.max(256, lights / 2) };
}

/** The bundled night texture includes blue terrain; that is not emitted light. */
export function nightLightIntensity(
  red: number,
  green: number,
  blue: number,
): number {
  return Math.max(0, Math.min(red, green) - blue * 0.75) / 255;
}

/** Sample the great circle perpendicular to sunlight, including at equinox. */
export function terminatorCoordinates(
  lat: number,
  lon: number,
  samples = 2048,
) {
  const phi = (lat * Math.PI) / 180;
  const lambda = (lon * Math.PI) / 180;
  const points: { lat: number; lon: number }[] = [];
  for (let i = 0; i <= samples; i++) {
    const angle = (i / samples) * 2 * Math.PI;
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    const x = -Math.sin(lambda) * c - Math.sin(phi) * Math.cos(lambda) * s;
    const y = Math.cos(lambda) * c - Math.sin(phi) * Math.sin(lambda) * s;
    const z = Math.cos(phi) * s;
    points.push({
      lat: (Math.asin(Math.max(-1, Math.min(1, z))) * 180) / Math.PI,
      lon: (Math.atan2(y, x) * 180) / Math.PI,
    });
  }
  return points;
}
