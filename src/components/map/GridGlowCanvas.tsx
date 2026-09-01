/**
 * GridGlowCanvas — Canvas 2D grid glow renderer for FlatMapView
 *
 * Renders brief glow pulses on Maidenhead grid squares (4-char)
 * when live spots arrive. Exports a draw function to be called from
 * FlatMapView's canvas render loop — not a React component.
 *
 * When `persistEdges` is enabled (Grid Activity layer), each pulse also
 * leaves a glowing stroked outline on the cell edge that holds at full
 * brightness for 60s after the spot and fades out by 90s.
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
const MAX_ACTIVE_GLOWS = 256;

/** Rise phase duration (ms) — intensity climbs from 0 → peak */
const RISE_DURATION_MS = 300;

/** Fade phase duration (ms) — intensity decays from peak → 0 */
const FADE_DURATION_MS = 700;

/** Total glow lifecycle (ms) */
const TOTAL_DURATION_MS = RISE_DURATION_MS + FADE_DURATION_MS;

/** Persist-edge mode: hold the cell outline fully lit this long (ms) */
const PERSIST_HOLD_MS = 60_000;

/** Persist-edge mode: fade-out duration after the hold (ms) */
const PERSIST_FADE_MS = 30_000;

/** Persist-edge mode: total outline lifetime (ms) */
const PERSIST_TOTAL_MS = PERSIST_HOLD_MS + PERSIST_FADE_MS;

/** Default peak alpha when a single spot triggers a glow */
/** Fill alpha for a persisted cell with a single spot */
const PERSIST_FILL_MIN_ALPHA = 0.16;

/** Fill alpha for a persisted cell at full activity weight */
const PERSIST_FILL_MAX_ALPHA = 0.44;

const DEFAULT_PEAK_ALPHA = 0.55;

/** Absolute ceiling for boosted peak intensity */
const MAX_PEAK_INTENSITY = 1.0;

/** Boost added to peak intensity when a duplicate spot arrives */
const DUPLICATE_BOOST = 0.15;

/** Small floor for the "radial" mode glow radius so tiny/degenerate cells still render */
const MIN_RADIAL_RADIUS_PX = 4;

// ---------------------------------------------------------------------------
// Easing helpers (inline, no dependencies)
// ---------------------------------------------------------------------------

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

/**
 * Normalise a glow's accumulated peak intensity into a 0..1 activity weight.
 * `addGlow` boosts `peakIntensity` each time another spot lands in the same
 * square, so it stands in for spot density on the 2D canvas.
 */
function densityWeight(peakIntensity: number): number {
  return clamp01(
    (peakIntensity - DEFAULT_PEAK_ALPHA) /
      (MAX_PEAK_INTENSITY - DEFAULT_PEAK_ALPHA),
  );
}

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
  const lonSquare = square.charCodeAt(2) - 48; // 0-9
  const latSquare = square.charCodeAt(3) - 48; // 0-9
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

  /**
   * When true (Grid Activity layer on), each glow also draws a filled and
   * bordered cell highlight that persists for PERSIST_TOTAL_MS after the
   * spot, and glows live that long instead of just the pulse duration.
   */
  persistEdges = false;

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
   * @param ctx             Canvas 2D rendering context
   * @param project         Function converting (lat, lon) → canvas pixel
   *                        coordinates. May report `visible: false` when the
   *                        projected point falls outside the visible map
   *                        area (used by "radial" mode).
   * @param now             Current timestamp (same time-base used in addGlow)
   * @param projectionMode  "rect" (default) draws an axis-aligned rect from
   *                        two projected corners — correct for the flat
   *                        equirectangular view. "radial" projects the cell
   *                        center plus all four corners and draws a
   *                        radial-gradient circle instead, since projections
   *                        like azimuthal equidistant warp the cell into a
   *                        non-axis-aligned quad.
   */
  draw(
    ctx: CanvasRenderingContext2D,
    project: (
      lat: number,
      lon: number,
    ) => { x: number; y: number; visible?: boolean },
    now: number,
    projectionMode: "rect" | "radial" = "rect",
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
      const edgeIntensity = this.persistEdges
        ? this.computeEdgeIntensity(glow, now)
        : 0;
      if (intensity <= 0 && edgeIntensity <= 0) continue;

      const alpha = intensity;
      const rgba = colorWithAlpha(glow.color, alpha);
      const rgbaMid = colorWithAlpha(glow.color, alpha * 0.5);
      const rgbaTransparent = colorWithAlpha(glow.color, 0);

      if (projectionMode === "radial") {
        const cellCenterLat = (glow.minLat + glow.maxLat) / 2;
        const cellCenterLon = (glow.minLon + glow.maxLon) / 2;
        const center = project(cellCenterLat, cellCenterLon);
        if (center.visible === false) continue;

        // Perimeter order: TL, TR, BR, BL (also used for the edge stroke)
        const corners = [
          project(glow.maxLat, glow.minLon),
          project(glow.maxLat, glow.maxLon),
          project(glow.minLat, glow.maxLon),
          project(glow.minLat, glow.minLon),
        ];

        if (intensity > 0) {
          let radius = MIN_RADIAL_RADIUS_PX;
          for (const corner of corners) {
            if (corner.visible === false) continue;
            const dx = corner.x - center.x;
            const dy = corner.y - center.y;
            radius = Math.max(radius, Math.sqrt(dx * dx + dy * dy));
          }

          const gradient = ctx.createRadialGradient(
            center.x,
            center.y,
            0,
            center.x,
            center.y,
            radius,
          );
          gradient.addColorStop(0, rgba);
          gradient.addColorStop(0.6, rgbaMid);
          gradient.addColorStop(1, rgbaTransparent);

          ctx.fillStyle = gradient;
          ctx.beginPath();
          ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
          ctx.fill();
        }

        // Persist-edge outline — stroke the projected (warped) cell quad.
        // Skip if any corner is off the visible map to avoid stray lines.
        if (
          edgeIntensity > 0 &&
          corners.every((c) => c.visible !== false)
        ) {
          ctx.beginPath();
          ctx.moveTo(corners[0].x, corners[0].y);
          for (let c = 1; c < corners.length; c++) {
            ctx.lineTo(corners[c].x, corners[c].y);
          }
          ctx.closePath();
          this.paintPersistCell(
            ctx,
            glow.color,
            edgeIntensity,
            densityWeight(glow.peakIntensity),
          );
        }
        continue;
      }

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

      if (intensity > 0) {
        const cx = x + w / 2;
        const cy = y + h / 2;

        // Radial gradient from center, fading at edges.
        // Radius = half the diagonal so the gradient reaches corners.
        const radius = Math.sqrt(w * w + h * h) / 2;

        const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
        gradient.addColorStop(0, rgba);
        gradient.addColorStop(0.6, rgbaMid);
        gradient.addColorStop(1, rgbaTransparent);

        ctx.fillStyle = gradient;
        ctx.fillRect(x, y, w, h);
      }

      // Persisted highlight — fill and border the cell rectangle
      if (edgeIntensity > 0) {
        ctx.beginPath();
        ctx.rect(x, y, w, h);
        this.paintPersistCell(
          ctx,
          glow.color,
          edgeIntensity,
          densityWeight(glow.peakIntensity),
        );
      }
    }

    ctx.restore();
  }

  /**
   * Returns true if any glows are currently active.
   * Useful for render-loop optimization — skip the draw call entirely
   * when there is nothing to render.
   *
   * Prunes expired glows first (using Date.now(), the time-base both call
   * sites use for addGlow) so RAF loops keyed on this method terminate
   * even when draw() is being skipped by layer toggles.
   */
  hasActiveGlows(): boolean {
    this.pruneExpired(Date.now());
    return this.glows.length > 0;
  }

  /** Active cells currently painted by this renderer, after expiry pruning. */
  getActiveGridSquares(now: number = Date.now()): readonly string[] {
    this.pruneExpired(now);
    return this.glows.map((glow) => glow.gridSquare);
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

  /**
   * Compute the persist-edge outline intensity (0–1): fully lit for
   * PERSIST_HOLD_MS after the spot, easing out to 0 by PERSIST_TOTAL_MS.
   */
  private computeEdgeIntensity(glow: ActiveGlow, now: number): number {
    const elapsed = now - glow.startTime;
    if (elapsed < 0 || elapsed >= PERSIST_TOTAL_MS) return 0;
    if (elapsed < PERSIST_HOLD_MS) return 1;
    return 1 - easeInQuad((elapsed - PERSIST_HOLD_MS) / PERSIST_FADE_MS);
  }

  /**
   * Paint the current path as a highlighted grid square: a tinted fill under
   * a bordered edge.
   *
   * An outline alone does not read as "this square is busy" — the cell has to
   * be filled. The fill and border are drawn with normal compositing rather
   * than the additive mode used for the transient pulse, because additive
   * blending adds toward white and disappears over a bright basemap.
   *
   * @param density - 0..1 activity weight, driving the fill alpha
   */
  private paintPersistCell(
    ctx: CanvasRenderingContext2D,
    color: string,
    edgeIntensity: number,
    density: number,
  ): void {
    const previousComposite = ctx.globalCompositeOperation;
    ctx.globalCompositeOperation = "source-over";

    const fillAlpha =
      (PERSIST_FILL_MIN_ALPHA +
        (PERSIST_FILL_MAX_ALPHA - PERSIST_FILL_MIN_ALPHA) *
          clamp01(density)) *
      edgeIntensity;
    ctx.fillStyle = colorWithAlpha(color, fillAlpha);
    ctx.fill();

    ctx.strokeStyle = colorWithAlpha(color, edgeIntensity * 0.35);
    ctx.lineWidth = 3.5;
    ctx.stroke();

    ctx.strokeStyle = colorWithAlpha(color, edgeIntensity * 0.95);
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.globalCompositeOperation = previousComposite;
  }

  /** Remove glows whose total duration has elapsed. */
  private pruneExpired(now: number): void {
    const lifetime = this.persistEdges ? PERSIST_TOTAL_MS : TOTAL_DURATION_MS;
    // Walk backwards so splice doesn't shift unvisited indices
    for (let i = this.glows.length - 1; i >= 0; i--) {
      if (now - this.glows[i].startTime >= lifetime) {
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
