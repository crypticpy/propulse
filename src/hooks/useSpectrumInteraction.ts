/**
 * useSpectrumInteraction -- Shared pointer/hit-detection hook for SDR views.
 *
 * Extracts the duplicated interaction logic from SpectrumScope.tsx and
 * PassbandDetail.tsx into a single reusable hook.  Handles:
 *   - Hit-detecting filter band edges and notch markers
 *   - Drag-to-resize filter bandwidth
 *   - Drag-to-move notch filters
 *   - Click-to-tune (movement < 4 px = click, not drag)
 *   - Mouse-wheel tuning
 *   - Cursor style changes based on hit detection
 *   - Right-click context menu for adding/removing notch filters
 *
 * All mutable data (view, tuning, notches, callbacks) is accessed through
 * refs so the effect never re-registers event listeners.
 */

import { useEffect, useRef } from "react";
import type { RefObject } from "react";
import type {
  WaterfallView,
  TuningOverlay,
} from "@/components/sdr/waterfallPalette";
import {
  computePassbandHz,
  rfHzToAudioHz,
  audioHzToRfHz,
} from "@/components/sdr/waterfallPalette";

/**
 * A ref whose `.current` is guaranteed to be populated (non-null).
 * Consumers satisfy this by calling `useRef(value)` with an initial value
 * and updating `.current` every render. This is narrower than React's
 * `RefObject<T>` where `.current` is `T | null`.
 */
type LiveRef<T> = { readonly current: T };

// ── Exported types ──────────────────────────────────────────────────────────

export type HitTarget =
  | { kind: "filterLow" }
  | { kind: "filterHigh" }
  | { kind: "notch"; id: string; freqHz: number; q: number }
  | { kind: "none" };

export type DragState =
  | { active: false }
  | { active: true; target: HitTarget; startX: number; startY: number };

export interface NotchFilter {
  id: string;
  freqHz: number;
  q: number;
  enabled: boolean;
}

export interface SpectrumInteractionCallbacks {
  onPickFrequencyHz?: (hz: number) => void;
  onFilterChange?: (low: number, high: number) => void;
  onAddNotch?: (freqHz: number, q: number) => void;
  onUpdateNotch?: (id: string, freqHz: number, q: number) => void;
  onRemoveNotch?: (id: string) => void;
  onWheelTune?: (direction: number) => void;
}

export interface SpectrumInteractionOptions {
  /** The canvas element to attach pointer/wheel/context listeners to. */
  canvasRef: RefObject<HTMLCanvasElement | null>;
  /**
   * The current frequency view (centerHz + spanHz).
   * For SpectrumScope this is the main view; for PassbandDetail it is the
   * zoom view derived from the passband.
   * May be null when no view is available yet.
   */
  viewRef: LiveRef<WaterfallView | null>;
  /** Current tuning overlay (VFO freq, filter edges, mode). */
  tuningRef: LiveRef<TuningOverlay | null>;
  /** Active notch filter list -- always an array (may be empty). */
  notchRef: LiveRef<NotchFilter[]>;
  /** Callbacks ref -- kept fresh by the consumer each render. */
  callbacksRef: LiveRef<SpectrumInteractionCallbacks>;
  /**
   * Hit-detection threshold tuning.
   * - `minPx`: minimum pixel threshold (default 3)
   * - `maxPx`: maximum pixel threshold (default 6)
   * - `divisor`: passband-width divisor (default 4)
   *
   * SpectrumScope uses (3, 6, 4); PassbandDetail uses (4, 8, 3).
   */
  hitThreshold?: { minPx: number; maxPx: number; divisor: number };
  /**
   * When true, notch hit-detection skips disabled notches (default false).
   * PassbandDetail sets this to true; SpectrumScope leaves it false.
   */
  skipDisabledNotches?: boolean;
}

// ── Hook implementation ─────────────────────────────────────────────────────

export function useSpectrumInteraction(opts: SpectrumInteractionOptions): void {
  const {
    canvasRef,
    viewRef,
    tuningRef,
    notchRef,
    callbacksRef,
    hitThreshold = { minPx: 3, maxPx: 6, divisor: 4 },
    skipDisabledNotches = false,
  } = opts;

  // Stable refs for config values so the effect closure never goes stale
  const hitThresholdRef = useRef(hitThreshold);
  hitThresholdRef.current = hitThreshold;
  const skipDisabledRef = useRef(skipDisabledNotches);
  skipDisabledRef.current = skipDisabledNotches;

  const dragRef = useRef<DragState>({ active: false });
  const cursorRef = useRef<string>("crosshair");

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // ── Helpers ────────────────────────────────────────────────────────

    const setCursor = (cursor: string) => {
      if (cursorRef.current !== cursor) {
        cursorRef.current = cursor;
        canvas.style.cursor = cursor;
      }
    };

    const pxToRfHz = (clientX: number): number => {
      const rect = canvas.getBoundingClientRect();
      const frac = (clientX - rect.left) / rect.width;
      const v = viewRef.current!;
      const viewStart = v.centerHz - v.spanHz / 2;
      return viewStart + Math.max(0, Math.min(1, frac)) * v.spanHz;
    };

    const hitDetect = (clientX: number): HitTarget => {
      const v = viewRef.current;
      const t = tuningRef.current;
      if (!v || !t) return { kind: "none" };

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

      const th = hitThresholdRef.current;
      const threshold = Math.max(
        th.minPx,
        Math.min(th.maxPx, pbWidthPx / th.divisor),
      );

      // Check notch markers first (highest priority)
      const notches = notchRef.current;
      for (const n of notches) {
        if (skipDisabledRef.current && !n.enabled) continue;
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

    // ── Event handlers ────────────────────────────────────────────────

    const handlePointerDown = (e: PointerEvent) => {
      if (e.button !== 0) return; // only primary button
      const hit = hitDetect(e.clientX);
      if (
        hit.kind !== "none" &&
        (callbacksRef.current.onFilterChange ||
          callbacksRef.current.onUpdateNotch)
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
          callbacksRef.current.onFilterChange?.(clamped, t.filterHighHz);
        } else if (drag.target.kind === "filterHigh") {
          const clamped = Math.max(500, Math.min(15000, Math.round(audioHz)));
          callbacksRef.current.onFilterChange?.(t.filterLowHz, clamped);
        } else if (drag.target.kind === "notch") {
          const clamped = Math.max(20, Math.min(20000, Math.round(audioHz)));
          callbacksRef.current.onUpdateNotch?.(
            drag.target.id,
            clamped,
            drag.target.q,
          );
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
          setCursor(
            callbacksRef.current.onPickFrequencyHz ? "crosshair" : "default",
          );
        }
      }
    };

    const handlePointerUp = (e: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag.active) return;

      canvas.releasePointerCapture(e.pointerId);

      if (drag.target.kind === "none") {
        // Check if this was a click (moved < 4 px)
        const dx = e.clientX - drag.startX;
        const dy = e.clientY - drag.startY;
        if (
          Math.sqrt(dx * dx + dy * dy) < 4 &&
          callbacksRef.current.onPickFrequencyHz &&
          viewRef.current
        ) {
          const hz = pxToRfHz(e.clientX);
          callbacksRef.current.onPickFrequencyHz(Math.round(hz));
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

      const hit = hitDetect(e.clientX);
      if (hit.kind === "notch") {
        callbacksRef.current.onRemoveNotch?.(hit.id);
      } else {
        const rfHz = pxToRfHz(e.clientX);
        const audioHz = rfHzToAudioHz(rfHz, t.freqHz, t.mode);
        const clamped = Math.max(20, Math.min(20000, Math.round(audioHz)));
        callbacksRef.current.onAddNotch?.(clamped, 10);
      }
    };

    const handleWheel = (e: WheelEvent) => {
      if (!callbacksRef.current.onWheelTune) return;
      e.preventDefault();
      const direction = e.deltaY < 0 ? 1 : e.deltaY > 0 ? -1 : 0;
      if (direction !== 0) callbacksRef.current.onWheelTune(direction);
    };

    // ── Register native listeners ─────────────────────────────────────

    canvas.addEventListener("pointerdown", handlePointerDown);
    canvas.addEventListener("pointermove", handlePointerMove);
    canvas.addEventListener("pointerup", handlePointerUp);
    canvas.addEventListener("pointercancel", handlePointerCancel);
    canvas.addEventListener("contextmenu", handleContextMenu);
    canvas.addEventListener("wheel", handleWheel, { passive: false });

    // Set initial cursor
    setCursor(callbacksRef.current.onPickFrequencyHz ? "crosshair" : "default");

    return () => {
      canvas.removeEventListener("pointerdown", handlePointerDown);
      canvas.removeEventListener("pointermove", handlePointerMove);
      canvas.removeEventListener("pointerup", handlePointerUp);
      canvas.removeEventListener("pointercancel", handlePointerCancel);
      canvas.removeEventListener("contextmenu", handleContextMenu);
      canvas.removeEventListener("wheel", handleWheel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
