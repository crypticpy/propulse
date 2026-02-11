/**
 * GridGlowCanvas — Canvas 2D grid glow renderer for FlatMapView
 *
 * Renders brief glow pulses on Maidenhead grid squares (4-char)
 * when live spots arrive. Exports a draw function to be called from
 * FlatMapView's canvas render loop — not a React component.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GridGlowSpot {
  /** 4-char Maidenhead grid square (e.g. "EM10", "FN31", "JO22") */
  gridSquare: string;
  /** CSS color string */
  color: string;
  /** Timestamp when the spot arrived (Date.now() or performance.now()) */
  timestamp: number;
}

interface ActiveGlow {
  /** Upper-case 4-char grid square */
  gridSquare: string;
  /** CSS color string */
  color: string;
  /** Timestamp the glow was first triggered */
  startTime: number;
  /** Current peak intensity (0–1). Boosted when duplicate spots arrive. */
  peakIntensity: number;
  /** Pre-computed geographic bounds */
  minLon: number;
  maxLon: number;
  minLat: number;
  maxLat: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum simultaneous active glows */
const MAX_ACTIVE_GLOWS = 40;

/** Rise phase duration (ms) — intensity climbs from 0 → peak */
const RISE_DURATION_MS = 800;

/** Fade phase duration (ms) — intensity decays from peak → 0 */
const FADE_DURATION_MS = 1200;

/** Total glow lifecycle (ms) */
const TOTAL_DURATION_MS = RISE_DURATION_MS + FADE_DURATION_MS;

/** Default peak alpha when a single spot triggers a glow */
const DEFAULT_PEAK_ALPHA = 0.35;

/** Absolute ceiling for boosted peak intensity */
const MAX_PEAK_INTENSITY = 1.0;

/** Boost added to peak intensity when a duplicate spot arrives */
const DUPLICATE_BOOST = 0.15;

// ---------------------------------------------------------------------------
// Easing helpers (inline, no dependencies)
// ---------------------------------------------------------------------------

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

function easeInQuad(t: number): number {
  return t * t;
}

// ---------------------------------------------------------------------------
// Maidenhead grid square → geographic bounds
// ---------------------------------------------------------------------------

interface GridBounds {
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
}

function gridSquareToBounds(square: string): GridBounds {
  const lonField = square.charCodeAt(0) - 65; // A=0 … R=17
  const latField = square.charCodeAt(1) - 65;
  const lonSquare = parseInt(square[2], 10); // 0-9
  const latSquare = parseInt(square[3], 10); // 0-9
  const baseLon = lonField * 20 - 180 + lonSquare * 2;
  const baseLat = latField * 10 - 90 + latSquare * 1;
  return {
    minLon: baseLon,
    maxLon: baseLon + 2,
    minLat: baseLat,
    maxLat: baseLat + 1,
  };
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function isValidGridSquare(square: string): boolean {
  if (square.length !== 4) return false;
  const a = square.charCodeAt(0);
  const b = square.charCodeAt(1);
  const c = square.charCodeAt(2);
  const d = square.charCodeAt(3);
  // Field: A-R, Square digits: 0-9
  return (
    a >= 65 &&
    a <= 82 &&
    b >= 65 &&
    b <= 82 &&
    c >= 48 &&
    c <= 57 &&
    d >= 48 &&
    d <= 57
  );
}

// ---------------------------------------------------------------------------
// GridGlowRenderer
// ---------------------------------------------------------------------------

export class GridGlowRenderer {
  /** Pool of active glows, kept compact (no holes) */
  private glows: ActiveGlow[] = [];

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  /**
   * Add a new glow pulse for a grid square.
   * If the same grid square already has an active glow, its peak intensity
   * is boosted instead of spawning a duplicate.
   */
  addGlow(spot: GridGlowSpot): void {
    const square = spot.gridSquare.toUpperCase();
    if (!isValidGridSquare(square)) return;

    // Check for an existing active glow on the same square
    const existing = this.glows.find((g) => g.gridSquare === square);
    if (existing) {
      // Boost intensity and reset start time so the glow re-rises
      existing.peakIntensity = Math.min(
        existing.peakIntensity + DUPLICATE_BOOST,
        MAX_PEAK_INTENSITY,
      );
      existing.color = spot.color;
      existing.startTime = spot.timestamp;
      return;
    }

    // Evict oldest (lowest remaining intensity) if pool is full
    if (this.glows.length >= MAX_ACTIVE_GLOWS) {
      this.evictWeakest(spot.timestamp);
    }

    const bounds = gridSquareToBounds(square);
    this.glows.push({
      gridSquare: square,
      color: spot.color,
      startTime: spot.timestamp,
      peakIntensity: DEFAULT_PEAK_ALPHA,
      minLon: bounds.minLon,
      maxLon: bounds.maxLon,
      minLat: bounds.minLat,
      maxLat: bounds.maxLat,
    });
  }

  /**
   * Draw all active glows onto the canvas context.
   *
   * @param ctx     Canvas 2D rendering context
   * @param project Function converting (lat, lon) → canvas pixel coordinates
   * @param now     Current timestamp (same time-base used in addGlow)
   */
  draw(
    ctx: CanvasRenderingContext2D,
    project: (lat: number, lon: number) => { x: number; y: number },
    now: number,
  ): void {
    // Prune expired glows first
    this.pruneExpired(now);

    if (this.glows.length === 0) return;

    // Save context state and switch to additive blending
    ctx.save();
    ctx.globalCompositeOperation = "lighter";

    for (let i = 0; i < this.glows.length; i++) {
      const glow = this.glows[i];
      const intensity = this.computeIntensity(glow, now);
      if (intensity <= 0) continue;

      // Project geographic corners to canvas pixels.
      // maxLat → top of screen (lower Y), minLat → bottom (higher Y).
      const topLeft = project(glow.maxLat, glow.minLon);
      const bottomRight = project(glow.minLat, glow.maxLon);

      const x = topLeft.x;
      const y = topLeft.y;
      const w = bottomRight.x - topLeft.x;
      const h = bottomRight.y - topLeft.y;

      // Skip degenerate rectangles (off-screen or zero-area)
      if (w <= 0 || h <= 0) continue;

      const cx = x + w / 2;
      const cy = y + h / 2;

      // Radial gradient from center, fading at edges.
      // Radius = half the diagonal so the gradient reaches corners.
      const radius = Math.sqrt(w * w + h * h) / 2;

      const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
      const alpha = intensity;

      // Parse the color and build rgba stops
      const rgba = colorWithAlpha(glow.color, alpha);
      const rgbaTransparent = colorWithAlpha(glow.color, 0);

      gradient.addColorStop(0, rgba);
      gradient.addColorStop(0.6, colorWithAlpha(glow.color, alpha * 0.5));
      gradient.addColorStop(1, rgbaTransparent);

      ctx.fillStyle = gradient;
      ctx.fillRect(x, y, w, h);
    }

    ctx.restore();
  }

  /**
   * Returns true if any glows are currently active.
   * Useful for render-loop optimization — skip the draw call entirely
   * when there is nothing to render.
   */
  hasActiveGlows(): boolean {
    return this.glows.length > 0;
  }

  // -----------------------------------------------------------------------
  // Internal helpers
  // -----------------------------------------------------------------------

  /**
   * Compute the current visual intensity (0–1) for a glow based on elapsed
   * time and its peak intensity.
   */
  private computeIntensity(glow: ActiveGlow, now: number): number {
    const elapsed = now - glow.startTime;

    if (elapsed < 0 || elapsed >= TOTAL_DURATION_MS) return 0;

    if (elapsed < RISE_DURATION_MS) {
      // Rise phase: ease-out from 0 → peak
      const t = elapsed / RISE_DURATION_MS;
      return glow.peakIntensity * easeOutCubic(t);
    }

    // Fade phase: ease-in from peak → 0
    const fadeElapsed = elapsed - RISE_DURATION_MS;
    const t = fadeElapsed / FADE_DURATION_MS;
    return glow.peakIntensity * (1 - easeInQuad(t));
  }

  /** Remove glows whose total duration has elapsed. */
  private pruneExpired(now: number): void {
    // Walk backwards so splice doesn't shift unvisited indices
    for (let i = this.glows.length - 1; i >= 0; i--) {
      if (now - this.glows[i].startTime >= TOTAL_DURATION_MS) {
        this.glows.splice(i, 1);
      }
    }
  }

  /** Evict the glow with the lowest remaining intensity to make room. */
  private evictWeakest(now: number): void {
    if (this.glows.length === 0) return;

    let weakestIdx = 0;
    let weakestIntensity = this.computeIntensity(this.glows[0], now);

    for (let i = 1; i < this.glows.length; i++) {
      const intensity = this.computeIntensity(this.glows[i], now);
      if (intensity < weakestIntensity) {
        weakestIntensity = intensity;
        weakestIdx = i;
      }
    }

    this.glows.splice(weakestIdx, 1);
  }
}

// ---------------------------------------------------------------------------
// Color utilities
// ---------------------------------------------------------------------------

/**
 * Convert a CSS color string to an rgba() string with a given alpha.
 *
 * Supports:
 *  - "#rrggbb", "#rgb"
 *  - "rgb(r, g, b)", "rgba(r, g, b, a)"
 *  - Named colors via an offscreen canvas (fallback)
 *
 * For maximum performance in a hot render loop we try fast regex paths
 * first and only fall back to the canvas parse when necessary.
 */

// Pre-compiled regexes — allocated once
const HEX6_RE = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i;
const HEX3_RE = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i;
const RGB_RE = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/;

/** Tiny offscreen canvas used only when regex paths fail */
let _colorCtx: CanvasRenderingContext2D | null = null;

/** Cache parsed (r,g,b) tuples keyed by input color string */
const colorCache = new Map<string, [number, number, number]>();

function parseColorRGB(color: string): [number, number, number] {
  const cached = colorCache.get(color);
  if (cached) return cached;

  let result: [number, number, number] | undefined;

  // #rrggbb
  const hex6 = HEX6_RE.exec(color);
  if (hex6) {
    result = [
      parseInt(hex6[1], 16),
      parseInt(hex6[2], 16),
      parseInt(hex6[3], 16),
    ];
  }

  // #rgb
  if (!result) {
    const hex3 = HEX3_RE.exec(color);
    if (hex3) {
      result = [
        parseInt(hex3[1] + hex3[1], 16),
        parseInt(hex3[2] + hex3[2], 16),
        parseInt(hex3[3] + hex3[3], 16),
      ];
    }
  }

  // rgb() / rgba()
  if (!result) {
    const rgb = RGB_RE.exec(color);
    if (rgb) {
      result = [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
    }
  }

  // Fallback: offscreen canvas
  if (!result) {
    if (!_colorCtx) {
      const c = document.createElement("canvas");
      c.width = 1;
      c.height = 1;
      _colorCtx = c.getContext("2d");
    }
    if (_colorCtx) {
      _colorCtx.clearRect(0, 0, 1, 1);
      _colorCtx.fillStyle = color;
      _colorCtx.fillRect(0, 0, 1, 1);
      const d = _colorCtx.getImageData(0, 0, 1, 1).data;
      result = [d[0], d[1], d[2]];
    } else {
      // Absolute fallback — white
      result = [255, 255, 255];
    }
  }

  colorCache.set(color, result);
  return result;
}

function colorWithAlpha(color: string, alpha: number): string {
  const [r, g, b] = parseColorRGB(color);
  return `rgba(${r},${g},${b},${alpha.toFixed(3)})`;
}
