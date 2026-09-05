/**
 * Lightning bolt glyph — shared canvas-drawn icon for the 2D and 3D lightning
 * layers.
 *
 * Before this module, `LightningOverlay3D` drew strikes as additive-blended
 * spheres and `LightningLayer2D` drew plain circles, so a strike read as a
 * "giant bloomy white dot" instead of lightning. Both layers now stamp the
 * same canvas-drawn bolt silhouette (`drawLightningBolt`) into a texture
 * (3D, `getLightningGlyphTexture`) or an `ImageData` (2D,
 * `getLightningGlyphImageData`) so the icon can never drift between views.
 *
 * The tone is read from the `--hc-warn` CSS token (never a hardcoded hex)
 * via `resolveLightningTone`, with a fallback chain that mirrors the
 * `--hc-warn-rgb: var(--color-caution-rgb, 255 210 63)` declaration in
 * `hamclock-themes.css` so the glyph still renders a sane colour outside the
 * HamClock wall (no `[data-hamclock-theme]` ancestor) or in non-DOM test
 * environments.
 */

import * as THREE from "three";

/**
 * Bolt silhouette as a closed polygon, normalised to a 0..1 unit box
 * (fraction of the glyph size). A classic zig-zag: a long diagonal down to a
 * point, then a short kick back up-right, mirroring the familiar "flash"
 * icon rather than a blob. Exported on its own so it can be unit tested
 * without a canvas (jsdom does not implement 2D canvas rendering).
 */
export const LIGHTNING_BOLT_PATH: readonly (readonly [number, number])[] = [
  [0.65, 0.0],
  [0.24, 0.55],
  [0.45, 0.55],
  [0.35, 1.0],
  [0.87, 0.4],
  [0.55, 0.4],
];

/** Fallback tone (matches `--color-caution-rgb`'s own default) for contexts
 * with no stylesheet — e.g. a test environment, or a canvas built before the
 * document's styles are attached. */
const FALLBACK_WARN_RGB = "255 210 63";

/** Square texture resolution for the 3D billboard (oversampled so the bolt
 * stays crisp at the ~18-24px on-screen size the globe renders it at). */
const TEXTURE_SIZE = 64;

/** Square icon resolution for the 2D maplibre symbol layer. Exported so the
 * 2D layer can convert it into a maplibre `icon-size` scale factor. */
export const LIGHTNING_ICON_SIZE = 32;

// ---------------------------------------------------------------------------
// Shared pulse/fade timing — both LightningOverlay3D and LightningLayer2D
// import these so their animations can never drift apart.
// ---------------------------------------------------------------------------

/** A strike is "fresh" (pulses, full brightness) until this age. This is the
 * existing flash window the 3D overlay has always used to mark a strike as
 * new; the 2D layer now shares it rather than inventing its own. */
export const LIGHTNING_FRESH_WINDOW_MS = 5000;

/** Duration of the one-time scale pulse a fresh strike gets on arrival. */
export const LIGHTNING_PULSE_DURATION_MS = 600;

/** Peak extra scale during the pulse: 1 -> 1 + PEAK -> 1 (i.e. 1.6x). */
export const LIGHTNING_PULSE_PEAK = 0.6;

/** Age at which a strike has fully aged out and settles at
 * LIGHTNING_FADED_BRIGHTNESS (3D also stops rendering strikes past this). */
export const LIGHTNING_MAX_AGE_MS = 10 * 60 * 1000;

/** Brightness floor a strike fades toward as it ages past the fresh window. */
export const LIGHTNING_FADED_BRIGHTNESS = 0.35;

/** Max peak current (kA) used to normalise strike intensity/size. */
export const LIGHTNING_MAX_CURRENT_KA = 200;

/** Modest on-screen size range across intensity (peak current) — strong
 * strikes read as slightly bigger without anything dominating. */
export const LIGHTNING_MIN_SIZE_FACTOR = 0.9;
export const LIGHTNING_MAX_SIZE_FACTOR = 1.15;

/** Base on-screen glyph size in pixels — within the spec's 18-24px range. */
export const LIGHTNING_BASE_PIXEL_SIZE = 20;

/**
 * Draw the bolt silhouette into `ctx`, filled solid in `color`, scaled to a
 * `size` x `size` box anchored at the canvas origin. Pure canvas path code —
 * no globals, no caching — so it is the one piece of this module that is
 * directly unit testable.
 */
export function drawLightningBolt(
  ctx: CanvasRenderingContext2D,
  size: number,
  color: string,
): void {
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  LIGHTNING_BOLT_PATH.forEach(([nx, ny], index) => {
    const x = nx * size;
    const y = ny * size;
    if (index === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  });
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/**
 * Resolve the lightning tone from the `--hc-warn` token at call time.
 *
 * `--hc-warn` is declared as `rgb(var(--hc-warn-rgb))`; modern browsers
 * resolve that chain when computing the custom property, so the common case
 * just returns the resolved `rgb(...)` string. If an environment leaves the
 * `var(...)` unresolved (or the token is missing entirely — no document, no
 * stylesheet), fall back to reading `--hc-warn-rgb` directly, and finally to
 * the caution default baked into `hamclock-themes.css`.
 */
export function resolveLightningTone(): string {
  if (typeof document === "undefined") {
    return `rgb(${FALLBACK_WARN_RGB})`;
  }

  const root = getComputedStyle(document.documentElement);

  const warn = root.getPropertyValue("--hc-warn").trim();
  if (warn && !warn.includes("var(")) {
    return warn;
  }

  const warnRgb = root.getPropertyValue("--hc-warn-rgb").trim();
  if (warnRgb) {
    return `rgb(${warnRgb})`;
  }

  return `rgb(${FALLBACK_WARN_RGB})`;
}

/**
 * Build (or reuse) an off-screen canvas with the bolt drawn at `size` in
 * `color`. Returns `null` when canvas 2D rendering isn't available — jsdom's
 * default `HTMLCanvasElement.getContext` returns `null` — so callers can
 * degrade gracefully instead of throwing in tests.
 */
function buildGlyphCanvas(color: string, size: number): HTMLCanvasElement | null {
  if (typeof document === "undefined") return null;

  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  drawLightningBolt(ctx, size, color);
  return canvas;
}

const textureCache = new Map<string, THREE.CanvasTexture>();

/**
 * Memoised per colour: the 3D billboard sprite texture for a given strike
 * tone. Built once per colour and reused for every instance/frame instead of
 * re-rasterising the glyph continuously.
 */
export function getLightningGlyphTexture(color: string): THREE.CanvasTexture | null {
  const cached = textureCache.get(color);
  if (cached) return cached;

  const canvas = buildGlyphCanvas(color, TEXTURE_SIZE);
  if (!canvas) return null;

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  textureCache.set(color, texture);
  return texture;
}

const imageDataCache = new Map<string, ImageData>();

/**
 * Memoised per colour: the same bolt glyph as raw `ImageData`, for maplibre's
 * `map.addImage` (a symbol layer icon rather than a three.js texture).
 */
export function getLightningGlyphImageData(color: string): ImageData | null {
  const cached = imageDataCache.get(color);
  if (cached) return cached;

  const canvas = buildGlyphCanvas(color, LIGHTNING_ICON_SIZE);
  if (!canvas) return null;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  const imageData = ctx.getImageData(0, 0, LIGHTNING_ICON_SIZE, LIGHTNING_ICON_SIZE);
  imageDataCache.set(color, imageData);
  return imageData;
}
