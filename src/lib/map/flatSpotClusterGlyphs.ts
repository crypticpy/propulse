/**
 * Flat-map (equirectangular) rendering layer for SP-05 geographic spot groups.
 *
 * `FlatMapView` paints spots onto a 2D canvas rather than through R3F, so the
 * globe's `SpotCluster` beacon meshes and the azimuthal projection's DOM
 * buttons do not apply. Projection and hit-testing live here as plain
 * functions so both can be unit-tested without a canvas context; only
 * `drawFlatClusterGlyphs` needs a 2D context.
 *
 * Every glyph here originates from `clusterSpots`, so `FlatClusterGlyph.id` is
 * always a geographic group id (`g:<version>:…`) that `expandGroup` accepts.
 * The flat map has no screen-space aggregate beacons, so no
 * `isScreenSpaceBeaconId` filtering is needed on this host.
 *
 * Coordinates are *logical canvas* coordinates — the same space
 * `latLonToCanvas` produces and the same space `FlatMapView`'s existing label
 * hit-testing converts pointer positions into. Sizes are divided by the zoom
 * damping factor the rest of the flat renderer uses, so a glyph holds roughly
 * constant screen size while zooming.
 */
import type { SpotCluster } from "@/lib/spots/grouping";
import {
  getSpotColor,
  inkOnFill,
  type SpotColorMode,
} from "@/lib/utils/spotColors";

export interface FlatClusterGlyph {
  /** Geographic group id, accepted by `expandGroup`. */
  id: string;
  /** Member count drawn inside the glyph. */
  count: number;
  /** Logical canvas coordinates of the group anchor. */
  x: number;
  y: number;
  /** Logical canvas radius of the drawn disc. */
  radius: number;
  /** Opaque disc fill, from the same palette the dots use. */
  color: string;
  /** Count ink chosen to clear WCAG AA (>= 4.5:1) against `color`. */
  ink: string;
  cluster: SpotCluster;
}

export interface FlatClusterGlyphOptions {
  width: number;
  height: number;
  zoomScale?: number;
  spotDotScale?: number;
  colorMode?: SpotColorMode;
}

/**
 * Screen-space floor on the pointer target, matching `TARGET_HIT_RADIUS` on
 * the flat map. A three-report group draws at ~13.5px, below a comfortable
 * touch target, so the hit disc is widened past the drawn disc.
 */
const MIN_HIT_RADIUS_PX = 18;

/** Void-black canvas ink, matching the flat map's other opaque chrome. */
const GLYPH_OUTLINE = "#0a0a1a";

function glyphRadiusPx(count: number, spotDotScale: number): number {
  // log2 curve, matching the aggregate beacon size ramp used on the globe:
  // a 3-member group stays close to a spot dot, a 200-member group is roughly
  // twice that, and no group can swallow a continent.
  const growth = Math.log2(Math.max(2, count)) * 2.2;
  return (10 + growth) * spotDotScale;
}

/**
 * Project geographic groups onto the flat canvas.
 *
 * `projectToCanvas` is injected rather than imported so this module stays free
 * of `FlatMapView`'s private equirectangular helper, mirroring
 * `buildAzimuthalSpotClusters`.
 */
export function buildFlatClusterGlyphs(
  clusters: readonly SpotCluster[],
  projectToCanvas: (lat: number, lon: number) => { x: number; y: number },
  options: FlatClusterGlyphOptions,
): FlatClusterGlyph[] {
  const {
    width,
    height,
    zoomScale = 1,
    spotDotScale = 1,
    colorMode = "mode",
  } = options;
  const zoomDamp = Math.max(1, zoomScale);
  const glyphs: FlatClusterGlyph[] = [];
  for (const cluster of clusters) {
    const { lat, lon } = cluster.center;
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const point = projectToCanvas(lat, lon);
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) continue;
    if (point.x < 0 || point.x > width || point.y < 0 || point.y > height) {
      continue;
    }
    const color = getSpotColor(cluster.primarySpot, colorMode);
    glyphs.push({
      id: cluster.id,
      count: cluster.count,
      x: point.x,
      y: point.y,
      radius: glyphRadiusPx(cluster.count, spotDotScale) / zoomDamp,
      color,
      ink: inkOnFill(color),
      cluster,
    });
  }
  return glyphs;
}

/**
 * Nearest glyph whose hit disc contains `point`, or null. Ties resolve to the
 * closest center so overlapping groups stay individually reachable.
 */
export function findFlatClusterGlyphAtPoint(
  glyphs: readonly FlatClusterGlyph[],
  point: { x: number; y: number },
  zoomScale = 1,
): FlatClusterGlyph | null {
  const zoomDamp = Math.max(1, zoomScale);
  let best: FlatClusterGlyph | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const glyph of glyphs) {
    const hitRadius = Math.max(glyph.radius, MIN_HIT_RADIUS_PX / zoomDamp);
    const distance = Math.hypot(point.x - glyph.x, point.y - glyph.y);
    if (distance > hitRadius) continue;
    if (distance < bestDistance) {
      best = glyph;
      bestDistance = distance;
    }
  }
  return best;
}

/** Screen anchor for a glyph, in the same shape the spot popovers expect. */
export function flatClusterGlyphAnchor(
  glyph: FlatClusterGlyph,
  toScreen: (x: number, y: number) => { x: number; y: number },
  screenRadius: number,
): { x: number; y: number; width: number; height: number } {
  const center = toScreen(glyph.x, glyph.y);
  return {
    x: center.x - screenRadius,
    y: center.y - screenRadius,
    width: screenRadius * 2,
    height: screenRadius * 2,
  };
}

/**
 * Paint the group discs and their counts.
 *
 * The disc is filled **opaque** with the spot colour and the count is drawn in
 * `inkOnFill(color)`, the same helper the mode badges use. A low-alpha tint of
 * the fill hue behind full-saturation text is what dropped `SpotRow`'s band
 * chip to 2.01:1; an opaque fill plus AA-selected ink cannot do that, and the
 * ratio is identical in both themes because canvas colours are theme-invariant.
 * The outline is the void-black canvas ink, so no halo is drawn.
 */
export function drawFlatClusterGlyphs(
  ctx: CanvasRenderingContext2D,
  glyphs: readonly FlatClusterGlyph[],
  options: { zoomScale?: number; highViz?: boolean } = {},
): void {
  const { zoomScale = 1, highViz = false } = options;
  const zoomDamp = Math.max(1, zoomScale);
  if (glyphs.length === 0) return;
  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (const glyph of glyphs) {
    ctx.beginPath();
    ctx.arc(glyph.x, glyph.y, glyph.radius, 0, Math.PI * 2);
    ctx.fillStyle = glyph.color;
    ctx.fill();
    ctx.strokeStyle = GLYPH_OUTLINE;
    ctx.lineWidth = (highViz ? 2.5 : 1.5) / zoomDamp;
    ctx.stroke();

    const fontSize = Math.max(1, Math.round(glyph.radius * 1.05));
    ctx.font = `bold ${fontSize}px monospace`;
    ctx.fillStyle = glyph.ink;
    ctx.fillText(String(glyph.count), glyph.x, glyph.y);
  }
  ctx.restore();
}
