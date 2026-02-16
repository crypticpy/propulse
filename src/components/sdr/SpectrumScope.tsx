import { useEffect, useMemo, useRef } from "react";
import type { RadioBinaryFrame } from "@/lib/radio/protocol";
import type {
  WaterfallPaletteName,
  WaterfallView,
  TuningOverlay,
} from "@/components/sdr/waterfallPalette";
import {
  getWaterfallPaletteLut,
  computePassbandHz,
} from "@/components/sdr/waterfallPalette";

type FftFrame = Extract<RadioBinaryFrame, { kind: "fft" }>;

interface SpectrumScopeProps {
  frame: FftFrame | null;
  view: WaterfallView | null;
  className?: string;
  minDb?: number;
  maxDb?: number;
  palette?: WaterfallPaletteName;
  tuning?: TuningOverlay | null;
  showPeakHold?: boolean;
  showGradientFill?: boolean;
  overlays?: Array<{
    hz: number;
    label?: string;
    color?: "cyan" | "orange" | "red" | "green";
  }>;
}

function colorForOverlay(color?: "cyan" | "orange" | "red" | "green"): string {
  switch (color) {
    case "orange":
      return "rgba(255, 140, 0, 0.9)";
    case "red":
      return "rgba(255, 60, 60, 0.9)";
    case "green":
      return "rgba(0, 255, 130, 0.9)";
    default:
      return "rgba(0, 220, 255, 0.9)";
  }
}

export function SpectrumScope({
  frame,
  view,
  className = "",
  minDb = -125,
  maxDb = -40,
  palette = "classic",
  tuning,
  showPeakHold = true,
  showGradientFill = true,
  overlays = [],
}: SpectrumScopeProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const peakRef = useRef<Float32Array | null>(null);

  const lut = useMemo(() => getWaterfallPaletteLut(palette), [palette]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const w = Math.max(1, Math.floor(rect.width * dpr));
      const h = Math.max(1, Math.floor(rect.height * dpr));
      if (canvas.width === w && canvas.height === h) return;
      canvas.width = w;
      canvas.height = h;
      peakRef.current = null;
    };

    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    resize();
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !frame || !view) return;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    if (w < 2 || h < 2) return;

    ctx.fillStyle = "rgb(0,0,0)";
    ctx.fillRect(0, 0, w, h);

    // Grid
    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.lineWidth = 1;
    for (let i = 1; i < 4; i++) {
      const y = Math.round((i / 4) * h);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    // Build points array
    const range = Math.max(1, maxDb - minDb);
    const bins = frame.bins;
    const startFrame = frame.centerHz - frame.spanHz / 2;
    const viewStart = view.centerHz - view.spanHz / 2;
    const points = new Float32Array(w);

    for (let x = 0; x < w; x++) {
      const hz = viewStart + (x / (w - 1)) * view.spanHz;
      const idx = Math.min(
        bins.length - 1,
        Math.max(
          0,
          Math.floor(((hz - startFrame) / frame.spanHz) * bins.length),
        ),
      );
      const db = bins[idx] ?? minDb;
      points[x] = Math.max(0, Math.min(1, (db - minDb) / range));
    }

    // Update peak hold
    if (!peakRef.current || peakRef.current.length !== w) {
      peakRef.current = new Float32Array(points);
    } else {
      const peak = peakRef.current;
      for (let i = 0; i < w; i++) {
        peak[i] = Math.max(peak[i] * 0.997, points[i]);
      }
    }

    // Palette high-end color for lines
    const r = lut[255 * 3] ?? 255;
    const g = lut[255 * 3 + 1] ?? 0;
    const b = lut[255 * 3 + 2] ?? 0;

    // Gradient fill under the spectrum line
    if (showGradientFill) {
      const grad = ctx.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, `rgba(${r},${g},${b}, 0.3)`);
      grad.addColorStop(1, `rgba(${r},${g},${b}, 0.01)`);

      ctx.beginPath();
      ctx.moveTo(0, h);
      for (let x = 0; x < w; x++) {
        const y = Math.round((1 - points[x]) * (h - 1));
        ctx.lineTo(x, y);
      }
      ctx.lineTo(w - 1, h);
      ctx.closePath();
      ctx.fillStyle = grad;
      ctx.fill();
    }

    // Peak hold line (before main line, so main draws on top)
    if (showPeakHold) {
      const peak = peakRef.current;
      ctx.beginPath();
      for (let x = 0; x < w; x++) {
        const y = Math.round((1 - peak[x]) * (h - 1));
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = `rgba(${r},${g},${b}, 0.35)`;
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // Main spectrum line
    ctx.beginPath();
    for (let x = 0; x < w; x++) {
      const y = Math.round((1 - points[x]) * (h - 1));
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = `rgb(${r},${g},${b})`;
    ctx.lineWidth = 2;
    ctx.stroke();

    // Tuning overlay: passband + VFO line
    if (tuning) {
      const passband = computePassbandHz(tuning);
      const pbStartT = (passband.startHz - viewStart) / view.spanHz;
      const pbEndT = (passband.endHz - viewStart) / view.spanHz;
      const pbX0 = Math.round(Math.max(0, pbStartT) * (w - 1));
      const pbX1 = Math.round(Math.min(1, pbEndT) * (w - 1));

      // Passband fill
      if (pbX1 > pbX0 && pbStartT < 1 && pbEndT > 0) {
        ctx.fillStyle = "rgba(0, 220, 255, 0.12)";
        ctx.fillRect(pbX0, 0, pbX1 - pbX0, h);

        // Passband edges
        ctx.strokeStyle = "rgba(0, 220, 255, 0.35)";
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 3]);
        ctx.beginPath();
        ctx.moveTo(pbX0, 0);
        ctx.lineTo(pbX0, h);
        ctx.moveTo(pbX1, 0);
        ctx.lineTo(pbX1, h);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // VFO center line
      const vfoT = (tuning.freqHz - viewStart) / view.spanHz;
      if (vfoT >= 0 && vfoT <= 1) {
        const vfoX = Math.round(vfoT * (w - 1));
        ctx.strokeStyle = "rgba(255, 255, 255, 0.9)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(vfoX, 0);
        ctx.lineTo(vfoX, h);
        ctx.stroke();

        // Triangle indicator at top
        const triSize = 5;
        ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
        ctx.beginPath();
        ctx.moveTo(vfoX, 0);
        ctx.lineTo(vfoX - triSize, triSize * 1.5);
        ctx.lineTo(vfoX + triSize, triSize * 1.5);
        ctx.closePath();
        ctx.fill();
      }
    }

    // Overlays (markers)
    for (const o of overlays) {
      if (!Number.isFinite(o.hz)) continue;
      const t = (o.hz - viewStart) / view.spanHz;
      if (t < 0 || t > 1) continue;
      const x = Math.round(t * (w - 1));
      ctx.strokeStyle = colorForOverlay(o.color);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
  }, [
    frame,
    view,
    minDb,
    maxDb,
    overlays,
    lut,
    tuning,
    showPeakHold,
    showGradientFill,
  ]);

  return (
    <canvas
      ref={canvasRef}
      className={`w-full h-full rounded-lg border border-white/10 bg-black ${className}`}
    />
  );
}

export default SpectrumScope;
