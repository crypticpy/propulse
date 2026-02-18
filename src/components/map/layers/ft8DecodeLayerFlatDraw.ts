/**
 * ft8DecodeLayerFlatDraw -- Canvas 2D draw function for FT8 decode visualization
 *
 * Pure render function that draws decoded FT8/FT4 stations onto a Canvas 2D
 * context using equirectangular projection. Designed to be called from
 * FlatMapView's render loop or the Ft8DecodeLayerFlat React wrapper.
 *
 * Marker coloring by decode type:
 *   - Green (#00ff88):  CQ stations
 *   - Cyan (#22d3ee):   Regular QSO
 *   - Orange (#f59e0b): Needed entity (pulsing glow)
 *   - Red (#ef4444):    Calling me
 *   - Dim gray (#6b7280): Duplicate
 *
 * Markers fade over time (default 5 minutes) based on decode timestamp.
 */

import type { Ft8EnrichedDecode } from "@/lib/ft8/ft8EnrichedDecode";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface Ft8DecodeLayerFlatDrawProps {
  decodes: Ft8EnrichedDecode[];
  myLat?: number;
  myLon?: number;
  width: number;
  height: number;
  showArcs?: boolean;
  showLabels?: boolean;
  /** Maximum age in ms before markers fully fade (default 5 minutes) */
  ageMaxMs?: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Default age max in milliseconds (5 minutes) */
const DEFAULT_AGE_MAX_MS = 5 * 60 * 1000;

/** Maximum markers to draw */
const MAX_MARKERS = 300;

/** Maximum arcs to draw (CQ stations only) */
const MAX_ARCS = 80;

/** Base marker radius in pixels */
const MARKER_RADIUS_BASE = 3;

/** Marker minimum radius */
const MARKER_RADIUS_MIN = 2;

/** Marker maximum radius */
const MARKER_RADIUS_MAX = 6;

/** Arc line width */
const ARC_LINE_WIDTH = 1;

/** Number of segments per great-circle arc */
const ARC_SEGMENTS = 48;

/** Label font size */
const LABEL_FONT_SIZE = 9;

/** Pulsing glow radius for needed entities */
const NEEDED_GLOW_EXTRA = 4;

// ---------------------------------------------------------------------------
// Color palette
// ---------------------------------------------------------------------------

const COLOR_CQ = "#00ff88";
const COLOR_QSO = "#22d3ee";
const COLOR_NEEDED = "#f59e0b";
const COLOR_CALLING_ME = "#ef4444";
const COLOR_DUPE = "#6b7280";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Convert lat/lon to canvas pixel coordinates using equirectangular projection.
 */
function latLonToPixel(
  lat: number,
  lon: number,
  width: number,
  height: number,
): { x: number; y: number } {
  const x = ((lon + 180) / 360) * width;
  const y = ((90 - lat) / 180) * height;
  return { x, y };
}

/**
 * Determine the display color for a decode based on operational flags.
 */
function getDecodeColor(decode: Ft8EnrichedDecode): string {
  if (decode.isCallingMe) return COLOR_CALLING_ME;
  if (decode.isNeeded) return COLOR_NEEDED;
  if (decode.isDupe) return COLOR_DUPE;
  if (decode.isCQ) return COLOR_CQ;
  return COLOR_QSO;
}

/**
 * Compute a radius multiplier based on SNR. Higher SNR = slightly larger marker.
 * SNR range: roughly -24 to +20. Normalize to 0.6..1.4 range.
 */
function snrRadiusScale(snr: number): number {
  const normalized = Math.max(0, Math.min(1, (snr + 24) / 44));
  return 0.6 + normalized * 0.8;
}

/**
 * Get ms since midnight UTC for a Date.now() timestamp.
 */
function getMsSinceMidnight(timestamp: number): number {
  const d = new Date(timestamp);
  return (
    d.getUTCHours() * 3_600_000 +
    d.getUTCMinutes() * 60_000 +
    d.getUTCSeconds() * 1_000 +
    d.getUTCMilliseconds()
  );
}

/**
 * Compute age-based opacity. Returns 0..1 where 1 is newest, 0 is expired.
 */
function ageOpacity(decodeTime: number, now: number, maxAgeMs: number): number {
  const nowMsSinceMidnight = getMsSinceMidnight(now);
  let age = nowMsSinceMidnight - decodeTime;
  // Handle day rollover
  if (age < 0) age += 24 * 60 * 60 * 1000;
  if (age > maxAgeMs) return 0;
  return 1 - age / maxAgeMs;
}

/**
 * Generate great-circle arc points between two lat/lon positions,
 * returning canvas-space coordinates.
 */
function generateGreatCirclePoints(
  startLat: number,
  startLon: number,
  endLat: number,
  endLon: number,
  width: number,
  height: number,
  segments: number,
): Array<{ x: number; y: number }> {
  const lat1 = (startLat * Math.PI) / 180;
  const lon1 = (startLon * Math.PI) / 180;
  const lat2 = (endLat * Math.PI) / 180;
  const lon2 = (endLon * Math.PI) / 180;

  // Angular distance via Haversine
  const dLat = lat2 - lat1;
  const dLon = lon2 - lon1;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  const dist = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  const points: Array<{ x: number; y: number }> = [];

  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const sinD = Math.sin(dist);

    let lat: number;
    let lon: number;

    if (sinD < 1e-6) {
      // Degenerate: same point
      lat = startLat;
      lon = startLon;
    } else {
      const aCoeff = Math.sin((1 - t) * dist) / sinD;
      const bCoeff = Math.sin(t * dist) / sinD;

      const x =
        aCoeff * Math.cos(lat1) * Math.cos(lon1) +
        bCoeff * Math.cos(lat2) * Math.cos(lon2);
      const y =
        aCoeff * Math.cos(lat1) * Math.sin(lon1) +
        bCoeff * Math.cos(lat2) * Math.sin(lon2);
      const z = aCoeff * Math.sin(lat1) + bCoeff * Math.sin(lat2);

      lat = (Math.atan2(z, Math.sqrt(x * x + y * y)) * 180) / Math.PI;
      lon = (Math.atan2(y, x) * 180) / Math.PI;
    }

    points.push(latLonToPixel(lat, lon, width, height));
  }

  return points;
}

/**
 * Apply alpha to a hex color string, returning an rgba() string.
 */
function colorWithAlpha(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// ---------------------------------------------------------------------------
// Filtered decode type
// ---------------------------------------------------------------------------

interface ValidDecode {
  decode: Ft8EnrichedDecode;
  lat: number;
  lon: number;
}

// ---------------------------------------------------------------------------
// Main draw function
// ---------------------------------------------------------------------------

/**
 * Draw FT8 decode layer onto a Canvas 2D context.
 *
 * Call this from FlatMapView's render loop. It does not manage its own canvas
 * or React lifecycle -- it simply draws onto the provided context.
 */
export function drawFt8DecodeLayerFlat(
  ctx: CanvasRenderingContext2D,
  props: Ft8DecodeLayerFlatDrawProps,
): void {
  const {
    decodes,
    myLat,
    myLon,
    width,
    height,
    showArcs = true,
    showLabels = false,
    ageMaxMs = DEFAULT_AGE_MAX_MS,
  } = props;

  if (decodes.length === 0 || width <= 0 || height <= 0) return;

  const now = Date.now();

  // ── Filter to decodes with valid coordinates ────────────────────────────
  const validDecodes: ValidDecode[] = [];
  for (const d of decodes) {
    if (
      d.lat != null &&
      d.lon != null &&
      Number.isFinite(d.lat) &&
      Number.isFinite(d.lon)
    ) {
      validDecodes.push({ decode: d, lat: d.lat, lon: d.lon });
    }
    if (validDecodes.length >= MAX_MARKERS) break;
  }

  if (validDecodes.length === 0) return;

  // Pulse phase for needed entities (time-based)
  const pulsePhase = (Date.now() % 2000) / 2000;
  const pulseScale =
    0.7 + 0.5 * (0.5 + 0.5 * Math.sin(pulsePhase * Math.PI * 2));

  ctx.save();

  // ── Draw arcs first (behind markers) ────────────────────────────────────
  if (showArcs && myLat != null && myLon != null) {
    const cqDecodes = validDecodes
      .filter((vd) => vd.decode.isCQ)
      .slice(0, MAX_ARCS);

    for (const vd of cqDecodes) {
      const opacity = ageOpacity(vd.decode.time, now, ageMaxMs);
      if (opacity <= 0) continue;

      const color = getDecodeColor(vd.decode);
      const points = generateGreatCirclePoints(
        myLat,
        myLon,
        vd.lat,
        vd.lon,
        width,
        height,
        ARC_SEGMENTS,
      );

      if (points.length < 2) continue;

      ctx.strokeStyle = colorWithAlpha(color, opacity * 0.4);
      ctx.lineWidth = ARC_LINE_WIDTH;
      ctx.setLineDash([]);

      ctx.beginPath();
      let moved = false;
      for (let i = 0; i < points.length; i++) {
        const p = points[i];

        // Detect antimeridian wrap: if horizontal jump > half the canvas width, break
        if (i > 0) {
          const prev = points[i - 1];
          if (Math.abs(p.x - prev.x) > width * 0.5) {
            // Break the path at the wrap point
            ctx.stroke();
            ctx.beginPath();
            moved = false;
          }
        }

        if (!moved) {
          ctx.moveTo(p.x, p.y);
          moved = true;
        } else {
          ctx.lineTo(p.x, p.y);
        }
      }
      ctx.stroke();
    }
  }

  // ── Draw markers ────────────────────────────────────────────────────────
  for (const vd of validDecodes) {
    const opacity = ageOpacity(vd.decode.time, now, ageMaxMs);
    if (opacity <= 0) continue;

    const { x, y } = latLonToPixel(vd.lat, vd.lon, width, height);
    const color = getDecodeColor(vd.decode);

    // Compute radius from SNR
    let radius = MARKER_RADIUS_BASE * snrRadiusScale(vd.decode.snr);
    radius = Math.max(MARKER_RADIUS_MIN, Math.min(MARKER_RADIUS_MAX, radius));

    // Pulsing for needed entities
    if (vd.decode.isNeeded && !vd.decode.isDupe) {
      // Outer pulsing glow
      const glowRadius = radius + NEEDED_GLOW_EXTRA * pulseScale;
      ctx.fillStyle = colorWithAlpha(color, opacity * 0.2 * pulseScale);
      ctx.beginPath();
      ctx.arc(x, y, glowRadius, 0, Math.PI * 2);
      ctx.fill();
    }

    // Calling-me: slightly larger
    if (vd.decode.isCallingMe) {
      radius *= 1.3;
    }

    // Main marker fill
    ctx.fillStyle = colorWithAlpha(color, opacity * 0.8);
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();

    // Outline ring for better visibility
    ctx.strokeStyle = colorWithAlpha(color, opacity * 0.5);
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.arc(x, y, radius + 1, 0, Math.PI * 2);
    ctx.stroke();

    // ── Labels ──────────────────────────────────────────────────────────
    if (showLabels && vd.decode.callsign) {
      ctx.font = `${LABEL_FONT_SIZE}px monospace`;
      ctx.fillStyle = colorWithAlpha("#ffffff", opacity * 0.7);
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(vd.decode.callsign, x + radius + 3, y);
    }
  }

  ctx.restore();
}
