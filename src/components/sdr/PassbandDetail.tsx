/**
 * PassbandDetail -- Zoomed-in waterfall centered on the passband area.
 *
 * Renders a scrolling Canvas2D waterfall showing the passband neighborhood
 * with interactive overlays for filter edges and notch markers. Persistent
 * interference appears as bright vertical lines, making it easy to identify
 * where to place notch filters.
 *
 * Follows the SmartSDR / SDR Console convention of a narrowband "zoom
 * waterfall" for signal detail around the receiver passband.
 */

import { useCallback, useEffect, useMemo, useRef } from "react";
import {
  getWaterfallPaletteLutWithGamma,
  computePassbandHz,
  audioHzToRfHz,
} from "@/components/sdr/waterfallPalette";
import { fillFftCrossfade } from "@/lib/sdr/fftCrossfade";
import type { RadioBinaryFrame } from "@/lib/radio/protocol";
import type {
  WaterfallPaletteName,
  WaterfallView,
  TuningOverlay,
} from "@/components/sdr/waterfallPalette";
import { useSpectrumInteraction } from "@/hooks/useSpectrumInteraction";
import type { SpectrumInteractionCallbacks } from "@/hooks/useSpectrumInteraction";
import type { EqBand, EqBandCategory } from "@/lib/audio/eqTypes";

type FftFrame = Extract<RadioBinaryFrame, { kind: "fft" }>;

interface PassbandDetailProps {
  /** Radio scope FFT (wideband, low resolution ~1050 Hz/bin). */
  frame: FftFrame | null;
  /** Audio-derived FFT (narrowband, high resolution ~11.7 Hz/bin). */
  audioFftFrame?: FftFrame | null;
  tuning: TuningOverlay | null;
  minDb: number;
  maxDb: number;
  palette: WaterfallPaletteName;
  gamma?: number;
  /** Passband fill opacity (0..0.3). Set to 0 to show edges only. */
  passbandFillOpacity?: number;
  notchFilters: Array<{
    id: string;
    freqHz: number;
    q: number;
    enabled: boolean;
  }>;
  onFilterChange?: (low: number, high: number) => void;
  onAddNotch?: (freqHz: number, q: number) => void;
  onUpdateNotch?: (id: string, freqHz: number, q: number) => void;
  onRemoveNotch?: (id: string) => void;
  onPickFrequencyHz?: (hz: number) => void;
  onWheelTune?: (direction: number) => void;
  /** EQ bands to display on the zoomed view */
  eqBands?: EqBand[];
  /** Callbacks for EQ band interaction */
  onAddEqBand?: (
    freqHz: number,
    gainDb: number,
    category: EqBandCategory,
  ) => void;
  onUpdateEqBand?: (
    id: string,
    freqHz: number,
    q: number,
    gainDb: number,
  ) => void;
  onRemoveEqBand?: (id: string) => void;
  onEqBandHover?: (id: string | null) => void;
  onEqBandQChange?: (id: string, q: number) => void;
  /** Called when right-click triggers context menu */
  onEqContextMenu?: (e: {
    screenX: number;
    screenY: number;
    audioHz: number;
    band?: EqBand;
  }) => void;
  /** Called when a band dot is clicked or right-clicked to open the control panel */
  onEqBandSelect?: (band: EqBand, screenX: number, screenY: number) => void;
}

export function PassbandDetail({
  frame,
  audioFftFrame,
  tuning,
  minDb,
  maxDb,
  palette,
  gamma = 1.0,
  passbandFillOpacity,
  notchFilters,
  onFilterChange,
  onAddNotch,
  onUpdateNotch,
  onRemoveNotch,
  onPickFrequencyHz,
  onWheelTune,
  eqBands = [],
  onAddEqBand,
  onUpdateEqBand,
  onRemoveEqBand,
  onEqBandHover,
  onEqBandQChange,
  onEqContextMenu,
  onEqBandSelect,
}: PassbandDetailProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const wfCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const olCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const lastViewRef = useRef<{ centerHz: number; spanHz: number } | null>(null);

  const tuningRef = useRef(tuning);
  tuningRef.current = tuning;
  const notchRef = useRef(notchFilters);
  notchRef.current = notchFilters;
  const eqBandsRef = useRef(eqBands);
  eqBandsRef.current = eqBands;

  const callbacksRef = useRef<SpectrumInteractionCallbacks>({
    onPickFrequencyHz,
    onFilterChange,
    onAddNotch,
    onUpdateNotch,
    onRemoveNotch,
    onWheelTune,
    onAddEqBand,
    onUpdateEqBand,
    onRemoveEqBand,
    onEqBandHover,
    onEqBandQChange,
    onEqContextMenu,
    onEqBandSelect,
  });
  callbacksRef.current = {
    onPickFrequencyHz,
    onFilterChange,
    onAddNotch,
    onUpdateNotch,
    onRemoveNotch,
    onWheelTune,
    onAddEqBand,
    onUpdateEqBand,
    onRemoveEqBand,
    onEqBandHover,
    onEqBandQChange,
    onEqContextMenu,
    onEqBandSelect,
  };

  const lut = useMemo(
    () => getWaterfallPaletteLutWithGamma(palette, gamma),
    [palette, gamma],
  );

  // ── I2: Pre-allocated buffers (reused across frames) ─────────────────
  const rowImageRef = useRef<ImageData | null>(null);
  const normalizedBufRef = useRef<Float32Array | null>(null);
  const lastRowWidthRef = useRef(0);

  const zoomView = useMemo<WaterfallView | null>(() => {
    if (!tuning) return null;
    const pb = computePassbandHz(tuning);
    const pbWidth = pb.endHz - pb.startHz;
    const span = Math.max(pbWidth * 2.5, 6000);
    const center = (pb.startHz + pb.endHz) / 2;
    return { centerHz: center, spanHz: span };
  }, [tuning]);

  const zoomRef = useRef(zoomView);
  zoomRef.current = zoomView;

  // ── H3: Shared pointer interaction (callback ref API) ─────────────────
  const interactionRef = useSpectrumInteraction({
    viewRef: zoomRef,
    tuningRef,
    notchRef,
    callbacksRef,
    eqBandsRef,
    hitThreshold: { minPx: 4, maxPx: 8, divisor: 3 },
    skipDisabledNotches: true,
  });
  const mergedOlRef = useCallback(
    (el: HTMLCanvasElement | null) => {
      olCanvasRef.current = el;
      interactionRef(el);
    },
    [interactionRef],
  );

  // ── Canvas resize ──────────────────────────────────────────────────────
  useEffect(() => {
    const container = containerRef.current;
    const wfCanvas = wfCanvasRef.current;
    const olCanvas = olCanvasRef.current;
    if (!container || !wfCanvas || !olCanvas) return;
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const resize = () => {
      const rect = container.getBoundingClientRect();
      const w = Math.max(1, Math.floor(rect.width * dpr));
      const h = Math.max(1, Math.floor(rect.height * dpr));
      if (wfCanvas.width !== w || wfCanvas.height !== h) {
        wfCanvas.width = w;
        wfCanvas.height = h;
        const ctx = wfCanvas.getContext("2d", { alpha: false });
        if (ctx) {
          ctx.fillStyle = "black";
          ctx.fillRect(0, 0, w, h);
        }
      }
      if (olCanvas.width !== w || olCanvas.height !== h) {
        olCanvas.width = w;
        olCanvas.height = h;
      }
    };
    const ro = new ResizeObserver(resize);
    ro.observe(container);
    resize();
    return () => ro.disconnect();
  }, []);

  // ── Clear waterfall when zoom view changes ─────────────────────────────
  useEffect(() => {
    if (!zoomView) return;
    const last = lastViewRef.current;
    if (
      last &&
      Math.abs(last.centerHz - zoomView.centerHz) < 1 &&
      Math.abs(last.spanHz - zoomView.spanHz) < 1
    ) {
      return;
    }
    lastViewRef.current = {
      centerHz: zoomView.centerHz,
      spanHz: zoomView.spanHz,
    };
    const canvas = wfCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return;
    ctx.fillStyle = "black";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }, [zoomView]);

  // ── Effective FFT source: prefer audio FFT (high-res) over radio scope ──
  const effectiveFrame = audioFftFrame ?? frame;

  // Audio FFT is in dBFS (-∞..0), radio scope is in dBm-ish. Each source is
  // normalized with its own range (mirrors SpectrumScope/Waterfall): the radio
  // (CI-V) bins keep the dBm-scale min/range even while audio FFT streams.
  const isAudioFft = !!audioFftFrame;

  // Clear waterfall when FFT source type changes (radio ↔ audio)
  const prevAudioFftRef = useRef(isAudioFft);
  useEffect(() => {
    if (prevAudioFftRef.current === isAudioFft) return;
    prevAudioFftRef.current = isAudioFft;
    const canvas = wfCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return;
    ctx.fillStyle = "black";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }, [isAudioFft]);

  // ── Waterfall row rendering (one row per FFT frame) ────────────────────
  useEffect(() => {
    const canvas = wfCanvasRef.current;
    if (!canvas || !effectiveFrame || !zoomView || !tuning) return;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    if (w < 2 || h < 2) return;

    const bins = effectiveFrame.bins;
    if (bins.length === 0) return;

    // I3: rAF gating -- render on next animation frame, avoid redundant paints
    const rafId = requestAnimationFrame(() => {
      // I2: Re-use pre-allocated buffers, only reallocate on width change
      if (lastRowWidthRef.current !== w) {
        rowImageRef.current = ctx.createImageData(w, 1);
        normalizedBufRef.current = new Float32Array(w);
        lastRowWidthRef.current = w;
      }
      const row = rowImageRef.current!;
      const normalizedBuf = normalizedBufRef.current!;

      const viewStartHz = zoomView.centerHz - zoomView.spanHz / 2;
      const viewSpanHz = zoomView.spanHz;

      // I1: Compute passband boundaries for crossfade
      const pb = computePassbandHz(tuning);

      // CI-V frame geometry
      const civStartHz = frame
        ? frame.centerHz - frame.spanHz / 2
        : effectiveFrame.centerHz - effectiveFrame.spanHz / 2;
      const civSpanHz = frame ? frame.spanHz : effectiveFrame.spanHz;
      const civBins = frame ? frame.bins : effectiveFrame.bins;

      // Audio FFT geometry (may be null)
      const audioBins = audioFftFrame?.bins ?? null;
      const audioStartHz = audioFftFrame
        ? audioFftFrame.centerHz - audioFftFrame.spanHz / 2
        : 0;
      const audioSpanHz = audioFftFrame?.spanHz ?? 1;

      // I1: Fill normalized buffer via crossfade utility
      fillFftCrossfade(normalizedBuf, viewStartHz, viewSpanHz, {
        civBins,
        civStartHz,
        civSpanHz,
        civMinDb: minDb,
        civRange: Math.max(1, maxDb - minDb),
        audioBins,
        audioStartHz,
        audioSpanHz,
        audioMinDb: -120,
        audioRange: 100,
        passbandStartHz: pb.startHz,
        passbandEndHz: pb.endHz,
        fadeHz: 200,
        civInterpolation: "linear",
      });

      // Scroll existing content down by 1 pixel
      ctx.drawImage(canvas, 0, 1);

      // I1: Map normalized 0-1 values to palette colors via gamma-baked LUT
      const data = row.data;
      const lutData = lut;
      for (let x = 0; x < w; x++) {
        const idx = Math.round(normalizedBuf[x]! * 255);
        const base = idx * 3;
        data[x * 4] = lutData[base]!;
        data[x * 4 + 1] = lutData[base + 1]!;
        data[x * 4 + 2] = lutData[base + 2]!;
        data[x * 4 + 3] = 255;
      }
      ctx.putImageData(row, 0, 0);
    });

    return () => cancelAnimationFrame(rafId);
  }, [
    effectiveFrame,
    frame,
    audioFftFrame,
    tuning,
    zoomView,
    lut,
    minDb,
    maxDb,
  ]);

  // ── Overlay rendering (passband, VFO, notch markers) ───────────────────
  useEffect(() => {
    const canvas = olCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    if (!tuning || !zoomView) return;

    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const viewStart = zoomView.centerHz - zoomView.spanHz / 2;
    const hzToX = (hz: number) =>
      ((hz - viewStart) / zoomView.spanHz) * (w - 1);

    // ── Passband fill + edges ────────────────────────────────────────
    const pb = computePassbandHz(tuning);
    const pbX0 = Math.round(hzToX(pb.startHz));
    const pbX1 = Math.round(hzToX(pb.endHz));

    if (pbX1 > pbX0) {
      const alpha =
        typeof passbandFillOpacity === "number"
          ? Math.max(0, Math.min(0.3, passbandFillOpacity))
          : 0.12;
      if (alpha > 0) {
        ctx.fillStyle = `rgba(0, 180, 255, ${alpha})`;
        ctx.fillRect(pbX0, 0, pbX1 - pbX0, h);
      }

      const hasFilterCb = !!onFilterChange;
      const edgeAlpha = hasFilterCb ? 0.5 : 0.25;
      ctx.strokeStyle = `rgba(0, 200, 255, ${edgeAlpha})`;
      ctx.lineWidth = hasFilterCb ? 2 : 1;
      ctx.beginPath();
      ctx.moveTo(pbX0, 0);
      ctx.lineTo(pbX0, h);
      ctx.moveTo(pbX1, 0);
      ctx.lineTo(pbX1, h);
      ctx.stroke();
    }

    // ── VFO center line + arrow ──────────────────────────────────────
    const vfoX = Math.round(hzToX(tuning.freqHz));
    const vfoT = (tuning.freqHz - viewStart) / zoomView.spanHz;
    if (vfoT >= 0 && vfoT <= 1) {
      const mode = (tuning.mode ?? "USB").toUpperCase();
      const isLsb = mode === "LSB" || mode === "CWR";
      const isSymmetric = mode === "AM" || mode === "FM" || mode === "WFM";
      const arrowH = 7 * dpr;

      ctx.strokeStyle = "rgba(0, 235, 255, 0.4)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(vfoX, arrowH);
      ctx.lineTo(vfoX, h);
      ctx.stroke();

      const arrowW = 6 * dpr;
      const arrowN = 2 * dpr;
      let bL: number, bR: number;
      if (isSymmetric) {
        bL = vfoX - 4 * dpr;
        bR = vfoX + 4 * dpr;
      } else if (isLsb) {
        bL = vfoX - arrowW;
        bR = vfoX + arrowN;
      } else {
        bL = vfoX - arrowN;
        bR = vfoX + arrowW;
      }

      ctx.fillStyle = "rgba(0, 235, 255, 0.85)";
      ctx.beginPath();
      ctx.moveTo(bL, 0);
      ctx.lineTo(bR, 0);
      ctx.lineTo(vfoX, arrowH);
      ctx.closePath();
      ctx.fill();
    }

    // ── EQ band dots ──────────────────────────────────────────────────
    for (const band of eqBands) {
      if (!band.enabled) continue;
      const bandRfHz = audioHzToRfHz(band.freqHz, tuning.freqHz, tuning.mode);
      const nT = (bandRfHz - viewStart) / zoomView.spanHz;
      if (nT < -0.02 || nT > 1.02) continue;
      const dotX = Math.round(nT * (w - 1));
      const dotY = Math.round(h / 2); // Center vertically (passband detail is narrow)

      const dotRadius = 4 * dpr;
      const isNotch = band.category === "notch";

      // Main dot
      ctx.beginPath();
      ctx.arc(dotX, dotY, dotRadius, 0, Math.PI * 2);
      ctx.fillStyle = isNotch
        ? "rgba(255, 140, 0, 0.85)"
        : "rgba(100, 200, 255, 0.85)";
      ctx.fill();
      ctx.strokeStyle = "rgba(255, 255, 255, 0.5)";
      ctx.lineWidth = 1 * dpr;
      ctx.stroke();
    }
  }, [tuning, zoomView, notchFilters, eqBands, onFilterChange, passbandFillOpacity]);

  if (!zoomView) return null;

  return (
    <div
      ref={containerRef}
      className="relative h-[80px] shrink-0 border-t border-white/5"
    >
      <canvas
        ref={wfCanvasRef}
        className="absolute inset-0 w-full h-full"
        style={{ imageRendering: "pixelated" }}
      />
      <canvas
        ref={mergedOlRef}
        className="absolute inset-0 w-full h-full touch-none"
      />
      <span className="absolute top-1 left-2 text-[8px] text-gray-400/70 uppercase tracking-wider pointer-events-none select-none">
        {isAudioFft ? "Zoom \u00B7 Audio FFT" : "Zoom"}
      </span>
    </div>
  );
}
