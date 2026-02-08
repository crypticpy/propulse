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
  /** Click-to-tune handler (Hz) */
  onPickFrequencyHz?: (hz: number) => void;
  overlays?: Array<{
    hz: number;
    label?: string;
    color?: "cyan" | "orange" | "red" | "green";
  }>;
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
  onPickFrequencyHz,
  overlays = [],
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
    <div
      ref={containerRef}
      className={`w-full h-full relative ${className}`}
      onClick={(e) => {
        if (!frame || !onPickFrequencyHz) return;
        const el = containerRef.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        if (rect.width <= 0) return;
        const x = (e.clientX - rect.left) / rect.width;
        const hz = frame.centerHz - frame.spanHz / 2 + x * frame.spanHz;
        onPickFrequencyHz(Math.round(hz));
      }}
    >
      <canvas
        ref={canvasRef}
        className="w-full h-full rounded-lg border border-white/10 bg-black"
      />

      {frame &&
        overlays
          .filter((o) => Number.isFinite(o.hz))
          .map((o, idx) => {
            const start = frame.centerHz - frame.spanHz / 2;
            const t = (o.hz - start) / frame.spanHz;
            if (t < 0 || t > 1) return null;
            const colorClass =
              o.color === "orange"
                ? "bg-plasma-orange/70 text-plasma-orange"
                : o.color === "red"
                  ? "bg-alert-red/70 text-alert-red"
                  : o.color === "green"
                    ? "bg-signal-green/70 text-signal-green"
                    : "bg-cosmic-cyan/70 text-cosmic-cyan";
            return (
              <div
                key={`${o.hz}-${o.label ?? "m"}-${idx}`}
                className="absolute top-0 bottom-0 pointer-events-none"
                style={{ left: `${t * 100}%` }}
              >
                <div className={`w-px h-full ${colorClass}`} />
                {o.label ? (
                  <div
                    className={`absolute top-1 left-0 -translate-x-1/2 px-1 py-0.5 rounded text-[10px] bg-black/60 border border-white/10 ${colorClass}`}
                  >
                    {o.label}
                  </div>
                ) : null}
              </div>
            );
          })}
    </div>
  );
}

export default Waterfall;
