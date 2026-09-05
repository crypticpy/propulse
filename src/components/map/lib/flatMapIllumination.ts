import { getSubsolarPoint } from "@/lib/utils/sun";

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

export function drawFlatTerminator(
  context: CanvasRenderingContext2D,
  date: Date,
  width: number,
  height: number,
  highViz = false,
  dashed = false,
  scale = 1,
) {
  const sun = getSubsolarPoint(date);
  const samples = Math.min(16384, Math.max(2048, Math.ceil(width * scale)));
  const points = terminatorCoordinates(sun.lat, sun.lon, samples);
  context.save();
  context.lineCap = "round";
  context.lineJoin = "round";
  if (dashed) context.setLineDash([8 / scale, 4 / scale]);
  context.beginPath();
  let lastLon: number | undefined;
  for (const point of points) {
    const x = ((point.lon + 180) / 360) * width;
    const y = ((90 - point.lat) / 180) * height;
    if (lastLon === undefined || Math.abs(point.lon - lastLon) > 180)
      context.moveTo(x, y);
    else context.lineTo(x, y);
    lastLon = point.lon;
  }
  // A dark, soft outline keeps the orange edge legible over snow and deserts.
  context.strokeStyle = "rgba(8, 14, 25, 0.7)";
  context.lineWidth = (highViz ? 5 : 4) / scale;
  context.shadowColor = "rgba(0, 0, 0, 0.5)";
  context.shadowBlur = 2;
  context.stroke();
  context.shadowBlur = 0;
  context.strokeStyle = "#ff8b46";
  context.lineWidth = (highViz ? 3 : 2.25) / scale;
  context.stroke();
  context.restore();
}
