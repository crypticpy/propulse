import { useEffect, useMemo, useRef } from "react";
import type { RadioBinaryFrame } from "@/lib/radio/protocol";

type FftFrame = Extract<RadioBinaryFrame, { kind: "fft" }>;

interface WaterfallProps {
  frame: FftFrame | null;
  className?: string;
  /** dB floor (mapped to black) */
  minDb?: number;
  /** dB ceiling (mapped to red) */
  maxDb?: number;
}

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function palette(tIn: number): [number, number, number] {
  const t = clamp01(tIn);
  // black → blue → cyan → yellow → red
  if (t < 0.25) {
    const u = t / 0.25;
    return [0, 0, Math.round(lerp(0, 200, u))];
  }
  if (t < 0.5) {
    const u = (t - 0.25) / 0.25;
    return [0, Math.round(lerp(0, 255, u)), 255];
  }
  if (t < 0.75) {
    const u = (t - 0.5) / 0.25;
    return [Math.round(lerp(0, 255, u)), 255, Math.round(lerp(255, 0, u))];
  }
  const u = (t - 0.75) / 0.25;
  return [255, Math.round(lerp(255, 0, u)), 0];
}

export function Waterfall({
  frame,
  className = "",
  minDb = -125,
  maxDb = -40,
}: WaterfallProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const readyRef = useRef(false);

  const range = useMemo(() => Math.max(1, maxDb - minDb), [maxDb, minDb]);

  useEffect(() => {
    const el = containerRef.current;
    const canvas = canvasRef.current;
    if (!el || !canvas) return;

    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return;

    const resize = () => {
      const rect = el.getBoundingClientRect();
      const w = Math.max(1, Math.floor(rect.width * dpr));
      const h = Math.max(1, Math.floor(rect.height * dpr));
      if (canvas.width === w && canvas.height === h) return;
      canvas.width = w;
      canvas.height = h;
      // Clear on resize
      ctx.fillStyle = "black";
      ctx.fillRect(0, 0, w, h);
      readyRef.current = true;
    };

    const ro = new ResizeObserver(resize);
    ro.observe(el);
    resize();

    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !frame || !readyRef.current) return;

    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    if (width < 2 || height < 2) return;

    // Scroll existing image down by 1 pixel row.
    ctx.drawImage(canvas, 0, 1);

    // Draw the newest row at y=0.
    const row = ctx.createImageData(width, 1);
    const data = row.data;
    const bins = frame.bins;

    for (let x = 0; x < width; x++) {
      const binIndex = Math.min(
        bins.length - 1,
        Math.floor((x / width) * bins.length),
      );
      const db = bins[binIndex] ?? minDb;
      const t = (db - minDb) / range;
      const [r, g, b] = palette(t);
      const i = x * 4;
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = 255;
    }

    ctx.putImageData(row, 0, 0);
  }, [frame, minDb, range]);

  return (
    <div ref={containerRef} className={`w-full h-full ${className}`}>
      <canvas
        ref={canvasRef}
        className="w-full h-full rounded-lg border border-white/10 bg-black"
      />
    </div>
  );
}

export default Waterfall;

