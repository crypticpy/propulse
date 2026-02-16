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

import { useEffect, useMemo, useRef } from "react";
import {
  getWaterfallPaletteLut,
  computePassbandHz,
  rfHzToAudioHz,
  audioHzToRfHz,
} from "@/components/sdr/waterfallPalette";
import type { RadioBinaryFrame } from "@/lib/radio/protocol";
import type {
  WaterfallPaletteName,
  WaterfallView,
  TuningOverlay,
} from "@/components/sdr/waterfallPalette";

type FftFrame = Extract<RadioBinaryFrame, { kind: "fft" }>;

type HitTarget =
  | { kind: "filterLow" }
  | { kind: "filterHigh" }
  | { kind: "notch"; id: string; freqHz: number; q: number }
  | { kind: "none" };

type DragState =
  | { active: false }
  | { active: true; target: HitTarget; startX: number; startY: number };

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
}

export function PassbandDetail({
  frame,
  audioFftFrame,
  tuning,
  minDb,
  maxDb,
  palette,
  gamma = 1.0,
  notchFilters,
  onFilterChange,
  onAddNotch,
  onUpdateNotch,
  onRemoveNotch,
  onPickFrequencyHz,
  onWheelTune,
}: PassbandDetailProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const wfCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const olCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const dragRef = useRef<DragState>({ active: false });
  const cursorRef = useRef<string>("crosshair");
  const lastViewRef = useRef<{ centerHz: number; spanHz: number } | null>(null);

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

  const tuningRef = useRef(tuning);
  tuningRef.current = tuning;
  const notchRef = useRef(notchFilters);
  notchRef.current = notchFilters;

  const lut = useMemo(() => getWaterfallPaletteLut(palette), [palette]);

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

  // Audio FFT is in dBFS (-∞..0), radio scope is in dBm-ish.
  // Auto-range for audio FFT so the waterfall colors map correctly.
  const isAudioFft = !!audioFftFrame;
  const effectiveMinDb = isAudioFft ? -120 : minDb;
  const effectiveMaxDb = isAudioFft ? -20 : maxDb;
  const effectiveRange = Math.max(1, effectiveMaxDb - effectiveMinDb);

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
    if (!canvas || !effectiveFrame || !zoomView) return;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    if (w < 2 || h < 2) return;

    const bins = effectiveFrame.bins;
    if (bins.length === 0) return;

    const startFrame = effectiveFrame.centerHz - effectiveFrame.spanHz / 2;
    const viewStart = zoomView.centerHz - zoomView.spanHz / 2;
    const viewSpan = zoomView.spanHz;

    // Scroll existing content down by 1 pixel
    ctx.drawImage(canvas, 0, 1);

    // Build new row with linear interpolation between FFT bins
    const row = ctx.createImageData(w, 1);
    const data = row.data;
    for (let x = 0; x < w; x++) {
      const hz = viewStart + (x / (w - 1)) * viewSpan;
      const fracIdx = ((hz - startFrame) / effectiveFrame.spanHz) * bins.length;
      const clamped = Math.max(0, Math.min(bins.length - 1.001, fracIdx));
      const lo = Math.floor(clamped);
      const hi = Math.min(lo + 1, bins.length - 1);
      const frac = clamped - lo;
      const db =
        (bins[lo] ?? effectiveMinDb) * (1 - frac) +
        (bins[hi] ?? effectiveMinDb) * frac;
      const tLinear = Math.max(
        0,
        Math.min(1, (db - effectiveMinDb) / effectiveRange),
      );
      const t = gamma === 1.0 ? tLinear : Math.pow(tLinear, 1 / gamma);
      const lutIdx = Math.max(0, Math.min(255, Math.round(t * 255)));
      const i = x * 4;
      data[i] = lut[lutIdx * 3] ?? 0;
      data[i + 1] = lut[lutIdx * 3 + 1] ?? 0;
      data[i + 2] = lut[lutIdx * 3 + 2] ?? 0;
      data[i + 3] = 255;
    }
    ctx.putImageData(row, 0, 0);
  }, [effectiveFrame, zoomView, lut, effectiveMinDb, effectiveRange, gamma]);

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
      ctx.fillStyle = "rgba(0, 180, 255, 0.12)";
      ctx.fillRect(pbX0, 0, pbX1 - pbX0, h);

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

    // ── Enabled notch markers ────────────────────────────────────────
    for (const n of notchFilters) {
      if (!n.enabled) continue;
      const nRfHz = audioHzToRfHz(n.freqHz, tuning.freqHz, tuning.mode);
      const nT = (nRfHz - viewStart) / zoomView.spanHz;
      if (nT < -0.01 || nT > 1.01) continue;
      const nX = Math.round(hzToX(nRfHz));

      const bwHz = n.freqHz / Math.max(1, n.q);
      const bwPx = Math.max(2, (bwHz / zoomView.spanHz) * (w - 1));
      const halfBw = bwPx / 2;

      ctx.fillStyle = "rgba(255, 140, 0, 0.15)";
      ctx.fillRect(nX - halfBw, 0, bwPx, h);

      ctx.save();
      ctx.setLineDash([4 * dpr, 3 * dpr]);
      ctx.strokeStyle = "rgba(255, 140, 0, 0.8)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(nX, 0);
      ctx.lineTo(nX, h);
      ctx.stroke();
      ctx.restore();

      const vSize = 4 * dpr;
      ctx.fillStyle = "rgba(255, 140, 0, 0.9)";
      ctx.beginPath();
      ctx.moveTo(nX - vSize, 0);
      ctx.lineTo(nX, vSize);
      ctx.lineTo(nX + vSize, 0);
      ctx.closePath();
      ctx.fill();
    }
  }, [tuning, zoomView, notchFilters, onFilterChange]);

  // ── Hit detection ──────────────────────────────────────────────────────
  const hitDetect = (clientX: number): HitTarget => {
    const canvas = olCanvasRef.current;
    const z = zoomRef.current;
    const t = tuningRef.current;
    if (!canvas || !z || !t) return { kind: "none" };

    const rect = canvas.getBoundingClientRect();
    const cssX = clientX - rect.left;
    const cssW = rect.width;
    if (cssW <= 0) return { kind: "none" };

    const viewStart = z.centerHz - z.spanHz / 2;
    const hzPerPx = z.spanHz / cssW;

    const pb = computePassbandHz(t);
    const pbStartPx = (pb.startHz - viewStart) / hzPerPx;
    const pbEndPx = (pb.endHz - viewStart) / hzPerPx;
    const pbWidthPx = pbEndPx - pbStartPx;
    const threshold = Math.max(4, Math.min(8, pbWidthPx / 3));

    // Notch markers (highest priority)
    const notches = notchRef.current;
    for (const n of notches) {
      if (!n.enabled) continue;
      const nRfHz = audioHzToRfHz(n.freqHz, t.freqHz, t.mode);
      const nPx = (nRfHz - viewStart) / hzPerPx;
      if (Math.abs(cssX - nPx) <= threshold) {
        return { kind: "notch", id: n.id, freqHz: n.freqHz, q: n.q };
      }
    }

    // Passband edges
    if (Math.abs(cssX - pbStartPx) <= threshold) return { kind: "filterLow" };
    if (Math.abs(cssX - pbEndPx) <= threshold) return { kind: "filterHigh" };

    return { kind: "none" };
  };

  // ── Pointer events ─────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = olCanvasRef.current;
    if (!canvas) return;

    const setCursor = (c: string) => {
      if (cursorRef.current !== c) {
        cursorRef.current = c;
        canvas.style.cursor = c;
      }
    };

    const pxToRfHz = (clientX: number): number => {
      const rect = canvas.getBoundingClientRect();
      const frac = (clientX - rect.left) / rect.width;
      const z = zoomRef.current!;
      const viewStart = z.centerHz - z.spanHz / 2;
      return viewStart + Math.max(0, Math.min(1, frac)) * z.spanHz;
    };

    const handlePointerDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      const hit = hitDetect(e.clientX);
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
      const z = zoomRef.current;

      if (drag.active && drag.target.kind !== "none" && t && z) {
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
        const hit = hitDetect(e.clientX);
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
        const dx = e.clientX - drag.startX;
        const dy = e.clientY - drag.startY;
        if (
          Math.sqrt(dx * dx + dy * dy) < 4 &&
          cbRef.current.onPickFrequencyHz &&
          zoomRef.current
        ) {
          cbRef.current.onPickFrequencyHz(Math.round(pxToRfHz(e.clientX)));
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
      const z = zoomRef.current;
      if (!t || !z) return;

      const hit = hitDetect(e.clientX);
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
        ref={olCanvasRef}
        className="absolute inset-0 w-full h-full touch-none"
      />
      <span className="absolute top-1 left-2 text-[8px] text-gray-400/70 uppercase tracking-wider pointer-events-none select-none">
        {isAudioFft ? "Zoom \u00B7 Audio FFT" : "Zoom"}
      </span>
    </div>
  );
}
