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
  rfHzToAudioHz,
  audioHzToRfHz,
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

// ── Hit detection types ─────────────────────────────────────────────────────
type HitTarget =
  | { kind: "filterLow" }
  | { kind: "filterHigh" }
  | { kind: "notch"; id: string; freqHz: number; q: number }
  | { kind: "none" };

type DragState =
  | { active: false }
  | { active: true; target: HitTarget; startX: number; startY: number };

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
  const dragRef = useRef<DragState>({ active: false });
  const cursorRef = useRef<string>("crosshair");

  // Keep callback refs fresh without re-renders
  const cbRef = useRef({
    onPickFrequencyHz,
    onFilterChange,
    onAddNotch,
    onUpdateNotch,
    onRemoveNotch,
    onWheelTune,
  });
  cbRef.current = {
    onPickFrequencyHz,
    onFilterChange,
    onAddNotch,
    onUpdateNotch,
    onRemoveNotch,
    onWheelTune,
  };

  // Keep tuning/view/notch refs fresh for pointer handlers
  const tuningRef = useRef(tuning);
  tuningRef.current = tuning;
  const viewRef = useRef(view);
  viewRef.current = view;
  const notchRef = useRef(notchFilters);
  notchRef.current = notchFilters;

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

  // ── Hit detection helper ───────────────────────────────────────────────
  const hitDetect = (clientX: number, _clientY: number): HitTarget => {
    const canvas = canvasRef.current;
    const v = viewRef.current;
    const t = tuningRef.current;
    if (!canvas || !v || !t) return { kind: "none" };

    const rect = canvas.getBoundingClientRect();
    const cssX = clientX - rect.left;
    const cssW = rect.width;
    if (cssW <= 0) return { kind: "none" };

    const viewStart = v.centerHz - v.spanHz / 2;
    const hzPerPx = v.spanHz / cssW;

    // Passband edges in CSS px
    const passband = computePassbandHz(t);
    const pbStartPx = (passband.startHz - viewStart) / hzPerPx;
    const pbEndPx = (passband.endHz - viewStart) / hzPerPx;
    const pbWidthPx = pbEndPx - pbStartPx;
    const threshold = Math.max(3, Math.min(6, pbWidthPx / 4));

    // Check notch markers first (highest priority)
    const notches = notchRef.current;
    for (const n of notches) {
      const nRfHz = audioHzToRfHz(n.freqHz, t.freqHz, t.mode);
      const nPx = (nRfHz - viewStart) / hzPerPx;
      if (Math.abs(cssX - nPx) <= threshold) {
        return { kind: "notch", id: n.id, freqHz: n.freqHz, q: n.q };
      }
    }

    // Check passband edges
    if (Math.abs(cssX - pbStartPx) <= threshold) return { kind: "filterLow" };
    if (Math.abs(cssX - pbEndPx) <= threshold) return { kind: "filterHigh" };

    return { kind: "none" };
  };

  // ── Pointer event handlers (registered as native events) ───────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const setCursor = (cursor: string) => {
      if (cursorRef.current !== cursor) {
        cursorRef.current = cursor;
        canvas.style.cursor = cursor;
      }
    };

    const pxToRfHz = (clientX: number): number => {
      const rect = canvas.getBoundingClientRect();
      const t = (clientX - rect.left) / rect.width;
      const v = viewRef.current!;
      const viewStart = v.centerHz - v.spanHz / 2;
      return viewStart + Math.max(0, Math.min(1, t)) * v.spanHz;
    };

    const handlePointerDown = (e: PointerEvent) => {
      if (e.button !== 0) return; // only primary button
      const hit = hitDetect(e.clientX, e.clientY);
      if (
        hit.kind !== "none" &&
        (cbRef.current.onFilterChange || cbRef.current.onUpdateNotch)
      ) {
        canvas.setPointerCapture(e.pointerId);
        dragRef.current = {
          active: true,
          target: hit,
          startX: e.clientX,
          startY: e.clientY,
        };
        e.preventDefault();
      } else {
        // Track for potential click-to-tune
        dragRef.current = {
          active: true,
          target: { kind: "none" },
          startX: e.clientX,
          startY: e.clientY,
        };
      }
    };

    const handlePointerMove = (e: PointerEvent) => {
      const drag = dragRef.current;
      const t = tuningRef.current;
      const v = viewRef.current;

      if (drag.active && drag.target.kind !== "none" && t && v) {
        const rfHz = pxToRfHz(e.clientX);
        const audioHz = rfHzToAudioHz(rfHz, t.freqHz, t.mode);

        if (drag.target.kind === "filterLow") {
          const clamped = Math.max(0, Math.min(5000, Math.round(audioHz)));
          cbRef.current.onFilterChange?.(clamped, t.filterHighHz);
        } else if (drag.target.kind === "filterHigh") {
          const clamped = Math.max(500, Math.min(15000, Math.round(audioHz)));
          cbRef.current.onFilterChange?.(t.filterLowHz, clamped);
        } else if (drag.target.kind === "notch") {
          const clamped = Math.max(20, Math.min(20000, Math.round(audioHz)));
          cbRef.current.onUpdateNotch?.(drag.target.id, clamped, drag.target.q);
        }
        return;
      }

      // Hover cursor feedback
      if (!drag.active || drag.target.kind === "none") {
        const hit = hitDetect(e.clientX, e.clientY);
        if (hit.kind === "filterLow" || hit.kind === "filterHigh") {
          setCursor("ew-resize");
        } else if (hit.kind === "notch") {
          setCursor("grab");
        } else {
          setCursor(cbRef.current.onPickFrequencyHz ? "crosshair" : "default");
        }
      }
    };

    const handlePointerUp = (e: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag.active) return;

      canvas.releasePointerCapture(e.pointerId);

      if (drag.target.kind === "none") {
        // Check if this was a click (moved < 4px)
        const dx = e.clientX - drag.startX;
        const dy = e.clientY - drag.startY;
        if (
          Math.sqrt(dx * dx + dy * dy) < 4 &&
          cbRef.current.onPickFrequencyHz &&
          viewRef.current
        ) {
          const hz = pxToRfHz(e.clientX);
          cbRef.current.onPickFrequencyHz(Math.round(hz));
        }
      }

      dragRef.current = { active: false };
    };

    const handlePointerCancel = (e: PointerEvent) => {
      canvas.releasePointerCapture(e.pointerId);
      dragRef.current = { active: false };
    };

    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      const t = tuningRef.current;
      const v = viewRef.current;
      if (!t || !v) return;

      const hit = hitDetect(e.clientX, e.clientY);
      if (hit.kind === "notch") {
        cbRef.current.onRemoveNotch?.(hit.id);
      } else {
        const rfHz = pxToRfHz(e.clientX);
        const audioHz = rfHzToAudioHz(rfHz, t.freqHz, t.mode);
        const clamped = Math.max(20, Math.min(20000, Math.round(audioHz)));
        cbRef.current.onAddNotch?.(clamped, 10);
      }
    };

    const handleWheel = (e: WheelEvent) => {
      if (!cbRef.current.onWheelTune) return;
      e.preventDefault();
      const direction = e.deltaY < 0 ? 1 : e.deltaY > 0 ? -1 : 0;
      if (direction !== 0) cbRef.current.onWheelTune(direction);
    };

    canvas.addEventListener("pointerdown", handlePointerDown);
    canvas.addEventListener("pointermove", handlePointerMove);
    canvas.addEventListener("pointerup", handlePointerUp);
    canvas.addEventListener("pointercancel", handlePointerCancel);
    canvas.addEventListener("contextmenu", handleContextMenu);
    canvas.addEventListener("wheel", handleWheel, { passive: false });

    // Set initial cursor
    setCursor(cbRef.current.onPickFrequencyHz ? "crosshair" : "default");

    return () => {
      canvas.removeEventListener("pointerdown", handlePointerDown);
      canvas.removeEventListener("pointermove", handlePointerMove);
      canvas.removeEventListener("pointerup", handlePointerUp);
      canvas.removeEventListener("pointercancel", handlePointerCancel);
      canvas.removeEventListener("contextmenu", handleContextMenu);
      canvas.removeEventListener("wheel", handleWheel);
    };
  }, []);

  // ── Draw effect ────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !frame || !view) return;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    if (w < 2 || h < 2) return;

    const dpr = Math.max(1, window.devicePixelRatio || 1);

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

    // ── Build points array ────────────────────────────────────
    const range = Math.max(1, maxDb - minDb);
    const bins = frame.bins;
    const startFrame = frame.centerHz - frame.spanHz / 2;
    const viewStart = view.centerHz - view.spanHz / 2;
    const points = new Float32Array(w);

    // Pre-compute audio FFT boundaries, clipped to the passband.
    // Audio outside the passband is DSP-filtered silence — using it would
    // create a visible seam against the CI-V wideband data.
    const audioBins = audioFrame?.bins;
    const audioFullStart = audioFrame
      ? audioFrame.centerHz - audioFrame.spanHz / 2
      : 0;
    const audioRange = Math.max(1, audioMaxDbVal - audioMinDbVal);

    // Clip to passband + cross-fade zone
    const pb = tuning && audioBins ? computePassbandHz(tuning) : null;
    const audioRegionStart = pb ? pb.startHz : 0;
    const audioRegionEnd = pb ? pb.endHz : 0;
    const fadeHz = 200; // Hz cross-fade at edges

    for (let x = 0; x < w; x++) {
      const hz = viewStart + (x / (w - 1)) * view.spanHz;

      const inFadeRegion =
        pb &&
        audioBins &&
        hz >= audioRegionStart - fadeHz &&
        hz < audioRegionEnd + fadeHz;

      if (inFadeRegion) {
        // Sample from high-res audio FFT
        const aFrac =
          ((hz - audioFullStart) / audioFrame!.spanHz) * audioBins.length;
        const aCl = Math.max(0, Math.min(audioBins.length - 1.001, aFrac));
        const aLo = Math.floor(aCl);
        const aHi = Math.min(aLo + 1, audioBins.length - 1);
        const af = aCl - aLo;
        const aDb =
          (audioBins[aLo] ?? audioMinDbVal) * (1 - af) +
          (audioBins[aHi] ?? audioMinDbVal) * af;
        const audioVal = Math.max(
          0,
          Math.min(1, (aDb - audioMinDbVal) / audioRange),
        );

        // Sample CI-V for crossfade blending
        const cFrac = ((hz - startFrame) / frame.spanHz) * bins.length;
        const cCl = Math.max(0, Math.min(bins.length - 1.001, cFrac));
        const cLo = Math.floor(cCl);
        const cHi = Math.min(cLo + 1, bins.length - 1);
        const cf = cCl - cLo;
        const cDb = (bins[cLo] ?? minDb) * (1 - cf) + (bins[cHi] ?? minDb) * cf;
        const civVal = Math.max(0, Math.min(1, (cDb - minDb) / range));

        // Cross-fade: 1 = full audio, 0 = full CI-V
        let blend = 1;
        if (hz < audioRegionStart) {
          blend = (hz - (audioRegionStart - fadeHz)) / fadeHz;
        } else if (hz >= audioRegionEnd) {
          blend = (audioRegionEnd + fadeHz - hz) / fadeHz;
        }
        blend = Math.max(0, Math.min(1, blend));

        points[x] = audioVal * blend + civVal * (1 - blend);
      } else {
        // Sample from CI-V wideband scope
        const fracIdx = ((hz - startFrame) / frame.spanHz) * bins.length;
        const clamped = Math.max(0, Math.min(bins.length - 1.001, fracIdx));
        const lo = Math.floor(clamped);
        const hi = Math.min(lo + 1, bins.length - 1);
        const frac = clamped - lo;
        const db =
          (bins[lo] ?? minDb) * (1 - frac) + (bins[hi] ?? minDb) * frac;
        points[x] = Math.max(0, Math.min(1, (db - minDb) / range));
      }
    }

    for (let pass = 0; pass < smoothing; pass++) {
      const prev = new Float32Array(points);
      for (let x = 1; x < w - 1; x++) {
        points[x] = (prev[x - 1] + prev[x] + prev[x + 1]) / 3;
      }
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
          const isSymmetric = mode === "AM" || mode === "FM" || mode === "WFM";
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
        const y = Math.round((1 - peak[x]) * (h - 1));
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
