import { useEffect, useMemo, useRef } from "react";
import type { RadioBinaryFrame } from "@/lib/radio/protocol";
import type { WaterfallPaletteName, WaterfallView } from "@/components/sdr/waterfallPalette";
import { getWaterfallPaletteLut } from "@/components/sdr/waterfallPalette";

type FftFrame = Extract<RadioBinaryFrame, { kind: "fft" }>;

interface SpectrumScopeProps {
  frame: FftFrame | null;
  view: WaterfallView | null;
  className?: string;
  minDb?: number;
  maxDb?: number;
  palette?: WaterfallPaletteName;
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
  overlays = [],
}: SpectrumScopeProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

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

    // Plot
    const range = Math.max(1, maxDb - minDb);
    const bins = frame.bins;
    const startFrame = frame.centerHz - frame.spanHz / 2;
    const viewStart = view.centerHz - view.spanHz / 2;

    ctx.beginPath();
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
      const t = Math.max(0, Math.min(1, (db - minDb) / range));
      const y = Math.round((1 - t) * (h - 1));
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }

    // Use palette high-end as line color for readability.
    const r = lut[255 * 3] ?? 255;
    const g = lut[255 * 3 + 1] ?? 0;
    const b = lut[255 * 3 + 2] ?? 0;
    ctx.strokeStyle = `rgb(${r},${g},${b})`;
    ctx.lineWidth = 2;
    ctx.stroke();

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
  }, [frame, view, minDb, maxDb, overlays, lut]);

  return (
    <canvas
      ref={canvasRef}
      className={`w-full h-full rounded-lg border border-white/10 bg-black ${className}`}
    />
  );
}

export default SpectrumScope;
