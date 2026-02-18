import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RadioBinaryFrame } from "@/lib/radio/protocol";
import type {
  WaterfallPaletteName,
  WaterfallView,
  TuningOverlay,
} from "@/components/sdr/waterfallPalette";
import {
  getWaterfallPaletteLutWithGamma,
  computePassbandHz,
} from "@/components/sdr/waterfallPalette";
import { fillFftCrossfade } from "@/lib/sdr/fftCrossfade";

type FftFrame = Extract<RadioBinaryFrame, { kind: "fft" }>;

interface WaterfallProps {
  frame: FftFrame | null;
  view?: WaterfallView | null;
  onViewChange?: (view: WaterfallView) => void;
  className?: string;
  /** dB floor (mapped to black) */
  minDb?: number;
  /** dB ceiling (mapped to the palette's high end) */
  maxDb?: number;
  palette?: WaterfallPaletteName;
  /** VFO tuning line + filter passband overlay */
  tuning?: TuningOverlay | null;
  /** Speed multiplier — rows appended per frame (default 1) */
  speed?: number;
  /** Texture filtering: "nearest" = sharp pixels, "linear" = smooth interpolation */
  interpolation?: "nearest" | "linear";
  /** Gamma curve for palette mapping (1.0 = linear, >1 = brighter weak signals, <1 = more contrast). Range 0.3-3.0 */
  gamma?: number;
  /** Pixels per FFT row (1 = normal, 2-4 = stretched). Range 1-4 */
  rowHeight?: number;
  /** CSS mix-blend-mode for passband overlay */
  passbandBlendMode?:
    | "screen"
    | "overlay"
    | "color-dodge"
    | "color-burn"
    | "soft-light"
    | "none";
  /** Passband overlay opacity (0-0.3) */
  passbandOpacity?: number;
  /** Click-to-tune handler (Hz) */
  onPickFrequencyHz?: (hz: number) => void;
  /** Drag-select handler (Hz) */
  onSelectRangeHz?: (range: { startHz: number; endHz: number }) => void;
  /** Wheel-tune handler: +1 = freq up, -1 = freq down */
  onWheelTune?: (direction: number) => void;
  /** Optional high-resolution audio FFT frame (~11.7 Hz/bin). When provided,
   *  pixels within its frequency range are sampled from this frame. */
  audioFrame?: FftFrame | null;
  /** dB floor for the audio frame (default -120). */
  audioMinDb?: number;
  /** dB ceiling for the audio frame (default -20). */
  audioMaxDb?: number;
  overlays?: Array<{
    hz: number;
    label?: string;
    color?: "cyan" | "orange" | "red" | "green";
  }>;
  /** Optional React element rendered as an absolutely positioned overlay on
   *  top of the waterfall canvas (e.g. FT8 decode markers). */
  ft8DecodeOverlay?: React.ReactNode;
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function formatAxisHz(hz: number): string {
  const mhz = hz / 1_000_000;
  if (mhz >= 100) return `${mhz.toFixed(3)} MHz`;
  return `${mhz.toFixed(6)} MHz`;
}

function createProgram(
  gl: WebGL2RenderingContext,
  vsSrc: string,
  fsSrc: string,
): WebGLProgram {
  const vs = gl.createShader(gl.VERTEX_SHADER);
  if (!vs) throw new Error("Failed to create vertex shader");
  gl.shaderSource(vs, vsSrc);
  gl.compileShader(vs);
  if (!gl.getShaderParameter(vs, gl.COMPILE_STATUS)) {
    const msg = gl.getShaderInfoLog(vs) ?? "Unknown shader error";
    gl.deleteShader(vs);
    throw new Error(msg);
  }

  const fs = gl.createShader(gl.FRAGMENT_SHADER);
  if (!fs) throw new Error("Failed to create fragment shader");
  gl.shaderSource(fs, fsSrc);
  gl.compileShader(fs);
  if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
    const msg = gl.getShaderInfoLog(fs) ?? "Unknown shader error";
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    throw new Error(msg);
  }

  const prog = gl.createProgram();
  if (!prog) throw new Error("Failed to create program");
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    const msg = gl.getProgramInfoLog(prog) ?? "Unknown program error";
    gl.deleteProgram(prog);
    throw new Error(msg);
  }
  return prog;
}

export function Waterfall({
  frame,
  view,
  onViewChange,
  className = "",
  minDb = -125,
  maxDb = -40,
  palette = "classic",
  onPickFrequencyHz,
  onSelectRangeHz,
  onWheelTune,
  tuning,
  speed = 1,
  interpolation = "nearest",
  gamma = 1.0,
  rowHeight = 1,
  passbandBlendMode = "screen",
  passbandOpacity = 0.08,
  overlays = [],
  ft8DecodeOverlay,
  audioFrame = null,
  audioMinDb: audioMinDbVal = -120,
  audioMaxDb: audioMaxDbVal = -20,
}: WaterfallProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Local view fallback (span zoom only; center follows frame by default).
  const [internalSpanHz, setInternalSpanHz] = useState<number | null>(null);
  const effectiveView: WaterfallView | null = useMemo(() => {
    if (view) return view;
    if (!frame) return null;
    return {
      centerHz: frame.centerHz,
      spanHz: internalSpanHz ?? frame.spanHz,
    };
  }, [frame, internalSpanHz, view]);

  const lut = useMemo(
    () => getWaterfallPaletteLutWithGamma(palette, gamma),
    [palette, gamma],
  );
  const range = useMemo(() => Math.max(1, maxDb - minDb), [maxDb, minDb]);
  const viewCenterHz = effectiveView?.centerHz;
  const viewSpanHz = effectiveView?.spanHz;

  // Pre-allocated buffers — reallocated only when width changes.
  const normalizedBufRef = useRef<Float32Array | null>(null);
  const rowBufRef = useRef<Uint8Array | null>(null);
  const multiRowBufRef = useRef<Uint8Array | null>(null);

  const rendererRef = useRef<"webgl2" | "2d" | "none">("none");
  const glRef = useRef<WebGL2RenderingContext | null>(null);
  const progRef = useRef<WebGLProgram | null>(null);
  const vaoRef = useRef<WebGLVertexArrayObject | null>(null);
  const texRef = useRef<WebGLTexture | null>(null);
  const headRef = useRef(0);
  const displayHeadRef = useRef(0);
  const lastRenderAtRef = useRef(0);
  const lastUploadAtRef = useRef(0);
  const avgUploadDtMsRef = useRef(1000 / 60);
  const lastUploadLinesRef = useRef(1);
  const renderLoopRafRef = useRef<number | null>(null);
  const texSizeRef = useRef<{ w: number; h: number }>({ w: 0, h: 0 });
  const uniHeadRef = useRef<WebGLUniformLocation | null>(null);
  const uniHeightRef = useRef<WebGLUniformLocation | null>(null);

  const selectionRef = useRef<{
    active: boolean;
    startX: number;
    endX: number;
    pointerId: number | null;
    moved: boolean;
  }>({ active: false, startX: 0, endX: 0, pointerId: null, moved: false });
  const [selection, setSelection] = useState<{
    startX: number;
    endX: number;
    moved: boolean;
  } | null>(null);

  const pinchRef = useRef<{
    active: boolean;
    ids: [number, number] | null;
    startDist: number;
    startSpan: number;
  }>({ active: false, ids: null, startDist: 0, startSpan: 0 });

  const pointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());

  const clearWaterfall = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (rendererRef.current === "webgl2") {
      const gl = glRef.current;
      const tex = texRef.current;
      if (!gl || !tex) return;
      const { w, h } = texSizeRef.current;
      if (w <= 0 || h <= 0) return;
      const empty = new Uint8Array(w * h * 4);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        w,
        h,
        0,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        empty,
      );
      headRef.current = 0;
      displayHeadRef.current = 0;
      lastRenderAtRef.current = 0;
      lastUploadAtRef.current = 0;
      return;
    }

    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return;
    ctx.fillStyle = "black";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }, []);

  // Setup renderer + resize handling.
  useEffect(() => {
    const el = containerRef.current;
    const canvas = canvasRef.current;
    if (!el || !canvas) return;

    let gl: WebGL2RenderingContext | null = null;
    try {
      gl = canvas.getContext("webgl2", {
        alpha: false,
        antialias: false,
        premultipliedAlpha: false,
        preserveDrawingBuffer: false,
      });
    } catch {
      gl = null;
    }

    if (gl) {
      rendererRef.current = "webgl2";
      glRef.current = gl;
    } else {
      rendererRef.current = "2d";
      glRef.current = null;
    }

    const dpr = Math.max(1, window.devicePixelRatio || 1);

    const initGl = (w: number, h: number) => {
      if (!gl) return;

      if (!progRef.current) {
        const prog = createProgram(
          gl,
          `#version 300 es
          in vec2 a_pos;
          out vec2 v_uv;
          void main() {
            v_uv = vec2((a_pos.x + 1.0) * 0.5, 1.0 - (a_pos.y + 1.0) * 0.5);
            gl_Position = vec4(a_pos, 0.0, 1.0);
          }`,
          `#version 300 es
          precision highp float;
          uniform sampler2D u_tex;
          uniform float u_head;
          uniform float u_height;
          in vec2 v_uv;
          out vec4 outColor;
          void main() {
            float row = floor(v_uv.y * u_height);
            // Sample between adjacent rows when u_head is fractional.
            float y = mod((u_head - 1.0 - row) + u_height, u_height);
            float y0 = floor(y);
            float f = fract(y);
            float y1 = mod(y0 + 1.0, u_height);
            vec2 uv0 = vec2(v_uv.x, (y0 + 0.5) / u_height);
            vec2 uv1 = vec2(v_uv.x, (y1 + 0.5) / u_height);
            outColor = mix(texture(u_tex, uv0), texture(u_tex, uv1), f);
          }`,
        );
        progRef.current = prog;
        gl.useProgram(prog);
        uniHeadRef.current = gl.getUniformLocation(prog, "u_head");
        uniHeightRef.current = gl.getUniformLocation(prog, "u_height");

        const vao = gl.createVertexArray();
        vaoRef.current = vao;
        gl.bindVertexArray(vao);

        const buf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.bufferData(
          gl.ARRAY_BUFFER,
          new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
          gl.STATIC_DRAW,
        );

        const loc = gl.getAttribLocation(prog, "a_pos");
        gl.enableVertexAttribArray(loc);
        gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

        const tex = gl.createTexture();
        texRef.current = tex;
        gl.bindTexture(gl.TEXTURE_2D, tex);
        const glFilter = interpolation === "linear" ? gl.LINEAR : gl.NEAREST;
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, glFilter);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, glFilter);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
      }

      gl.viewport(0, 0, w, h);

      if (
        texRef.current &&
        (texSizeRef.current.w !== w || texSizeRef.current.h !== h)
      ) {
        texSizeRef.current = { w, h };
        headRef.current = 0;
        displayHeadRef.current = 0;
        lastRenderAtRef.current = 0;
        lastUploadAtRef.current = 0;
        gl.bindTexture(gl.TEXTURE_2D, texRef.current);
        gl.texImage2D(
          gl.TEXTURE_2D,
          0,
          gl.RGBA,
          w,
          h,
          0,
          gl.RGBA,
          gl.UNSIGNED_BYTE,
          new Uint8Array(w * h * 4),
        );
      }
    };

    const resize = () => {
      const rect = el.getBoundingClientRect();
      const w = Math.max(1, Math.floor(rect.width * dpr));
      const h = Math.max(1, Math.floor(rect.height * dpr));
      if (canvas.width === w && canvas.height === h) return;
      canvas.width = w;
      canvas.height = h;

      if (gl) {
        initGl(w, h);
        return;
      }
      const ctx = canvas.getContext("2d", { alpha: false });
      if (!ctx) return;
      ctx.fillStyle = "black";
      ctx.fillRect(0, 0, w, h);
    };

    const ro = new ResizeObserver(resize);
    ro.observe(el);
    resize();

    // StrictMode fix: if resize() skipped because canvas size was already set
    // from a prior mount, ensure WebGL resources are still initialized.
    if (gl && !progRef.current) {
      initGl(canvas.width, canvas.height);
    }

    return () => {
      ro.disconnect();
      if (renderLoopRafRef.current !== null) {
        cancelAnimationFrame(renderLoopRafRef.current);
        renderLoopRafRef.current = null;
      }
      const g = glRef.current;
      if (g) {
        if (texRef.current) g.deleteTexture(texRef.current);
        if (vaoRef.current) g.deleteVertexArray(vaoRef.current);
        if (progRef.current) g.deleteProgram(progRef.current);
      }
      progRef.current = null;
      vaoRef.current = null;
      texRef.current = null;
      glRef.current = null;
    };
    // Re-init WebGL when interpolation changes (texture filter parameters).
  }, [interpolation]);

  // Render loop for WebGL2: draw every vsync and animate head towards new rows.
  useEffect(() => {
    if (rendererRef.current !== "webgl2") return;

    const loop = (t: number) => {
      const gl = glRef.current;
      const prog = progRef.current;
      const vao = vaoRef.current;
      const tex = texRef.current;
      const uniHead = uniHeadRef.current;
      const uniHeight = uniHeightRef.current;
      const height = texSizeRef.current.h;

      if (
        gl &&
        prog &&
        vao &&
        tex &&
        uniHead &&
        uniHeight &&
        height > 0 &&
        canvasRef.current
      ) {
        const lastRenderAt = lastRenderAtRef.current || t;
        const dt = Math.max(0, t - lastRenderAt);
        lastRenderAtRef.current = t;

        const target = headRef.current;
        const avgDt = Math.max(1, avgUploadDtMsRef.current);
        const lines = Math.max(1, lastUploadLinesRef.current);
        const maxStep = (dt / avgDt) * lines;

        const cur = displayHeadRef.current;
        const next = Math.min(target, cur + maxStep);
        displayHeadRef.current = next;

        gl.useProgram(prog);
        gl.bindVertexArray(vao);
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.uniform1f(uniHead, next);
        gl.uniform1f(uniHeight, height);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      }

      renderLoopRafRef.current = requestAnimationFrame(loop);
    };

    if (renderLoopRafRef.current !== null) {
      cancelAnimationFrame(renderLoopRafRef.current);
    }
    renderLoopRafRef.current = requestAnimationFrame(loop);

    return () => {
      if (renderLoopRafRef.current !== null) {
        cancelAnimationFrame(renderLoopRafRef.current);
        renderLoopRafRef.current = null;
      }
    };
  }, [interpolation]);

  // Clear the waterfall when view span changes (zoom).
  useEffect(() => {
    if (viewCenterHz === undefined || viewSpanHz === undefined) return;
    clearWaterfall();
  }, [clearWaterfall, viewCenterHz, viewSpanHz]);

  const setSpanHz = useCallback(
    (spanHz: number) => {
      if (!frame) return;
      const next = clamp(
        spanHz,
        Math.max(10_000, frame.spanHz / 128),
        frame.spanHz,
      );
      if (view && onViewChange) {
        onViewChange({ centerHz: view.centerHz, spanHz: next });
        return;
      }
      setInternalSpanHz(next);
      onViewChange?.({ centerHz: frame.centerHz, spanHz: next });
    },
    [frame, onViewChange, view],
  );

  // Render + append new FFT line.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !frame || !effectiveView) return;

    const width = canvas.width;
    const height = canvas.height;
    if (width < 2 || height < 2) return;

    const bins = frame.bins;
    if (bins.length === 0) return;

    const rafId = requestAnimationFrame(() => {
      const startFrame = frame.centerHz - frame.spanHz / 2;
      const viewStart = effectiveView.centerHz - effectiveView.spanHz / 2;
      const viewSpan = effectiveView.spanHz;

      // ── Shared crossfade params ──────────────────────────────────────
      const audioBins = audioFrame?.bins ?? null;
      const audioFullStart = audioFrame
        ? audioFrame.centerHz - audioFrame.spanHz / 2
        : 0;
      const audioRangeVal = Math.max(1, audioMaxDbVal - audioMinDbVal);
      const pb = tuning && audioBins ? computePassbandHz(tuning) : null;

      const crossfadeParams = {
        civBins: bins,
        civStartHz: startFrame,
        civSpanHz: frame.spanHz,
        civMinDb: minDb,
        civRange: range,
        audioBins: audioBins as Float32Array | null,
        audioStartHz: audioFullStart,
        audioSpanHz: audioFrame?.spanHz ?? 1,
        audioMinDb: audioMinDbVal,
        audioRange: audioRangeVal,
        passbandStartHz: pb ? pb.startHz : 0,
        passbandEndHz: pb ? pb.endHz : 0,
        fadeHz: 200,
        civInterpolation: "nearest" as const,
      };

      // ── Ensure pre-allocated buffers match current width ─────────
      if (
        !normalizedBufRef.current ||
        normalizedBufRef.current.length !== width
      ) {
        normalizedBufRef.current = new Float32Array(width);
      }
      if (!rowBufRef.current || rowBufRef.current.length !== width * 4) {
        rowBufRef.current = new Uint8Array(width * 4);
      }
      const normalized = normalizedBufRef.current;
      const row = rowBufRef.current;

      // ── Fill normalized values using shared cross-fade utility ────
      fillFftCrossfade(normalized, viewStart, viewSpan, crossfadeParams);

      // ── Map normalized values to RGBA via gamma-baked LUT ────────
      for (let x = 0; x < width; x++) {
        const lutIdx = Math.round(normalized[x]! * 255);
        const i = x * 4;
        row[i] = lut[lutIdx * 3]!;
        row[i + 1] = lut[lutIdx * 3 + 1]!;
        row[i + 2] = lut[lutIdx * 3 + 2]!;
        row[i + 3] = 255;
      }

      if (
        rendererRef.current === "webgl2" &&
        glRef.current &&
        progRef.current &&
        texRef.current
      ) {
        const gl = glRef.current;
        const tex = texRef.current;

        const lines =
          Math.max(1, Math.round(speed)) * Math.max(1, Math.round(rowHeight));

        const now = performance.now();
        const lastAt = lastUploadAtRef.current;
        if (lastAt > 0) {
          const dt = Math.max(1, now - lastAt);
          // EMA to handle occasional frame stalls without jittering the estimate.
          avgUploadDtMsRef.current = avgUploadDtMsRef.current * 0.85 + dt * 0.15;
        }
        lastUploadAtRef.current = now;
        lastUploadLinesRef.current = lines;

        gl.bindTexture(gl.TEXTURE_2D, tex);

        if (lines === 1) {
          // Single row — upload directly
          const head = headRef.current % height;
          gl.texSubImage2D(
            gl.TEXTURE_2D,
            0,
            0,
            head,
            width,
            1,
            gl.RGBA,
            gl.UNSIGNED_BYTE,
            row,
          );
          headRef.current = (headRef.current + 1) % height;
        } else {
          // Multi-row: build a single buffer with `lines` copies, upload in
          // contiguous chunks to minimize texSubImage2D calls.
          const multiSize = width * 4 * lines;
          if (
            !multiRowBufRef.current ||
            multiRowBufRef.current.length !== multiSize
          ) {
            multiRowBufRef.current = new Uint8Array(multiSize);
          }
          const multi = multiRowBufRef.current;
          for (let n = 0; n < lines; n++) {
            multi.set(row, n * width * 4);
          }

          // Upload contiguous chunks, wrapping around texture height boundary
          let remaining = lines;
          while (remaining > 0) {
            const head = headRef.current % height;
            const maxRows = Math.min(remaining, height - head);
            gl.texSubImage2D(
              gl.TEXTURE_2D,
              0,
              0,
              head,
              width,
              maxRows,
              gl.RGBA,
              gl.UNSIGNED_BYTE,
              new Uint8Array(
                multi.buffer,
                (lines - remaining) * width * 4,
                maxRows * width * 4,
              ),
            );
            headRef.current = (headRef.current + maxRows) % height;
            remaining -= maxRows;
          }
        }
        return; // Draw happens in the render loop (vsync-aligned).
      }

      const ctx = canvas.getContext("2d", { alpha: false });
      if (!ctx) return;

      // Canvas2D fallback: scroll and paint the newest row(s).
      const lines =
        Math.max(1, Math.round(speed)) * Math.max(1, Math.round(rowHeight));
      ctx.drawImage(canvas, 0, lines);

      const imgData = ctx.createImageData(width, 1);
      const data = imgData.data;
      for (let x = 0; x < width; x++) {
        const i = x * 4;
        data[i] = row[i]!;
        data[i + 1] = row[i + 1]!;
        data[i + 2] = row[i + 2]!;
        data[i + 3] = 255;
      }
      for (let n = 0; n < lines; n++) {
        ctx.putImageData(imgData, 0, n);
      }
    });
    return () => cancelAnimationFrame(rafId);
  }, [
    effectiveView,
    frame,
    lut,
    minDb,
    range,
    rowHeight,
    speed,
    audioFrame,
    audioMinDbVal,
    audioMaxDbVal,
    tuning,
  ]);

  const tuningPositions = useMemo(() => {
    if (!tuning || !effectiveView) return null;
    const start = effectiveView.centerHz - effectiveView.spanHz / 2;
    const span = effectiveView.spanHz;

    const vfoT = (tuning.freqHz - start) / span;
    if (vfoT < -0.1 || vfoT > 1.1) return null;

    const passband = computePassbandHz(tuning);
    const pbStartT = (passband.startHz - start) / span;
    const pbEndT = (passband.endHz - start) / span;

    const clampedStart = Math.max(0, pbStartT);
    const clampedEnd = Math.min(1, pbEndT);

    return {
      vfoPercent: clamp(vfoT, 0, 1) * 100,
      pbLeftPercent: clampedStart * 100,
      pbWidthPercent: Math.max(0, (clampedEnd - clampedStart) * 100),
      visible: vfoT >= 0 && vfoT <= 1,
    };
  }, [effectiveView, tuning]);

  const overlayPositions = useMemo(() => {
    if (!effectiveView) return [];
    const start = effectiveView.centerHz - effectiveView.spanHz / 2;
    return overlays
      .filter((o) => Number.isFinite(o.hz))
      .map((o) => ({
        ...o,
        t: (o.hz - start) / effectiveView.spanHz,
      }))
      .filter((o) => o.t >= 0 && o.t <= 1);
  }, [effectiveView, overlays]);

  const axis = useMemo(() => {
    if (!effectiveView) return null;
    const start = effectiveView.centerHz - effectiveView.spanHz / 2;
    const end = effectiveView.centerHz + effectiveView.spanHz / 2;
    return {
      start,
      center: effectiveView.centerHz,
      end,
    };
  }, [effectiveView]);

  // Native wheel handler with { passive: false } so preventDefault() works.
  // React attaches wheel listeners as passive by default (Chrome 73+), which
  // silently ignores preventDefault and spams console warnings.
  const wheelHandlerRef = useRef<((e: WheelEvent) => void) | null>(null);

  wheelHandlerRef.current = useCallback(
    (e: WheelEvent) => {
      if (!frame) return;
      e.preventDefault();

      // Ctrl/Cmd+wheel → zoom; plain wheel → tune
      if (e.ctrlKey || e.metaKey) {
        const delta =
          Math.sign(e.deltaY) * Math.min(1, Math.abs(e.deltaY) / 500);
        const factor = 1 + delta * 0.25;
        const currentSpan = effectiveView?.spanHz ?? frame.spanHz;
        setSpanHz(currentSpan * factor);
      } else if (onWheelTune) {
        const direction = e.deltaY < 0 ? 1 : e.deltaY > 0 ? -1 : 0;
        if (direction !== 0) onWheelTune(direction);
      }
    },
    [effectiveView?.spanHz, frame, onWheelTune, setSpanHz],
  );

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => wheelHandlerRef.current?.(e);
    el.addEventListener("wheel", handler, { passive: false });
    return () => el.removeEventListener("wheel", handler);
  }, []);

  const updatePointer = (id: number, x: number, y: number) => {
    const m = pointersRef.current;
    m.set(id, { x, y });
  };

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!frame || !effectiveView) return;
      const el = containerRef.current;
      if (!el) return;
      el.setPointerCapture(e.pointerId);
      updatePointer(e.pointerId, e.clientX, e.clientY);

      const pointers = pointersRef.current;
      if (pointers.size === 2) {
        const [a, b] = Array.from(pointers.entries());
        if (!a || !b) return;
        const dx = a[1].x - b[1].x;
        const dy = a[1].y - b[1].y;
        pinchRef.current = {
          active: true,
          ids: [a[0], b[0]],
          startDist: Math.hypot(dx, dy),
          startSpan: effectiveView.spanHz,
        };
        selectionRef.current.active = false;
        setSelection(null);
        return;
      }

      pinchRef.current.active = false;
      selectionRef.current = {
        active: true,
        startX: e.clientX,
        endX: e.clientX,
        pointerId: e.pointerId,
        moved: false,
      };
      setSelection({ startX: e.clientX, endX: e.clientX, moved: false });
    },
    [effectiveView, frame],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!frame || !effectiveView) return;
      updatePointer(e.pointerId, e.clientX, e.clientY);

      const el = containerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const w = rect.width;
      if (w <= 0) return;

      const pinch = pinchRef.current;
      if (pinch.active && pinch.ids) {
        const a = pointersRef.current.get(pinch.ids[0]);
        const b = pointersRef.current.get(pinch.ids[1]);
        if (!a || !b) return;
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        if (dist <= 0 || pinch.startDist <= 0) return;
        const scale = pinch.startDist / dist;
        setSpanHz(pinch.startSpan * scale);
        return;
      }

      const sel = selectionRef.current;
      if (!sel.active || sel.pointerId !== e.pointerId) return;
      sel.endX = e.clientX;
      sel.moved = sel.moved || Math.abs(sel.endX - sel.startX) > 4;
      setSelection({ startX: sel.startX, endX: sel.endX, moved: sel.moved });
    },
    [effectiveView, frame, setSpanHz],
  );

  const endSelection = useCallback(
    (e: React.PointerEvent) => {
      const el = containerRef.current;
      if (!el) return;
      try {
        el.releasePointerCapture(e.pointerId);
      } catch {
        // ignore
      }

      pointersRef.current.delete(e.pointerId);
      if (pointersRef.current.size < 2) {
        pinchRef.current.active = false;
        pinchRef.current.ids = null;
      }

      const sel = selectionRef.current;
      if (!sel.active || sel.pointerId !== e.pointerId) return;
      sel.active = false;
      setSelection(null);

      if (!frame || !effectiveView) return;
      const rect = el.getBoundingClientRect();
      if (rect.width <= 0) return;

      const x0 = (sel.startX - rect.left) / rect.width;
      const x1 = (sel.endX - rect.left) / rect.width;
      const start = effectiveView.centerHz - effectiveView.spanHz / 2;
      const hz0 = start + clamp(x0, 0, 1) * effectiveView.spanHz;
      const hz1 = start + clamp(x1, 0, 1) * effectiveView.spanHz;

      if (!sel.moved) {
        onPickFrequencyHz?.(Math.round(hz0));
        return;
      }

      const a = Math.min(hz0, hz1);
      const b = Math.max(hz0, hz1);
      onSelectRangeHz?.({ startHz: Math.round(a), endHz: Math.round(b) });
    },
    [effectiveView, frame, onPickFrequencyHz, onSelectRangeHz],
  );

  const selectionOverlay = useMemo(() => {
    const el = containerRef.current;
    const sel = selection;
    if (!el || !sel) return null;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0) return null;
    const x0 = clamp((sel.startX - rect.left) / rect.width, 0, 1);
    const x1 = clamp((sel.endX - rect.left) / rect.width, 0, 1);
    const left = Math.min(x0, x1) * 100;
    const width = Math.abs(x1 - x0) * 100;
    return { left, width };
  }, [selection]);

  return (
    <div
      ref={containerRef}
      className={`w-full h-full relative select-none ${className}`}
      style={{ touchAction: "none" }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endSelection}
      onPointerCancel={endSelection}
    >
      <canvas
        ref={canvasRef}
        className="w-full h-full rounded-lg border border-white/10 bg-black"
      />

      {axis ? (
        <div className="absolute left-2 right-2 bottom-1 pointer-events-none flex justify-between text-[10px] text-gray-300 font-mono">
          <span>{formatAxisHz(axis.start)}</span>
          <span className="text-gray-200">{formatAxisHz(axis.center)}</span>
          <span>{formatAxisHz(axis.end)}</span>
        </div>
      ) : null}

      {tuningPositions && tuningPositions.pbWidthPercent > 0 ? (
        <div
          className="absolute top-0 bottom-0 pointer-events-none"
          style={{
            left: `${tuningPositions.pbLeftPercent}%`,
            width: `${tuningPositions.pbWidthPercent}%`,
          }}
        >
          {/* Blend-mode passband emphasis */}
          {passbandBlendMode !== "none" && (
            <div
              className="absolute inset-0"
              style={{
                mixBlendMode:
                  passbandBlendMode as React.CSSProperties["mixBlendMode"],
                backgroundColor: `rgba(255, 255, 255, ${passbandOpacity})`,
              }}
            />
          )}
          {/* Thin left edge line */}
          <div className="absolute left-0 top-0 bottom-0 w-px bg-white/25" />
          {/* Thin right edge line */}
          <div className="absolute right-0 top-0 bottom-0 w-px bg-white/25" />
        </div>
      ) : null}

      {selectionOverlay ? (
        <div
          className="absolute top-0 bottom-0 pointer-events-none"
          style={{
            left: `${selectionOverlay.left}%`,
            width: `${selectionOverlay.width}%`,
          }}
        >
          <div className="w-full h-full bg-cosmic-cyan/10 border border-cosmic-cyan/30" />
        </div>
      ) : null}

      {effectiveView &&
        overlayPositions.map((o, idx) => {
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
              style={{ left: `${o.t * 100}%` }}
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

      {ft8DecodeOverlay ?? null}
    </div>
  );
}

export default Waterfall;
