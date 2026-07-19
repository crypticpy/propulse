import { useCallback, useEffect, useMemo, useRef } from "react";
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
  rfHzToAudioHz,
} from "@/components/sdr/waterfallPalette";
import type { EqBand, EqBandCategory } from "@/lib/audio/eqTypes";
import { filterTypeUsesGain } from "@/lib/audio/eqTypes";
import {
  computeEqResponse,
  computeSingleBandResponse,
} from "@/lib/audio/eqResponse";
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
  /** EQ bands to render as frequency response overlay */
  eqBands?: EqBand[];
  /** ID of the currently hovered EQ band (for individual response display) */
  hoveredEqBandId?: string | null;
  /** Called to add a new EQ band */
  onAddEqBand?: (
    freqHz: number,
    gainDb: number,
    category: EqBandCategory,
  ) => void;
  /** Called to update an existing EQ band (freq, q, gain) */
  onUpdateEqBand?: (
    id: string,
    freqHz: number,
    q: number,
    gainDb: number,
  ) => void;
  /** Called to remove an EQ band */
  onRemoveEqBand?: (id: string) => void;
  /** Called when hovering over/away from an EQ band dot */
  onEqBandHover?: (id: string | null) => void;
  /** Called when mouse wheel adjusts Q on an EQ band */
  onEqBandQChange?: (id: string, q: number) => void;
  /** Called when right-click triggers context menu on spectrum */
  onEqContextMenu?: (e: {
    screenX: number;
    screenY: number;
    audioHz: number;
    band?: EqBand;
  }) => void;
  /** Called when a band dot is clicked or right-clicked to open the control panel */
  onEqBandSelect?: (band: EqBand, screenX: number, screenY: number) => void;
  /** Optional high-resolution audio FFT frame (~11.7 Hz/bin). When provided,
   *  pixels within its frequency range are sampled from this frame. */
  audioFrame?: FftFrame | null;
  /** dB floor for the audio frame (default -120). */
  audioMinDb?: number;
  /** dB ceiling for the audio frame (default -20). */
  audioMaxDb?: number;
  /** Optional passband fill opacity (0..0.3). When omitted, uses the
   *  component's built-in styling. Set to 0 to show edges only. */
  passbandFillOpacity?: number;
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

// Stable empty arrays for default props — prevents draw-effect churn
const EMPTY_OVERLAYS: NonNullable<SpectrumScopeProps["overlays"]> = [];
const EMPTY_NOTCH_FILTERS: NonNullable<SpectrumScopeProps["notchFilters"]> = [];
const EMPTY_EQ_BANDS: EqBand[] = [];

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
  overlays = EMPTY_OVERLAYS,
  notchFilters = EMPTY_NOTCH_FILTERS,
  onFilterChange,
  onAddNotch,
  onUpdateNotch,
  onRemoveNotch,
  eqBands = EMPTY_EQ_BANDS,
  hoveredEqBandId = null,
  onAddEqBand,
  onUpdateEqBand,
  onRemoveEqBand,
  onEqBandHover,
  onEqBandQChange,
  onEqContextMenu,
  onEqBandSelect,
  audioFrame = null,
  audioMinDb: audioMinDbVal = -120,
  audioMaxDb: audioMaxDbVal = -20,
  passbandFillOpacity,
}: SpectrumScopeProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const peakRef = useRef<Float32Array | null>(null);
  const renderDprRef = useRef<number>(1);

  // ── Pre-allocated buffers (reallocated only on canvas width change) ──
  const fftBufRef = useRef<Float32Array | null>(null);
  const smoothBufARef = useRef<Float32Array | null>(null);
  const smoothBufBRef = useRef<Float32Array | null>(null);
  const temporalBufRef = useRef<Float32Array | null>(null);
  const lastBufWidthRef = useRef<number>(0);
  const yBufRef = useRef<Int16Array | null>(null);
  const yPeakBufRef = useRef<Int16Array | null>(null);

  // ── Refs for the shared interaction hook ─────────────────────────────
  const viewRef = useRef(view);
  viewRef.current = view;
  const tuningRef = useRef(tuning ?? null);
  tuningRef.current = tuning ?? null;
  const notchRef = useRef(notchFilters);
  notchRef.current = notchFilters;
  const eqBandsRef = useRef(eqBands);
  eqBandsRef.current = eqBands;

  // ── Pre-allocated EQ rendering buffers ──────────────────────────────
  const eqFreqBufRef = useRef<Float32Array | null>(null);
  const eqViewKeyRef = useRef<string>("");
  const eqResponseDbRef = useRef<Float32Array | null>(null);
  const eqSingleDbRef = useRef<Float32Array | null>(null);
  const lastEqBandsForResponseRef = useRef<EqBand[] | null>(null);
  const lastHoveredEqBandIdForResponseRef = useRef<string | null>(null);

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

  // ── Shared interaction hook (replaces all inline pointer/wheel code) ──
  const interactionRef = useSpectrumInteraction({
    viewRef,
    tuningRef,
    notchRef,
    callbacksRef,
    eqBandsRef,
  });
  const mergedRef = useCallback(
    (el: HTMLCanvasElement | null) => {
      canvasRef.current = el;
      interactionRef(el);
    },
    [interactionRef],
  );

  const lut = useMemo(() => getWaterfallPaletteLut(palette), [palette]);

  // ── Canvas resize ──────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const cssW = Math.max(1, rect.width);
      const cssH = Math.max(1, rect.height);

      // Large scopes can easily turn into multi-million pixel redraws at full
      // DPR (e.g. 1700x1500 @2x = 10M pixels). Downsample to keep the scope
      // fluid; interaction uses CSS pixels so tuning accuracy is unchanged.
      const desiredDpr = Math.max(1, window.devicePixelRatio || 1);
      const MAX_DPR = 1.25;
      const MAX_PIXELS = 1_200_000;
      const budgetDpr = Math.sqrt(MAX_PIXELS / (cssW * cssH));
      const effectiveDpr = Math.max(
        0.6,
        Math.min(desiredDpr, MAX_DPR, budgetDpr),
      );
      renderDprRef.current = effectiveDpr;

      const w = Math.max(1, Math.floor(cssW * effectiveDpr));
      const h = Math.max(1, Math.floor(cssH * effectiveDpr));
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

  // ── Draw loop (vsync-aligned) ───────────────────────────────────────────
  //
  // Keep a continuous rAF render loop so the scope stays smooth even if:
  // - daemon FFT frames arrive in bursts
  // - React re-renders for non-FFT UI state
  //
  // We only recompute the expensive FFT->points mapping when inputs change,
  // then ease the displayed trace toward the latest points each vsync.
  const drawInputsRef = useRef({
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
    onFilterChange,
    eqBands,
    hoveredEqBandId,
    audioFrame,
    audioMinDbVal,
    audioMaxDbVal,
    passbandFillOpacity,
  });
  drawInputsRef.current = {
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
    onFilterChange,
    eqBands,
    hoveredEqBandId,
    audioFrame,
    audioMinDbVal,
    audioMaxDbVal,
    passbandFillOpacity,
  };

  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const bgCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const bgKeyRef = useRef<string>("");
  const needsComputeRef = useRef(true);
  const rafLoopRef = useRef<number | null>(null);
  const lastDrawAtRef = useRef<number>(0);
  const traceKeyRef = useRef<string>("");
  const traceRgbRef = useRef<{ r: number; g: number; b: number }>({
    r: 255,
    g: 0,
    b: 0,
  });
  // Cached gradient-fill objects (rebuilt only when color/opacity/height change).
  const fillGradKeyRef = useRef<string>("");
  const fillGradRef = useRef<CanvasGradient | null>(null);
  const glowGradRef = useRef<CanvasGradient | null>(null);

  useEffect(() => {
    // Mark the expensive FFT->points mapping dirty when its inputs change.
    needsComputeRef.current = true;
  }, [
    frame,
    view?.centerHz,
    view?.spanHz,
    minDb,
    maxDb,
    smoothing,
    tuning?.freqHz,
    tuning?.mode,
    tuning?.filterLowHz,
    tuning?.filterHighHz,
    audioFrame,
    audioMinDbVal,
    audioMaxDbVal,
  ]);

  useEffect(() => {
    let alive = true;
    const loop = (now: number) => {
      if (!alive) return;
      rafLoopRef.current = requestAnimationFrame(loop);

      const canvas = canvasRef.current;
      const s = drawInputsRef.current;
      if (!canvas || !s.frame || !s.view) return;

      const ctx =
        ctxRef.current ?? canvas.getContext("2d", { alpha: false });
      if (!ctx) return;
      ctxRef.current = ctx;

      const w = canvas.width;
      const h = canvas.height;
      if (w < 2 || h < 2) return;

      const lastAt = lastDrawAtRef.current || now;
      const dtMs = Math.max(1, Math.min(64, now - lastAt));
      lastDrawAtRef.current = now;
      const dtSec = dtMs / 1000;

      const dpr = renderDprRef.current || 1;

      const {
        frame: frameNow,
        view: viewNow,
        minDb: minDbNow,
        maxDb: maxDbNow,
        overlays: overlaysNow,
        lut: lutNow,
        tuning: tuningNow,
        showPeakHold: showPeakHoldNow,
        showGradientFill: showGradientFillNow,
        bgColor: bgColorNow,
        gridLines: gridLinesNow,
        verticalGridLines: verticalGridLinesNow,
        gridOpacity: gridOpacityNow,
        smoothing: smoothingNow,
        lineColor: lineColorNow,
        lineWidthPx: lineWidthPxNow,
        fillOpacity: fillOpacityNow,
        lineShadow: lineShadowNow,
        lineShadowBlur: lineShadowBlurNow,
        tuningLineColorProp: tuningLineColorNow,
        tuningArrowColorProp: tuningArrowColorNow,
        onFilterChange: onFilterChangeNow,
        eqBands: eqBandsNow,
        hoveredEqBandId: hoveredEqBandIdNow,
        audioFrame: audioFrameNow,
        audioMinDbVal: audioMinDbValNow,
        audioMaxDbVal: audioMaxDbValNow,
        passbandFillOpacity: passbandFillOpacityNow,
      } = s;

      // ── Reallocate buffers if canvas width changed ──────────
      if (lastBufWidthRef.current !== w) {
        fftBufRef.current = new Float32Array(w);
        smoothBufARef.current = new Float32Array(w);
        smoothBufBRef.current = new Float32Array(w);
        temporalBufRef.current = null;
        peakRef.current = null;
        yBufRef.current = new Int16Array(w);
        yPeakBufRef.current = new Int16Array(w);
        lastBufWidthRef.current = w;
        bgKeyRef.current = "";
        traceKeyRef.current = "";
        needsComputeRef.current = true;
      }
      const points = fftBufRef.current!;
      const smoothA = smoothBufARef.current!;
      const smoothB = smoothBufBRef.current!;
      const yBuf = yBufRef.current!;
      const yPeakBuf = yPeakBufRef.current!;

      // ── Cached background (grid + solid fill) ────────────────
      const bgKey = `${w}|${h}|${bgColorNow}|${gridLinesNow}|${verticalGridLinesNow}|${gridOpacityNow}`;
      if (bgKeyRef.current !== bgKey) {
        bgKeyRef.current = bgKey;
        if (!bgCanvasRef.current) bgCanvasRef.current = document.createElement("canvas");
        const bg = bgCanvasRef.current;
        bg.width = w;
        bg.height = h;
        const bgCtx = bg.getContext("2d", { alpha: false });
        if (bgCtx) {
          bgCtx.fillStyle = bgColorNow;
          bgCtx.fillRect(0, 0, w, h);

          const gridColor = `rgba(255,255,255,${gridOpacityNow})`;
          bgCtx.strokeStyle = gridColor;
          bgCtx.lineWidth = 1;

          if (gridLinesNow > 0) {
            for (let i = 1; i <= gridLinesNow; i++) {
              const y = Math.round((i / (gridLinesNow + 1)) * h);
              bgCtx.beginPath();
              bgCtx.moveTo(0, y);
              bgCtx.lineTo(w, y);
              bgCtx.stroke();
            }
          }
          if (verticalGridLinesNow > 0) {
            for (let i = 1; i <= verticalGridLinesNow; i++) {
              const x = Math.round((i / (verticalGridLinesNow + 1)) * w);
              bgCtx.beginPath();
              bgCtx.moveTo(x, 0);
              bgCtx.lineTo(x, h);
              bgCtx.stroke();
            }
          }
        }
      }
      if (bgCanvasRef.current) ctx.drawImage(bgCanvasRef.current, 0, 0);

      // ── Compute target points (only when inputs change) ──────
      const range = Math.max(1, maxDbNow - minDbNow);
      const viewStart = viewNow.centerHz - viewNow.spanHz / 2;

      if (needsComputeRef.current) {
        const audioBins = audioFrameNow?.bins ?? null;
        const audioFullStart = audioFrameNow
          ? audioFrameNow.centerHz - audioFrameNow.spanHz / 2
          : 0;
        const audioRange = Math.max(1, audioMaxDbValNow - audioMinDbValNow);
        const pb =
          tuningNow && audioBins ? computePassbandHz(tuningNow) : null;

        fillFftCrossfade(points, viewStart, viewNow.spanHz, {
          civBins: frameNow.bins,
          civStartHz: frameNow.centerHz - frameNow.spanHz / 2,
          civSpanHz: frameNow.spanHz,
          civMinDb: minDbNow,
          civRange: range,
          audioBins,
          audioStartHz: audioFullStart,
          audioSpanHz: audioFrameNow?.spanHz ?? 1,
          audioMinDb: audioMinDbValNow,
          audioRange,
          passbandStartHz: pb ? pb.startHz : 0,
          passbandEndHz: pb ? pb.endHz : 0,
          fadeHz: 200,
          civInterpolation: "linear",
        });

        if (smoothingNow > 0) {
          smoothA.set(points);
          let src = smoothA;
          let dst = smoothB;
          for (let pass = 0; pass < smoothingNow; pass++) {
            dst[0] = src[0];
            dst[w - 1] = src[w - 1];
            for (let x = 1; x < w - 1; x++) {
              dst[x] = (src[x - 1] + src[x] + src[x + 1]) / 3;
            }
            const tmp = src;
            src = dst;
            dst = tmp;
          }
          points.set(src);
        }

        needsComputeRef.current = false;
      }

      // ── Temporal smoothing (runs every vsync) ────────────────
      if (!temporalBufRef.current || temporalBufRef.current.length !== w) {
        temporalBufRef.current = new Float32Array(w);
        temporalBufRef.current.set(points);
      } else {
        const display = temporalBufRef.current;
        // Keep time-based smoothing stable regardless of actual FPS.
        const timeConstMs = 40;
        const alpha = 1 - Math.exp(-dtMs / timeConstMs);
        for (let i = 0; i < w; i++) {
          display[i] += (points[i]! - display[i]!) * alpha;
        }
      }
      const display = temporalBufRef.current!;

      // ── Peak hold (time-based decay) ─────────────────────────
      if (!peakRef.current || peakRef.current.length !== w) {
        peakRef.current = new Float32Array(points);
      } else {
        const peak = peakRef.current;
        // Match old ~0.997/frame at 60 fps decay curve: 0.997^60 ≈ 0.835.
        const decay = Math.pow(0.835, dtSec);
        for (let i = 0; i < w; i++) {
          peak[i] = Math.max(peak[i]! * decay, points[i]!);
        }
      }
      const peak = peakRef.current!;

      // ── Resolve trace color (cached) ─────────────────────────
      const traceKey =
        lineColorNow === "auto"
          ? `auto|${lutNow[255 * 3] ?? 255},${lutNow[255 * 3 + 1] ?? 0},${lutNow[255 * 3 + 2] ?? 0}`
          : `hex|${lineColorNow}`;
      if (traceKeyRef.current !== traceKey) {
        traceKeyRef.current = traceKey;
        if (lineColorNow === "auto") {
          traceRgbRef.current = {
            r: lutNow[255 * 3] ?? 255,
            g: lutNow[255 * 3 + 1] ?? 0,
            b: lutNow[255 * 3 + 2] ?? 0,
          };
        } else {
          const hex = lineColorNow.replace("#", "");
          traceRgbRef.current = {
            r: parseInt(hex.slice(0, 2), 16) || 255,
            g: parseInt(hex.slice(2, 4), 16) || 255,
            b: parseInt(hex.slice(4, 6), 16) || 255,
          };
        }
      }
      const traceR = traceRgbRef.current.r;
      const traceG = traceRgbRef.current.g;
      const traceB = traceRgbRef.current.b;

      // ── Reusable paths for this frame ────────────────────────
      for (let x = 0; x < w; x++) {
        yBuf[x] = Math.round((1 - display[x]!) * (h - 1));
        yPeakBuf[x] = Math.round((1 - peak[x]!) * (h - 1));
      }
      const linePath = new Path2D();
      linePath.moveTo(0, yBuf[0]!);
      for (let x = 1; x < w; x++) linePath.lineTo(x, yBuf[x]!);
      const fillPath = new Path2D(linePath);
      fillPath.lineTo(w - 1, h);
      fillPath.lineTo(0, h);
      fillPath.closePath();

      // Nicer looking trace for the top scope.
      ctx.lineJoin = "round";
      ctx.lineCap = "round";

      // ── Tuning overlay: passband + VFO marker ─────────────────
      if (tuningNow) {
        const passband = computePassbandHz(tuningNow);
        const pbStartT = (passband.startHz - viewStart) / viewNow.spanHz;
        const pbEndT = (passband.endHz - viewStart) / viewNow.spanHz;
        const pbX0 = Math.round(Math.max(0, pbStartT) * (w - 1));
        const pbX1 = Math.round(Math.min(1, pbEndT) * (w - 1));

        if (pbX1 > pbX0 && pbStartT < 1 && pbEndT > 0) {
          const vfoT = (tuningNow.freqHz - viewStart) / viewNow.spanHz;
          const vfoX = Math.round(vfoT * (w - 1));

          // Passband fill: default styling, but allow callers to drive opacity
          // so the passband "read" is consistent across views.
          const hasCustomOpacity =
            typeof passbandFillOpacityNow === "number";
          const desired = hasCustomOpacity
            ? Math.max(0, Math.min(0.3, passbandFillOpacityNow))
            : 0.12;
          const base = 0.12;
          const scale = hasCustomOpacity ? desired / base : 1;
          const a = (v: number) => Math.min(0.35, Math.max(0, v * scale));

          if (!hasCustomOpacity || desired > 0) {
            const bandGrad = ctx.createLinearGradient(pbX0, 0, pbX1, 0);
            bandGrad.addColorStop(0, `rgba(0, 180, 255, ${a(0.08)})`);
            bandGrad.addColorStop(0.3, `rgba(0, 200, 255, ${a(0.18)})`);
            bandGrad.addColorStop(0.5, `rgba(0, 220, 255, ${a(0.25)})`);
            bandGrad.addColorStop(0.7, `rgba(0, 200, 255, ${a(0.18)})`);
            bandGrad.addColorStop(1, `rgba(0, 180, 255, ${a(0.08)})`);
            ctx.fillStyle = bandGrad;
            ctx.fillRect(pbX0, 0, pbX1 - pbX0, h);
          }

          // Passband edge lines (brighter to indicate draggable)
          const hasFilterCb = !!onFilterChangeNow;
          const edgeAlpha = hasFilterCb ? 0.4 : 0.2;
          ctx.strokeStyle = `rgba(0, 200, 255, ${edgeAlpha})`;
          ctx.lineWidth = (hasFilterCb ? 2 : 1) * dpr;
          ctx.beginPath();
          ctx.moveTo(pbX0, 0);
          ctx.lineTo(pbX0, h);
          ctx.moveTo(pbX1, 0);
          ctx.lineTo(pbX1, h);
          ctx.stroke();

          // VFO center line + arrow
          if (vfoT >= 0 && vfoT <= 1) {
            const mode = (tuningNow.mode ?? "USB").toUpperCase();
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

            ctx.strokeStyle = tuningLineColorNow + "66";
            ctx.lineWidth = 3 * dpr;
            ctx.beginPath();
            ctx.moveTo(vfoX, arrowHeight);
            ctx.lineTo(vfoX, h);
            ctx.stroke();

            ctx.strokeStyle = tuningLineColorNow + "d9";
            ctx.lineWidth = 1 * dpr;
            ctx.beginPath();
            ctx.moveTo(vfoX, arrowHeight);
            ctx.lineTo(vfoX, h);
            ctx.stroke();

            ctx.fillStyle = tuningArrowColorNow + "e6";
            ctx.beginPath();
            ctx.moveTo(baseLeft, 0);
            ctx.lineTo(baseRight, 0);
            ctx.lineTo(vfoX, arrowHeight);
            ctx.closePath();
            ctx.fill();
          }
        }

        // ── EQ frequency response overlay ──────────────────────────
        if (eqBandsNow.length > 0) {
          // Ensure frequency buffer is allocated for current width
          if (!eqFreqBufRef.current || eqFreqBufRef.current.length !== w) {
            eqFreqBufRef.current = new Float32Array(w);
            eqViewKeyRef.current = "";
            eqResponseDbRef.current = null;
            eqSingleDbRef.current = null;
            lastEqBandsForResponseRef.current = null;
            lastHoveredEqBandIdForResponseRef.current = null;
          }
          const freqBuf = eqFreqBufRef.current!;

          // Cache X->audioHz mapping unless view/tuning changed.
          const eqKey = `${w}|${viewStart}|${viewNow.spanHz}|${tuningNow.freqHz}|${tuningNow.mode}`;
          if (eqViewKeyRef.current !== eqKey) {
            eqViewKeyRef.current = eqKey;
            for (let x = 0; x < w; x++) {
              const rfHz = viewStart + (x / (w - 1)) * viewNow.spanHz;
              freqBuf[x] = rfHzToAudioHz(rfHz, tuningNow.freqHz, tuningNow.mode);
            }
            eqResponseDbRef.current = null;
            eqSingleDbRef.current = null;
            lastEqBandsForResponseRef.current = null;
            lastHoveredEqBandIdForResponseRef.current = null;
          }

          // Cache combined response unless bands or freq mapping changed.
          if (
            !eqResponseDbRef.current ||
            lastEqBandsForResponseRef.current !== eqBandsNow
          ) {
            eqResponseDbRef.current = computeEqResponse(eqBandsNow, freqBuf);
            lastEqBandsForResponseRef.current = eqBandsNow;
            eqSingleDbRef.current = null;
            lastHoveredEqBandIdForResponseRef.current = null;
          }
          const responseDb = eqResponseDbRef.current!;

          // Draw combined EQ curve
          const eqCenterY = h * 0.5;
          const dbPerPx = h / 48; // 48 dB range (-24 to +24) mapped to full height

          // Filled area between curve and center line
          ctx.beginPath();
          ctx.moveTo(0, eqCenterY);
          for (let x = 0; x < w; x++) {
            const y = eqCenterY - responseDb[x] * dbPerPx;
            ctx.lineTo(x, y);
          }
          ctx.lineTo(w - 1, eqCenterY);
          ctx.closePath();
          ctx.fillStyle = "rgba(100, 200, 255, 0.08)";
          ctx.fill();

          // Curve stroke
          ctx.beginPath();
          for (let x = 0; x < w; x++) {
            const y = eqCenterY - responseDb[x] * dbPerPx;
            if (x === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.strokeStyle = "rgba(100, 200, 255, 0.5)";
          ctx.lineWidth = 1.5 * dpr;
          ctx.stroke();

          // Draw hovered band's individual response
          if (hoveredEqBandIdNow) {
            if (
              lastHoveredEqBandIdForResponseRef.current !== hoveredEqBandIdNow
            ) {
              const hoveredBand = eqBandsNow.find(
                (b) => b.id === hoveredEqBandIdNow,
              );
              eqSingleDbRef.current =
                hoveredBand?.enabled
                  ? computeSingleBandResponse(hoveredBand, freqBuf)
                  : null;
              lastHoveredEqBandIdForResponseRef.current = hoveredEqBandIdNow;
            }
            const hoveredBand = eqBandsNow.find(
              (b) => b.id === hoveredEqBandIdNow,
            );
            const singleDb = eqSingleDbRef.current;
            if (hoveredBand?.enabled && singleDb) {

              // Individual band filled area
              ctx.beginPath();
              ctx.moveTo(0, eqCenterY);
              for (let x = 0; x < w; x++) {
                const y = eqCenterY - singleDb[x]! * dbPerPx;
                ctx.lineTo(x, y);
              }
              ctx.lineTo(w - 1, eqCenterY);
              ctx.closePath();
              const hoverColor =
                hoveredBand.category === "notch"
                  ? "rgba(255, 140, 0, 0.15)"
                  : "rgba(100, 200, 255, 0.15)";
              ctx.fillStyle = hoverColor;
              ctx.fill();

              // Individual band stroke
              ctx.beginPath();
              for (let x = 0; x < w; x++) {
                const y = eqCenterY - singleDb[x]! * dbPerPx;
                if (x === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
              }
              ctx.strokeStyle =
                hoveredBand.category === "notch"
                  ? "rgba(255, 140, 0, 0.7)"
                  : "rgba(100, 200, 255, 0.7)";
              ctx.lineWidth = 1.5 * dpr;
              ctx.stroke();
            }
          }

          // Draw control dots for each band
          for (const band of eqBandsNow) {
            const bandRfHz = audioHzToRfHz(
              band.freqHz,
              tuningNow.freqHz,
              tuningNow.mode,
            );
            const t = (bandRfHz - viewStart) / viewNow.spanHz;
            if (t < -0.02 || t > 1.02) continue;
            const dotX = Math.round(t * (w - 1));

            // Y position: gain-using types map gainDb to Y, others at center
            const dotY = filterTypeUsesGain(band.filterType)
              ? eqCenterY - band.gainDb * dbPerPx
              : eqCenterY;

            const dotRadius = 5 * dpr;
            const isHovered = band.id === hoveredEqBandIdNow;
            const isNotch = band.category === "notch";

            // Outer glow when hovered
            if (isHovered) {
              ctx.beginPath();
              ctx.arc(dotX, dotY, dotRadius + 3 * dpr, 0, Math.PI * 2);
              ctx.fillStyle = isNotch
                ? "rgba(255, 140, 0, 0.2)"
                : "rgba(100, 200, 255, 0.2)";
              ctx.fill();
            }

            // Main dot
            ctx.beginPath();
            ctx.arc(dotX, dotY, dotRadius, 0, Math.PI * 2);
            if (!band.enabled) {
              ctx.fillStyle = "rgba(100, 100, 100, 0.5)";
            } else if (isNotch) {
              ctx.fillStyle = isHovered
                ? "rgba(255, 160, 40, 1.0)"
                : "rgba(255, 140, 0, 0.85)";
            } else {
              ctx.fillStyle = isHovered
                ? "rgba(120, 220, 255, 1.0)"
                : "rgba(100, 200, 255, 0.85)";
            }
            ctx.fill();

            // White border on dot
            ctx.strokeStyle = band.enabled
              ? "rgba(255, 255, 255, 0.6)"
              : "rgba(255, 255, 255, 0.2)";
            ctx.lineWidth = 1 * dpr;
            ctx.stroke();
          }
        }
      }

      const pixels = w * h;
      const perf = Math.min(1, Math.sqrt(1_200_000 / Math.max(1, pixels)));

      // ── Gradient fill ─────────────────────────────────────────
      if (showGradientFillNow) {
        // Rebuild the vertical gradients only when color/opacity/height change.
        const gradKey = `${traceR},${traceG},${traceB}|${fillOpacityNow}|${h}`;
        if (
          fillGradKeyRef.current !== gradKey ||
          !fillGradRef.current ||
          !glowGradRef.current
        ) {
          fillGradKeyRef.current = gradKey;
          const grad = ctx.createLinearGradient(0, 0, 0, h);
          grad.addColorStop(
            0,
            `rgba(${traceR},${traceG},${traceB}, ${fillOpacityNow * 0.8})`,
          );
          grad.addColorStop(
            0.4,
            `rgba(${traceR},${traceG},${traceB}, ${fillOpacityNow * 0.3})`,
          );
          grad.addColorStop(
            1,
            `rgba(${traceR},${traceG},${traceB}, ${fillOpacityNow * 0.02})`,
          );
          fillGradRef.current = grad;

          const glowGrad = ctx.createLinearGradient(0, 0, 0, h);
          glowGrad.addColorStop(
            0,
            `rgba(${traceR},${traceG},${traceB}, ${fillOpacityNow * 1.2})`,
          );
          glowGrad.addColorStop(
            0.5,
            `rgba(${traceR},${traceG},${traceB}, ${fillOpacityNow * 0.4})`,
          );
          glowGrad.addColorStop(1, `rgba(${traceR},${traceG},${traceB}, 0)`);
          glowGradRef.current = glowGrad;
        }

        ctx.fillStyle = fillGradRef.current!;
        ctx.fill(fillPath);

        ctx.save();
        ctx.clip(fillPath);
        ctx.fillStyle = glowGradRef.current!;
        ctx.fillRect(0, 0, w, h);
        ctx.restore();
      }

      // ── Peak hold ─────────────────────────────────────────────
      if (showPeakHoldNow) {
        const peakPath = new Path2D();
        peakPath.moveTo(0, yPeakBuf[0]!);
        for (let x = 1; x < w; x++) peakPath.lineTo(x, yPeakBuf[x]!);
        ctx.strokeStyle = `rgba(${traceR},${traceG},${traceB}, 0.35)`;
        ctx.lineWidth = 1 * dpr;
        ctx.stroke(peakPath);
      }

      // ── Drop shadow ───────────────────────────────────────────
      if (lineShadowNow) {
        ctx.save();
        ctx.shadowColor = `rgba(${traceR},${traceG},${traceB}, 0.5)`;
        ctx.shadowBlur = lineShadowBlurNow * 1.2 * perf;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 3;
        ctx.strokeStyle = `rgba(${traceR},${traceG},${traceB}, 0.3)`;
        ctx.lineWidth = (lineWidthPxNow + 2) * dpr;
        ctx.stroke(linePath);
        ctx.restore();
      }

      // ── Main spectrum line ────────────────────────────────────
      if (lineShadowNow) {
        ctx.shadowColor = `rgba(${traceR},${traceG},${traceB}, 0.6)`;
        ctx.shadowBlur = lineShadowBlurNow * perf;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 2;
      }
      ctx.strokeStyle = `rgb(${traceR},${traceG},${traceB})`;
      ctx.lineWidth = lineWidthPxNow * dpr;
      ctx.stroke(linePath);

      if (lineShadowNow) {
        ctx.shadowColor = "transparent";
        ctx.shadowBlur = 0;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;
      }

      // ── Overlays (markers) ────────────────────────────────────
      for (const o of overlaysNow) {
        if (!Number.isFinite(o.hz)) continue;
        const t = (o.hz - viewStart) / viewNow.spanHz;
        if (t < 0 || t > 1) continue;
        const x = Math.round(t * (w - 1));
        ctx.strokeStyle = colorForOverlay(o.color);
        ctx.lineWidth = 1 * dpr;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
      }
    };

    rafLoopRef.current = requestAnimationFrame(loop);
    return () => {
      alive = false;
      if (rafLoopRef.current !== null) cancelAnimationFrame(rafLoopRef.current);
      rafLoopRef.current = null;
    };
  }, []);

  return (
    <canvas
      ref={mergedRef}
      className={`w-full h-full rounded-lg border border-white/10 bg-black touch-none ${className}`}
    />
  );
}

export default SpectrumScope;
