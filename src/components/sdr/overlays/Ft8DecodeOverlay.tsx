/**
 * Ft8DecodeOverlay -- Canvas overlay that renders FT8/FT4 decode markers
 * on top of the waterfall display.
 *
 * Markers are drawn at the audio frequency of each decode with color coding:
 * - Green:    CQ stations
 * - Cyan:     Regular QSO
 * - Orange:   Needed entity
 * - Red:      Calling me
 * - Dim gray: Dupe
 *
 * Uses a canvas element for performance (no DOM elements per marker).
 * Positioned absolutely; requires parent with position: relative.
 */

import { useEffect, useRef } from "react";
import type { Ft8EnrichedDecode } from "@/lib/ft8/ft8EnrichedDecode";

// ─── Props ───────────────────────────────────────────────────────────────────

export interface Ft8DecodeOverlayProps {
  decodes: Ft8EnrichedDecode[];
  /** Audio range low Hz (typically 200) */
  audioLow: number;
  /** Audio range high Hz (typically 3000) */
  audioHigh: number;
}

// ─── Color helpers ───────────────────────────────────────────────────────────

interface MarkerColor {
  r: number;
  g: number;
  b: number;
}

const COLOR_CQ: MarkerColor = { r: 0, g: 220, b: 100 }; // green
const COLOR_QSO: MarkerColor = { r: 0, g: 210, b: 240 }; // cyan
const COLOR_NEEDED: MarkerColor = { r: 255, g: 160, b: 40 }; // orange
const COLOR_CALLING_ME: MarkerColor = { r: 255, g: 60, b: 60 }; // red
const COLOR_DUPE: MarkerColor = { r: 255, g: 255, b: 255 }; // white (dimmed via alpha)

function getMarkerColor(decode: Ft8EnrichedDecode): MarkerColor {
  if (decode.isCallingMe) return COLOR_CALLING_ME;
  if (decode.isNeeded) return COLOR_NEEDED;
  if (decode.isDupe) return COLOR_DUPE;
  if (decode.isCQ) return COLOR_CQ;
  return COLOR_QSO;
}

function getMarkerAlpha(decode: Ft8EnrichedDecode): number {
  if (decode.isDupe) return 0.25;
  if (decode.isCallingMe) return 1.0;
  if (decode.isNeeded) return 0.95;
  return 0.85;
}

// ─── Priority for z-ordering (higher = drawn later = on top) ─────────────────

function getMarkerPriority(decode: Ft8EnrichedDecode): number {
  if (decode.isDupe) return 0;
  if (decode.isCQ) return 1;
  if (decode.isNeeded) return 3;
  if (decode.isCallingMe) return 4;
  return 2; // regular QSO
}

// ─── Font constant ───────────────────────────────────────────────────────────

const FONT = '9px "JetBrains Mono", monospace';
const TICK_HEIGHT = 6;
const LABEL_PAD_X = 2;
const LABEL_PAD_Y = 1;

// ─── Component ───────────────────────────────────────────────────────────────

export function Ft8DecodeOverlay({
  decodes,
  audioLow,
  audioHigh,
}: Ft8DecodeOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Auto-detect dimensions from CSS layout
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (width === 0 || height === 0) return;

    // Match canvas backing store to CSS size for sharp rendering
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const cw = Math.max(1, Math.floor(width * dpr));
    const ch = Math.max(1, Math.floor(height * dpr));

    if (canvas.width !== cw || canvas.height !== ch) {
      canvas.width = cw;
      canvas.height = ch;
    }

    // Cancel any pending frame before scheduling a new one
    if (rafRef.current) cancelAnimationFrame(rafRef.current);

    rafRef.current = requestAnimationFrame(() => {
      const ctx = canvas.getContext("2d", { alpha: true });
      if (!ctx) return;

      ctx.clearRect(0, 0, cw, ch);

      if (decodes.length === 0 || audioHigh <= audioLow) return;

      const audioRange = audioHigh - audioLow;

      // Sort by priority so important markers render on top
      const sorted = [...decodes].sort(
        (a, b) => getMarkerPriority(a) - getMarkerPriority(b),
      );

      ctx.save();
      ctx.scale(dpr, dpr);

      // Track occupied label regions to avoid overlap
      const occupied: Array<{
        left: number;
        right: number;
        top: number;
        bottom: number;
      }> = [];

      for (const decode of sorted) {
        const audioHz = decode.deltaFrequency;
        if (!Number.isFinite(audioHz)) continue;

        // Map audio Hz to pixel X within the overlay
        const t = (audioHz - audioLow) / audioRange;
        if (t < -0.01 || t > 1.01) continue;

        const x = Math.round(t * width);
        const color = getMarkerColor(decode);
        const alpha = getMarkerAlpha(decode);

        const rgba = `rgba(${color.r}, ${color.g}, ${color.b}, ${alpha})`;
        const rgbaFaint = `rgba(${color.r}, ${color.g}, ${color.b}, ${alpha * 0.3})`;

        // Vertical tick mark at top
        ctx.strokeStyle = rgba;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, TICK_HEIGHT);
        ctx.stroke();

        // Subtle full-height guide line
        ctx.strokeStyle = rgbaFaint;
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.moveTo(x, TICK_HEIGHT);
        ctx.lineTo(x, height);
        ctx.stroke();

        // Callsign label
        const label = decode.callsign ?? "?";
        ctx.font = FONT;
        const metrics = ctx.measureText(label);
        const textWidth = metrics.width;
        const textHeight = 10; // approx height for 9px font

        // Calculate label bounding box
        const labelLeft = x - textWidth / 2 - LABEL_PAD_X;
        const labelRight = x + textWidth / 2 + LABEL_PAD_X;
        const labelTop = TICK_HEIGHT + 2;
        const labelBottom = labelTop + textHeight + LABEL_PAD_Y * 2;

        // Check for overlap with existing labels
        let offsetRow = 0;
        const ROW_HEIGHT = textHeight + LABEL_PAD_Y * 2 + 2;
        let finalTop = labelTop;
        let finalBottom = labelBottom;

        for (let attempt = 0; attempt < 5; attempt++) {
          finalTop = labelTop + offsetRow * ROW_HEIGHT;
          finalBottom = finalTop + textHeight + LABEL_PAD_Y * 2;

          // Stop if we'd go past the canvas
          if (finalBottom > height * 0.5) break;

          const overlaps = occupied.some(
            (r) =>
              labelLeft < r.right &&
              labelRight > r.left &&
              finalTop < r.bottom &&
              finalBottom > r.top,
          );

          if (!overlaps) break;
          offsetRow++;
        }

        occupied.push({
          left: labelLeft,
          right: labelRight,
          top: finalTop,
          bottom: finalBottom,
        });

        // Background pill for label
        const bgAlpha = decode.isDupe ? 0.3 : 0.6;
        ctx.fillStyle = `rgba(0, 0, 0, ${bgAlpha})`;
        const pillX = x - textWidth / 2 - LABEL_PAD_X;
        const pillY = finalTop;
        const pillW = textWidth + LABEL_PAD_X * 2;
        const pillH = textHeight + LABEL_PAD_Y * 2;
        const radius = 2;

        ctx.beginPath();
        ctx.moveTo(pillX + radius, pillY);
        ctx.lineTo(pillX + pillW - radius, pillY);
        ctx.arcTo(pillX + pillW, pillY, pillX + pillW, pillY + radius, radius);
        ctx.lineTo(pillX + pillW, pillY + pillH - radius);
        ctx.arcTo(
          pillX + pillW,
          pillY + pillH,
          pillX + pillW - radius,
          pillY + pillH,
          radius,
        );
        ctx.lineTo(pillX + radius, pillY + pillH);
        ctx.arcTo(pillX, pillY + pillH, pillX, pillY + pillH - radius, radius);
        ctx.lineTo(pillX, pillY + radius);
        ctx.arcTo(pillX, pillY, pillX + radius, pillY, radius);
        ctx.closePath();
        ctx.fill();

        // Thin border on pill
        ctx.strokeStyle = `rgba(${color.r}, ${color.g}, ${color.b}, ${alpha * 0.4})`;
        ctx.lineWidth = 0.5;
        ctx.stroke();

        // SNR badge (small, to the right of the label)
        const snr = decode.snr;
        const snrText = snr >= 0 ? `+${snr}` : `${snr}`;
        const snrWidth = ctx.measureText(snrText).width;

        // Draw callsign text
        ctx.fillStyle = rgba;
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillText(label, x, finalTop + LABEL_PAD_Y);

        // SNR in smaller, dimmer text
        ctx.font = '7px "JetBrains Mono", monospace';
        ctx.fillStyle = `rgba(${color.r}, ${color.g}, ${color.b}, ${alpha * 0.6})`;
        ctx.fillText(
          snrText,
          x + textWidth / 2 + LABEL_PAD_X + snrWidth / 2 + 1,
          finalTop + LABEL_PAD_Y + 1,
        );
        // Reset font
        ctx.font = FONT;
      }

      ctx.restore();
    });

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [decodes, audioLow, audioHigh]);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 pointer-events-none z-[3]"
    />
  );
}
