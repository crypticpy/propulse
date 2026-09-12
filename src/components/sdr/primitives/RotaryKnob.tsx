/**
 * RotaryKnob — FabFilter-style SVG rotary knob for parametric EQ controls.
 *
 * Pure presentational component. 270-degree arc with pointer-drag interaction,
 * optional log scale, and customizable accent color.
 */

import { useCallback, useRef } from "react";

// ─── Props ───────────────────────────────────────────────────────────────────

export interface RotaryKnobProps {
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  label: string;
  formatValue?: (value: number) => string;
  scale?: "linear" | "log";
  size?: number;
  accentColor?: string;
  disabled?: boolean;
  sensitivity?: number;
}

// ─── Scale helpers ───────────────────────────────────────────────────────────

function normalize(
  value: number,
  min: number,
  max: number,
  scale: "linear" | "log",
): number {
  if (scale === "log") {
    const logMin = Math.log10(Math.max(min, 0.001));
    const logMax = Math.log10(max);
    return (Math.log10(Math.max(value, 0.001)) - logMin) / (logMax - logMin);
  }
  return (value - min) / (max - min);
}

function denormalize(
  norm: number,
  min: number,
  max: number,
  scale: "linear" | "log",
): number {
  if (scale === "log") {
    const logMin = Math.log10(Math.max(min, 0.001));
    const logMax = Math.log10(max);
    return Math.pow(10, logMin + norm * (logMax - logMin));
  }
  return min + norm * (max - min);
}

// ─── Arc constants ───────────────────────────────────────────────────────────

const ARC_DEGREES = 270;
const START_ANGLE = 135; // clockwise from 12-o'clock
const STROKE_WIDTH = 3;

// ─── Component ───────────────────────────────────────────────────────────────

export function RotaryKnob({
  value,
  min,
  max,
  onChange,
  label,
  formatValue,
  scale = "linear",
  size = 48,
  accentColor = "#00dcff",
  disabled = false,
  sensitivity = 200,
}: RotaryKnobProps) {
  const dragRef = useRef<{ startY: number; startNorm: number } | null>(null);

  const norm = normalize(value, min, max, scale);
  const half = size / 2;
  const radius = (size - STROKE_WIDTH * 2) / 2;
  const circumference = 2 * Math.PI * radius;
  const arcLength = (ARC_DEGREES / 360) * circumference;
  const gapOffset = -((360 - ARC_DEGREES) / 2 / 360) * circumference;

  // Dot indicator position (angle in radians, clockwise from top)
  const dotAngle = ((START_ANGLE + norm * ARC_DEGREES) * Math.PI) / 180;
  const dotX = half + radius * Math.sin(dotAngle);
  const dotY = half - radius * Math.cos(dotAngle);

  const displayValue = formatValue
    ? formatValue(value)
    : String(Math.round(value));

  // ── Pointer handlers ──

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (disabled) return;
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      dragRef.current = { startY: e.clientY, startNorm: norm };
    },
    [disabled, norm],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      const delta = (drag.startY - e.clientY) / sensitivity;
      const clamped = Math.max(0, Math.min(1, drag.startNorm + delta));
      onChange(denormalize(clamped, min, max, scale));
    },
    [sensitivity, onChange, min, max, scale],
  );

  // Ends the drag for both pointerup and pointercancel (touch interruption).
  // Capture may already be released on cancel, so guard the release.
  const endDrag = useCallback((e: React.PointerEvent) => {
    const el = e.target as HTMLElement;
    if (el.hasPointerCapture(e.pointerId)) {
      el.releasePointerCapture(e.pointerId);
    }
    dragRef.current = null;
  }, []);

  return (
    <div
      className="flex flex-col items-center select-none"
      style={{
        opacity: disabled ? 0.4 : 1,
        cursor: disabled ? "default" : "grab",
        touchAction: "none",
      }}
    >
      <div
        className="relative aspect-square text-xs font-mono"
        style={{ width: size, minWidth: `${displayValue.length + 2}ch` }}
      >
        <svg
          width="100%"
          height="100%"
          viewBox={`0 0 ${size} ${size}`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          style={{
            cursor: disabled ? "default" : dragRef.current ? "grabbing" : "grab",
          }}
        >
          {/* Background track */}
          <circle
            cx={half}
            cy={half}
            r={radius}
            fill="none"
            stroke="rgba(255,255,255,0.08)"
            strokeWidth={STROKE_WIDTH}
            strokeDasharray={`${arcLength} ${circumference}`}
            strokeDashoffset={gapOffset}
            transform={`rotate(${START_ANGLE} ${half} ${half})`}
            strokeLinecap="round"
          />
          {/* Value arc */}
          <circle
            cx={half}
            cy={half}
            r={radius}
            fill="none"
            stroke={accentColor}
            strokeWidth={STROKE_WIDTH}
            strokeDasharray={`${arcLength * norm} ${circumference}`}
            strokeDashoffset={gapOffset}
            transform={`rotate(${START_ANGLE} ${half} ${half})`}
            strokeLinecap="round"
          />
          {/* Dot indicator */}
          <circle cx={dotX} cy={dotY} r={2.5} fill={accentColor} />
        </svg>
        <span className="pointer-events-none absolute inset-0 flex items-center justify-center whitespace-nowrap text-su-text">
          {displayValue}
        </span>
      </div>
      <span className="text-xs text-su-muted uppercase tracking-wider">
        {label}
      </span>
    </div>
  );
}
