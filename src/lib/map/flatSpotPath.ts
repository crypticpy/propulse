/** Equirectangular short-path geometry used only by the flat spot renderer. */
export interface FlatSpotPoint {
  readonly x: number;
  readonly y: number;
}
type Segment = readonly FlatSpotPoint[];
const cache = new Map<string, readonly Segment[]>();
const MAX_PATHS = 512;
const RAD = Math.PI / 180;

/** Bounded geometry cache avoids repeating spherical interpolation on repaint. */
export function flatSpotPath(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
  width: number,
  height: number,
): readonly Segment[] {
  if (
    ![lat1, lon1, lat2, lon2, width, height].every(Number.isFinite) ||
    Math.abs(lat1) > 90 || Math.abs(lat2) > 90 ||
    Math.abs(lon1) > 180 || Math.abs(lon2) > 180 ||
    width <= 0 || height <= 0
  ) return [];
  const key = [lat1, lon1, lat2, lon2, width, height].join(":");
  const hit = cache.get(key);
  if (hit) {
    cache.delete(key);
    cache.set(key, hit);
    return hit;
  }
  const vector = (lat: number, lon: number) => [
    Math.cos(lat * RAD) * Math.cos(lon * RAD),
    Math.cos(lat * RAD) * Math.sin(lon * RAD),
    Math.sin(lat * RAD),
  ];
  const a = vector(lat1, lon1);
  const b = vector(lat2, lon2);
  const dot = Math.max(-1, Math.min(1, a.reduce((sum, v, i) => sum + v * b[i], 0)));
  const tangent = b.map((v, i) => v - dot * a[i]);
  let length = Math.hypot(...tangent);
  const angle = Math.atan2(length, dot);
  if (length < 1e-12) {
    // Coincident endpoints need no interpolation. Exactly antipodal endpoints
    // have no unique short path: pick a deterministic perpendicular direction.
    const axis = a.map(Math.abs).indexOf(Math.min(...a.map(Math.abs)));
    for (let i = 0; i < 3; i++)
      tangent[i] = (i === axis ? 1 : 0) - a[axis] * a[i];
    length = Math.hypot(...tangent);
  }
  for (let i = 0; i < 3; i++)
    tangent[i] /= length;
  const project = (lat: number, lon: number): FlatSpotPoint => ({
    x: (lon + 180) / 360 * width,
    y: (90 - lat) / 180 * height,
  });
  const points: FlatSpotPoint[] = [project(lat1, lon1)];
  const steps = angle < 1e-12 ? 1 : Math.max(8, Math.ceil(angle / (Math.PI / 96)));
  for (let i = 1; i < steps; i++) {
    const t = angle * i / steps;
    const v = a.map((value, j) => Math.cos(t) * value + Math.sin(t) * tangent[j]);
    points.push(project(
      Math.atan2(v[2], Math.hypot(v[0], v[1])) / RAD,
      Math.atan2(v[1], v[0]) / RAD,
    ));
  }
  points.push(angle < 1e-12 ? points[0] : project(lat2, lon2));
  const segments: FlatSpotPoint[][] = [[points[0]]];
  for (let i = 1; i < points.length; i++) {
    const previous = points[i - 1], point = points[i];
    const dx = point.x - previous.x;
    if (Math.abs(dx) > width / 2) {
      // Finish on one date-line edge and resume on the other, without a
      // canvas-wide chord or an unpainted gap between samples and the edge.
      const unwrappedX = point.x + (dx > 0 ? -width : width);
      const edge = dx > 0 ? 0 : width;
      const denominator = unwrappedX - previous.x;
      const fraction = Math.abs(denominator) < 1e-12 ? 0 : (edge - previous.x) / denominator;
      const y = previous.y + fraction * (point.y - previous.y);
      segments[segments.length - 1].push({ x: edge, y });
      segments.push([{ x: width - edge, y }, point]);
    } else {
      segments[segments.length - 1].push(point);
    }
  }
  const result = segments.map(segment => Object.freeze(segment.map(point => Object.freeze(point))));
  if (cache.size >= MAX_PATHS)
    cache.delete(cache.keys().next().value!);
  cache.set(key, Object.freeze(result));
  return result;
}

export function traceFlatSpotPath(
  ctx: Pick<CanvasRenderingContext2D, "beginPath" | "moveTo" | "lineTo">,
  segments: readonly Segment[],
): void {
  ctx.beginPath();
  for (const segment of segments) {
    ctx.moveTo(segment[0].x, segment[0].y);
    for (let i = 1; i < segment.length; i++)
      ctx.lineTo(segment[i].x, segment[i].y);
  }
}

/** DX station = transmitter; reporting/spotter station = receiver. */
export function traceFlatSpotEndpoint(
  ctx: Pick<CanvasRenderingContext2D, "beginPath" | "arc" | "rect">,
  x: number,
  y: number,
  radius: number,
  endpoint: "tx" | "rx",
): void {
  ctx.beginPath();
  if (endpoint === "tx")
    ctx.arc(x, y, radius, 0, Math.PI * 2);
  else
    ctx.rect(x - radius, y - radius, radius * 2, radius * 2);
}
