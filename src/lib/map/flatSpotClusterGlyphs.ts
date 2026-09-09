/**
 * Flat-map (equirectangular) rendering layer for SP-05 geographic spot groups.
 *
 * `FlatMapView` paints spots onto a 2D canvas rather than through R3F, so the
 * globe's `SpotCluster` beacon meshes and the azimuthal projection's DOM
 * buttons do not apply. Projection, sizing and hit-testing live here as plain
 * functions so all three can be unit-tested without a canvas context; only
 * `drawFlatClusterGlyphs` needs a 2D context, and it reads values the builder
 * already resolved rather than deriving any of its own.
 *
 * Every glyph here originates from `clusterSpots`, so `FlatClusterGlyph.id` is
 * always a geographic group id (`g:<version>:…`) that `expandGroup` accepts.
 * The flat map has no screen-space aggregate beacons, so no
 * `isScreenSpaceBeaconId` filtering is needed on this host.
 *
 * Coordinates are *logical canvas* coordinates — the same space
 * `latLonToCanvas` produces and the same space `FlatMapView`'s existing label
 * hit-testing converts pointer positions into. Every size is divided by the
 * zoom damping factor the rest of the flat renderer uses, so the constants
 * below all read as **screen** pixels and hold that size while zooming.
 */
import type { SpotCluster } from "@/lib/spots/grouping";
import { stationContrast } from "@/lib/themes/stationTokens";
import {
  MODE_INK_LIGHT,
  getSpotColor,
  inkOnFill,
  type SpotColorMode,
} from "@/lib/utils/spotColors";

export interface FlatClusterGlyph {
  /** Geographic group id, accepted by `expandGroup`. */
  id: string;
  /** Member count drawn inside the glyph. */
  count: number;
  /** Human-readable group name for hover, e.g. "Spain". */
  label: string;
  /** Logical canvas coordinates of the group anchor. */
  x: number;
  y: number;
  /** Logical canvas radius of the drawn disc. */
  radius: number;
  /** Logical canvas radius of the pointer target; never below `radius`. */
  hitRadius: number;
  /** Logical canvas size of the count text. */
  fontPx: number;
  /** Opaque disc fill, from the same palette the dots use. */
  color: string;
  /** Count ink, at WCAG AA (>= 4.5:1) against `color`. */
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
 *
 * Scaled by `spotDotScale` for the same reason a single's hit radius is
 * (`Math.max(10, 12 * spotDotScale)` in `FlatMapView`): at the 0.5 end of the
 * dot-size slider a fixed 18px target would be nearly three times the drawn
 * disc and would steal clicks from the singles around it.
 */
const MIN_HIT_RADIUS_PX = 18;

/**
 * Screen-space floor on the count text. The audience wears glasses; a 7px
 * numeral (what `radius * 1.05` yields at the bottom of the dot-size slider)
 * is not readable. `minRadiusForCount` keeps the disc large enough to hold a
 * numeral drawn at this size.
 */
const MIN_COUNT_FONT_PX = 11;

/**
 * Screen-space cap on the drawn radius. `spotLimit` is clamped to 200
 * (`spotContracts.ts`, re-clamped in `dxFilters.ts`; default 150), and the
 * dot-size slider tops out at 2.0, so the reachable worst case is a single
 * 200-member group at ~53.6px radius / 107px diameter. This holds it to 68px
 * across.
 */
const MAX_GLYPH_RADIUS_PX = 34;

/** Void-black canvas ink, matching the flat map's other opaque chrome. */
const GLYPH_OUTLINE = "#0a0a1a";

const AA_CONTRAST = 4.5;

/** Smallest disc that holds `count` drawn at `MIN_COUNT_FONT_PX`. */
function minRadiusForCount(count: number): number {
  // Monospace advance is ~0.6em; leave a ~2px ring of fill around the number.
  return (MIN_COUNT_FONT_PX * 0.6 * String(count).length) / 2 + 2;
}

/**
 * Count text size for a disc of `radiusPx`.
 *
 * `radiusPx * 1.05` alone tracks the disc but never reconsiders how many
 * digits have to fit, so a three-digit count reaches the disc edge with no
 * padding. The digit term keeps the numeral inside; the 11px legibility floor
 * still wins over both, and the disc floor below is sized to hold a numeral
 * drawn at it.
 */
function countFontPx(count: number, radiusPx: number): number {
  const digits = String(count).length;
  return Math.max(
    MIN_COUNT_FONT_PX,
    Math.min(radiusPx * 1.05, (radiusPx * 1.6) / digits),
  );
}

function glyphRadiusPx(count: number, spotDotScale: number): number {
  // log2 curve, matching the aggregate beacon size ramp used on the globe:
  // a 3-member group stays close to a spot dot, a 200-member group is roughly
  // twice that, and no group can swallow a continent.
  const growth = Math.log2(Math.max(2, count)) * 2.2;
  const scaled = (10 + growth) * spotDotScale;
  return Math.min(
    MAX_GLYPH_RADIUS_PX,
    Math.max(minRadiusForCount(count), scaled),
  );
}

function parseHex(hex: string): [number, number, number] {
  const value = hex.replace("#", "");
  const full =
    value.length === 3
      ? value
          .split("")
          .map((char) => char + char)
          .join("")
      : value.slice(0, 6);
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ];
}

function mixToward(hex: string, target: 0 | 255, amount: number): string {
  const channels = parseHex(hex).map((channel) =>
    Math.round(channel + (target - channel) * amount),
  );
  return `#${channels.map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

/**
 * A disc fill and a count ink that clear WCAG AA together.
 *
 * `getSpotColor` serves four ramps — mode, band, snr and age — and the age
 * ramp is a brightness ramp on one hue, so several of its buckets sit in the
 * mid-luminance band where *neither* `inkOnFill` candidate reaches 4.5:1
 * (`#256b80` bottoms out at 3.94:1). `inkOnFill` returns the better of the two
 * in that case, which is still a failing pair, so the fill is stepped away
 * from the chosen ink — darker under light ink, lighter under dark ink — by
 * the smallest 2% step that clears AA. Channel-proportional stepping keeps the
 * hue, so the age ramp still reads as an ordered brightness ramp.
 */
export function accessibleGlyphFill(fill: string): {
  fill: string;
  ink: string;
} {
  const ink = inkOnFill(fill);
  if (stationContrast(ink, fill) >= AA_CONTRAST) return { fill, ink };
  const target = ink === MODE_INK_LIGHT ? 0 : 255;
  for (let amount = 0.02; amount <= 1; amount += 0.02) {
    const candidate = mixToward(fill, target, amount);
    if (stationContrast(ink, candidate) >= AA_CONTRAST) {
      return { fill: candidate, ink };
    }
  }
  // Unreachable for any real colour: pure black and pure white clear AA
  // against `MODE_INK_LIGHT` and `MODE_INK_DARK` respectively.
  return { fill: target === 0 ? "#000000" : "#ffffff", ink };
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
    const { fill, ink } = accessibleGlyphFill(
      getSpotColor(cluster.primarySpot, colorMode),
    );
    const radiusPx = glyphRadiusPx(cluster.count, spotDotScale);
    glyphs.push({
      id: cluster.id,
      count: cluster.count,
      label: cluster.label ?? "Geographic group",
      x: point.x,
      y: point.y,
      radius: radiusPx / zoomDamp,
      hitRadius:
        Math.max(radiusPx, MIN_HIT_RADIUS_PX * spotDotScale) / zoomDamp,
      fontPx: countFontPx(cluster.count, radiusPx) / zoomDamp,
      color: fill,
      ink,
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
): FlatClusterGlyph | null {
  let best: FlatClusterGlyph | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const glyph of glyphs) {
    const distance = Math.hypot(point.x - glyph.x, point.y - glyph.y);
    if (distance > glyph.hitRadius) continue;
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

/** Hover/click label for a glyph, matching the collection popover's title. */
export function flatClusterGlyphTooltip(glyph: FlatClusterGlyph): string {
  return `${glyph.count} spots · ${glyph.label}`;
}

/**
 * Paint the group discs and their counts.
 *
 * The disc is filled **opaque** with the (AA-adjusted) spot colour and the
 * count is drawn in the matching ink. A low-alpha tint of the fill hue behind
 * full-saturation text is what dropped `SpotRow`'s band chip to 2.01:1; an
 * opaque fill plus an AA-checked ink cannot do that, and the ratio is
 * identical in both themes because canvas colours are theme-invariant. The
 * outline is the void-black canvas ink, so no halo is drawn.
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

    ctx.font = `bold ${glyph.fontPx.toFixed(2)}px monospace`;
    ctx.fillStyle = glyph.ink;
    ctx.fillText(String(glyph.count), glyph.x, glyph.y);
  }
  ctx.restore();
}
