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
  audioHzToRfHz,
} from "@/components/sdr/waterfallPalette";
import { fillFftCrossfade } from "@/lib/sdr/fftCrossfade";
import { useSpectrumInteraction } from "@/hooks/useSpectrumInteraction";
import type { SpectrumInteractionCallbacks } from "@/hooks/useSpectrumInteraction";

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
  bgColor?: string;
  gridLines?: number;
  verticalGridLines?: number;
  gridOpacity?: number;
  smoothing?: number;
  lineColor?: string;
  lineWidth?: number;
  fillOpacity?: number;
  lineShadow?: boolean;
  lineShadowBlur?: number;
  tuningLineColor?: string;
  tuningArrowColor?: string;
  onPickFrequencyHz?: (hz: number) => void;
  onWheelTune?: (direction: number) => void;
  overlays?: Array<{
    hz: number;
    label?: string;
    color?: "cyan" | "orange" | "red" | "green";
  }>;
  // Interactive filter/notch props
  notchFilters?: Array<{
    id: string;
    freqHz: number;
    q: number;
    enabled: boolean;
  }>;
  onFilterChange?: (low: number, high: number) => void;
  onAddNotch?: (freqHz: number, q: number) => void;
  onUpdateNotch?: (id: string, freqHz: number, q: number) => void;
  onRemoveNotch?: (id: string) => void;
  /** Optional high-resolution audio FFT frame (~11.7 Hz/bin). When provided,
   *  pixels within its frequency range are sampled from this frame. */
  audioFrame?: FftFrame | null;
  /** dB floor for the audio frame (default -120). */
  audioMinDb?: number;
  /** dB ceiling for the audio frame (default -20). */
  audioMaxDb?: number;
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
  bgColor = "#0a2838",
  gridLines = 3,
  verticalGridLines = 6,
  gridOpacity = 0.08,
  smoothing = 0,
  lineColor = "auto",
  lineWidth: lineWidthPx = 2,
  fillOpacity = 0.3,
  lineShadow = true,
  lineShadowBlur = 8,
  tuningLineColor: tuningLineColorProp = "#00ebff",
  tuningArrowColor: tuningArrowColorProp = "#00ebff",
  onPickFrequencyHz,
  onWheelTune,
  overlays = [],
  notchFilters = [],
  onFilterChange,
  onAddNotch,
  onUpdateNotch,
  onRemoveNotch,
  audioFrame = null,
  audioMinDb: audioMinDbVal = -120,
  audioMaxDb: audioMaxDbVal = -20,
}: SpectrumScopeProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const peakRef = useRef<Float32Array | null>(null);

  // ── Pre-allocated buffers (reallocated only on canvas width change) ──
  const fftBufRef = useRef<Float32Array | null>(null);
  const smoothBufARef = useRef<Float32Array | null>(null);
  const smoothBufBRef = useRef<Float32Array | null>(null);
  const lastBufWidthRef = useRef<number>(0);

  // ── Refs for the shared interaction hook ─────────────────────────────
  const viewRef = useRef(view);
  viewRef.current = view;
  const tuningRef = useRef(tuning ?? null);
  tuningRef.current = tuning ?? null;
  const notchRef = useRef(notchFilters);
  notchRef.current = notchFilters;

  const callbacksRef = useRef<SpectrumInteractionCallbacks>({
    onPickFrequencyHz,
    onFilterChange,
    onAddNotch,
    onUpdateNotch,
    onRemoveNotch,
    onWheelTune,
  });
  callbacksRef.current = {
    onPickFrequencyHz,
    onFilterChange,
    onAddNotch,
    onUpdateNotch,
    onRemoveNotch,
    onWheelTune,
  };

  // ── Shared interaction hook (replaces all inline pointer/wheel code) ──
  useSpectrumInteraction({
    canvasRef,
    viewRef,
    tuningRef,
    notchRef,
    callbacksRef,
  });

  const lut = useMemo(() => getWaterfallPaletteLut(palette), [palette]);

  // ── Canvas resize ──────────────────────────────────────────────────────
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

  // ── Draw effect (rAF-gated) ────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !frame || !view) return;

    const rafId = requestAnimationFrame(() => {
      const ctx = canvas.getContext("2d", { alpha: false });
      if (!ctx) return;

      const w = canvas.width;
      const h = canvas.height;
      if (w < 2 || h < 2) return;

      const dpr = Math.max(1, window.devicePixelRatio || 1);

      // ── Reallocate buffers if canvas width changed ──────────
      if (lastBufWidthRef.current !== w) {
        fftBufRef.current = new Float32Array(w);
        smoothBufARef.current = new Float32Array(w);
        smoothBufBRef.current = new Float32Array(w);
        lastBufWidthRef.current = w;
      }
      const points = fftBufRef.current!;
      const smoothA = smoothBufARef.current!;
      const smoothB = smoothBufBRef.current!;

      // ── Background ────────────────────────────────────────────
      ctx.fillStyle = bgColor;
      ctx.fillRect(0, 0, w, h);

      // ── Grid lines ────────────────────────────────────────────
      const gridColor = `rgba(255,255,255,${gridOpacity})`;
      if (gridLines > 0) {
        ctx.strokeStyle = gridColor;
        ctx.lineWidth = 1;
        for (let i = 1; i <= gridLines; i++) {
          const y = Math.round((i / (gridLines + 1)) * h);
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(w, y);
          ctx.stroke();
        }
      }
      if (verticalGridLines > 0) {
        ctx.strokeStyle = gridColor;
        ctx.lineWidth = 1;
        for (let i = 1; i <= verticalGridLines; i++) {
          const x = Math.round((i / (verticalGridLines + 1)) * w);
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x, h);
          ctx.stroke();
        }
      }

      // ── Build points array via shared cross-fade utility ──────
      const range = Math.max(1, maxDb - minDb);
      const viewStart = view.centerHz - view.spanHz / 2;

      const audioBins = audioFrame?.bins ?? null;
      const audioFullStart = audioFrame
        ? audioFrame.centerHz - audioFrame.spanHz / 2
        : 0;
      const audioRange = Math.max(1, audioMaxDbVal - audioMinDbVal);
      const pb = tuning && audioBins ? computePassbandHz(tuning) : null;

      fillFftCrossfade(points, viewStart, view.spanHz, {
        civBins: frame.bins,
        civStartHz: frame.centerHz - frame.spanHz / 2,
        civSpanHz: frame.spanHz,
        civMinDb: minDb,
        civRange: range,
        audioBins,
        audioStartHz: audioFullStart,
        audioSpanHz: audioFrame?.spanHz ?? 1,
        audioMinDb: audioMinDbVal,
        audioRange,
        passbandStartHz: pb ? pb.startHz : 0,
        passbandEndHz: pb ? pb.endHz : 0,
        fadeHz: 200,
        civInterpolation: "linear",
      });

      // ── Smoothing (ping-pong buffers) ─────────────────────────
      if (smoothing > 0) {
        // Copy points into smoothA as source for first pass
        smoothA.set(points);
        let src = smoothA;
        let dst = smoothB;
        for (let pass = 0; pass < smoothing; pass++) {
          dst[0] = src[0];
          dst[w - 1] = src[w - 1];
          for (let x = 1; x < w - 1; x++) {
            dst[x] = (src[x - 1] + src[x] + src[x + 1]) / 3;
          }
          // Swap for next pass
          const tmp = src;
          src = dst;
          dst = tmp;
        }
        // After ping-pong, the final result is always in `src`
        points.set(src);
      }

      if (!peakRef.current || peakRef.current.length !== w) {
        peakRef.current = new Float32Array(points);
      } else {
        const peak = peakRef.current;
        for (let i = 0; i < w; i++) {
          peak[i] = Math.max(peak[i] * 0.997, points[i]);
        }
      }

      // ── Resolve trace color ───────────────────────────────────
      let traceR: number, traceG: number, traceB: number;
      if (lineColor === "auto") {
        traceR = lut[255 * 3] ?? 255;
        traceG = lut[255 * 3 + 1] ?? 0;
        traceB = lut[255 * 3 + 2] ?? 0;
      } else {
        const hex = lineColor.replace("#", "");
        traceR = parseInt(hex.slice(0, 2), 16) || 255;
        traceG = parseInt(hex.slice(2, 4), 16) || 255;
        traceB = parseInt(hex.slice(4, 6), 16) || 255;
      }

      // ── Tuning overlay: passband + VFO marker ─────────────────
      if (tuning) {
        const passband = computePassbandHz(tuning);
        const pbStartT = (passband.startHz - viewStart) / view.spanHz;
        const pbEndT = (passband.endHz - viewStart) / view.spanHz;
        const pbX0 = Math.round(Math.max(0, pbStartT) * (w - 1));
        const pbX1 = Math.round(Math.min(1, pbEndT) * (w - 1));

        if (pbX1 > pbX0 && pbStartT < 1 && pbEndT > 0) {
          const vfoT = (tuning.freqHz - viewStart) / view.spanHz;
          const vfoX = Math.round(vfoT * (w - 1));

          const bandGrad = ctx.createLinearGradient(pbX0, 0, pbX1, 0);
          bandGrad.addColorStop(0, "rgba(0, 180, 255, 0.08)");
          bandGrad.addColorStop(0.3, "rgba(0, 200, 255, 0.18)");
          bandGrad.addColorStop(0.5, "rgba(0, 220, 255, 0.25)");
          bandGrad.addColorStop(0.7, "rgba(0, 200, 255, 0.18)");
          bandGrad.addColorStop(1, "rgba(0, 180, 255, 0.08)");
          ctx.fillStyle = bandGrad;
          ctx.fillRect(pbX0, 0, pbX1 - pbX0, h);

          // Passband edge lines (brighter to indicate draggable)
          const hasFilterCb = !!onFilterChange;
          const edgeAlpha = hasFilterCb ? 0.4 : 0.2;
          ctx.strokeStyle = `rgba(0, 200, 255, ${edgeAlpha})`;
          ctx.lineWidth = hasFilterCb ? 2 : 1;
          ctx.beginPath();
          ctx.moveTo(pbX0, 0);
          ctx.lineTo(pbX0, h);
          ctx.moveTo(pbX1, 0);
          ctx.lineTo(pbX1, h);
          ctx.stroke();

          // VFO center line + arrow
          if (vfoT >= 0 && vfoT <= 1) {
            const mode = (tuning.mode ?? "USB").toUpperCase();
            const isLsb = mode === "LSB" || mode === "CWR";
            const isSymmetric =
              mode === "AM" || mode === "FM" || mode === "WFM";
            const arrowHeight = 10;
            const arrowWide = 8;
            const arrowNarrow = 2;
            let baseLeft: number;
            let baseRight: number;

            if (isSymmetric) {
              baseLeft = vfoX - 5;
              baseRight = vfoX + 5;
            } else if (isLsb) {
              baseLeft = vfoX - arrowWide;
              baseRight = vfoX + arrowNarrow;
            } else {
              baseLeft = vfoX - arrowNarrow;
              baseRight = vfoX + arrowWide;
            }

            ctx.strokeStyle = tuningLineColorProp + "66";
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(vfoX, arrowHeight);
            ctx.lineTo(vfoX, h);
            ctx.stroke();

            ctx.strokeStyle = tuningLineColorProp + "d9";
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(vfoX, arrowHeight);
            ctx.lineTo(vfoX, h);
            ctx.stroke();

            ctx.fillStyle = tuningArrowColorProp + "e6";
            ctx.beginPath();
            ctx.moveTo(baseLeft, 0);
            ctx.lineTo(baseRight, 0);
            ctx.lineTo(vfoX, arrowHeight);
            ctx.closePath();
            ctx.fill();
          }
        }

        // ── Notch filter markers (enabled only) ─────────────────────
        for (const n of notchFilters) {
          if (!n.enabled) continue;
          const nRfHz = audioHzToRfHz(n.freqHz, tuning.freqHz, tuning.mode);
          const nT = (nRfHz - viewStart) / view.spanHz;
          if (nT < -0.01 || nT > 1.01) continue;
          const nX = Math.round(nT * (w - 1));

          // Notch band width from Q (bandwidth = freq / Q)
          const bwHz = n.freqHz / Math.max(1, n.q);
          const bwPx = Math.max(2, (bwHz / view.spanHz) * (w - 1));
          const halfBw = bwPx / 2;

          // Semi-transparent notch band
          ctx.fillStyle = "rgba(255, 140, 0, 0.12)";
          ctx.fillRect(nX - halfBw, 0, bwPx, h);

          // Dashed center line
          ctx.save();
          ctx.setLineDash([4 * dpr, 3 * dpr]);
          ctx.strokeStyle = "rgba(255, 140, 0, 0.7)";
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(nX, 0);
          ctx.lineTo(nX, h);
          ctx.stroke();
          ctx.restore();

          // "V" marker at top
          const vSize = 5 * dpr;
          ctx.fillStyle = "rgba(255, 140, 0, 0.9)";
          ctx.beginPath();
          ctx.moveTo(nX - vSize, 0);
          ctx.lineTo(nX, vSize);
          ctx.lineTo(nX + vSize, 0);
          ctx.closePath();
          ctx.fill();
        }
      }

      // ── Gradient fill ─────────────────────────────────────────
      if (showGradientFill) {
        const grad = ctx.createLinearGradient(0, 0, 0, h);
        grad.addColorStop(
          0,
          `rgba(${traceR},${traceG},${traceB}, ${fillOpacity * 0.8})`,
        );
        grad.addColorStop(
          0.4,
          `rgba(${traceR},${traceG},${traceB}, ${fillOpacity * 0.3})`,
        );
        grad.addColorStop(
          1,
          `rgba(${traceR},${traceG},${traceB}, ${fillOpacity * 0.02})`,
        );

        ctx.beginPath();
        ctx.moveTo(0, h);
        for (let x = 0; x < w; x++) {
          ctx.lineTo(x, Math.round((1 - points[x]) * (h - 1)));
        }
        ctx.lineTo(w - 1, h);
        ctx.closePath();
        ctx.fillStyle = grad;
        ctx.fill();

        ctx.save();
        ctx.beginPath();
        for (let x = 0; x < w; x++) {
          const y = Math.round((1 - points[x]) * (h - 1));
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        for (let x = w - 1; x >= 0; x--) {
          const y = Math.round((1 - points[x]) * (h - 1));
          const glowExtent = Math.min(h * 0.25, 60);
          ctx.lineTo(x, Math.min(h, y + glowExtent));
        }
        ctx.closePath();
        ctx.clip();

        const glowGrad = ctx.createLinearGradient(0, 0, 0, h);
        glowGrad.addColorStop(
          0,
          `rgba(${traceR},${traceG},${traceB}, ${fillOpacity * 1.2})`,
        );
        glowGrad.addColorStop(
          0.5,
          `rgba(${traceR},${traceG},${traceB}, ${fillOpacity * 0.4})`,
        );
        glowGrad.addColorStop(1, `rgba(${traceR},${traceG},${traceB}, 0)`);
        ctx.fillStyle = glowGrad;
        ctx.fillRect(0, 0, w, h);
        ctx.restore();
      }

      // ── Peak hold ─────────────────────────────────────────────
      if (showPeakHold) {
        const peak = peakRef.current;
        ctx.beginPath();
        for (let x = 0; x < w; x++) {
          const y = Math.round((1 - peak![x]) * (h - 1));
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = `rgba(${traceR},${traceG},${traceB}, 0.35)`;
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      // ── Drop shadow ───────────────────────────────────────────
      if (lineShadow) {
        ctx.save();
        ctx.shadowColor = `rgba(${traceR},${traceG},${traceB}, 0.5)`;
        ctx.shadowBlur = lineShadowBlur * 1.5;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 3;
        ctx.beginPath();
        for (let x = 0; x < w; x++) {
          const y = Math.round((1 - points[x]) * (h - 1));
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = `rgba(${traceR},${traceG},${traceB}, 0.3)`;
        ctx.lineWidth = lineWidthPx + 2;
        ctx.stroke();
        ctx.restore();
      }

      // ── Main spectrum line ────────────────────────────────────
      if (lineShadow) {
        ctx.shadowColor = `rgba(${traceR},${traceG},${traceB}, 0.6)`;
        ctx.shadowBlur = lineShadowBlur;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 2;
      }
      ctx.beginPath();
      for (let x = 0; x < w; x++) {
        const y = Math.round((1 - points[x]) * (h - 1));
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = `rgb(${traceR},${traceG},${traceB})`;
      ctx.lineWidth = lineWidthPx;
      ctx.stroke();

      if (lineShadow) {
        ctx.shadowColor = "transparent";
        ctx.shadowBlur = 0;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;
      }

      // ── Overlays (markers) ────────────────────────────────────
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
    });

    return () => cancelAnimationFrame(rafId);
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
    bgColor,
    gridLines,
    verticalGridLines,
    gridOpacity,
    smoothing,
    lineColor,
    lineWidthPx,
    fillOpacity,
    lineShadow,
    lineShadowBlur,
    tuningLineColorProp,
    tuningArrowColorProp,
    notchFilters,
    onFilterChange,
    audioFrame,
    audioMinDbVal,
    audioMaxDbVal,
  ]);

  return (
    <canvas
      ref={canvasRef}
      className={`w-full h-full rounded-lg border border-white/10 bg-black touch-none ${className}`}
    />
  );
}

export default SpectrumScope;
