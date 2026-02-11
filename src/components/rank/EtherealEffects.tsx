/**
 * EtherealEffects -- Visual effects for Ethereal-tier equipment cards.
 *
 * Contains four sub-components:
 *   1. ChromaticBorderOverlay -- Living chromatic border with aurora color shifts
 *   2. RuneCorners            -- Abstract ham-radio-inspired geometric glyphs
 *   3. DimensionalRift        -- Dark portal center with chromatic edge energy
 *   4. LivingSymbols          -- Animated stroke-dasharray "current flow" on SVGs
 *
 * These replace Legendary-tier elements: rune corners replace filigree;
 * chromatic border replaces the single-color energy border.
 *
 * CSS-only animations. No Canvas, no WebGL. Uses the ensureStyles pattern
 * for keyframe injection shared with the other rank effect components.
 */

import { useEffect, type ReactNode } from "react";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Aurora palette used across all Ethereal effects */
const AURORA_PALETTE = ["#38BDF8", "#34D399", "#A78BFA", "#F472B6"] as const;

// ---------------------------------------------------------------------------
// Style injection (ensureStyles pattern)
// ---------------------------------------------------------------------------

const STYLE_ID = "ethereal-effects-styles";

function ensureStyles() {
  if (typeof document === "undefined") return;
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
@keyframes chromaticShift {
  from { transform: rotate(0deg); }
  to   { transform: rotate(360deg); }
}
@keyframes chromaticBreathe {
  0%, 100% {
    box-shadow:
      0 0 12px var(--ethereal-c1, #38BDF8)30,
      0 0 24px var(--ethereal-c2, #A78BFA)18,
      inset 0 0 16px var(--ethereal-c3, #34D399)10;
  }
  50% {
    box-shadow:
      0 0 20px var(--ethereal-c1, #38BDF8)40,
      0 0 40px var(--ethereal-c2, #A78BFA)25,
      inset 0 0 24px var(--ethereal-c3, #34D399)18;
  }
}
@keyframes runePulse {
  0%, 100% { opacity: 0.5; }
  50%      { opacity: 1; }
}
@keyframes dimensionalPulse {
  0%, 100% {
    opacity: 0.8;
    transform: scale(1);
  }
  50% {
    opacity: 1;
    transform: scale(1.02);
  }
}
@keyframes livingSymbolFlow {
  0%   { stroke-dashoffset: 100; }
  100% { stroke-dashoffset: 0; }
}
@media (prefers-reduced-motion: reduce) {
  .ethereal-chromatic-spin {
    animation: none !important;
  }
  .ethereal-border-breathe {
    animation: none !important;
  }
  .ethereal-rune-pulse {
    animation: none !important;
    opacity: 0.75 !important;
  }
  .ethereal-dimensional-pulse {
    animation: none !important;
    opacity: 0.85 !important;
  }
  .ethereal-living-symbol {
    animation: none !important;
  }
  .ethereal-living-symbol-copy {
    display: none !important;
  }
}`;
  document.head.appendChild(style);
}

// ---------------------------------------------------------------------------
// 1. ChromaticBorderOverlay
// ---------------------------------------------------------------------------

export interface ChromaticBorderOverlayProps {
  enabled: boolean;
  className?: string;
}

/**
 * A living chromatic border that continuously shifts through an aurora palette.
 *
 * Uses a multi-stop conic-gradient that rotates over 12 seconds,
 * with a complementary inner box-shadow that "breathes" at a different rate.
 * The interior is masked out so only the border region is visible.
 */
export function ChromaticBorderOverlay({
  enabled,
  className = "",
}: ChromaticBorderOverlayProps) {
  useEffect(() => {
    if (enabled) ensureStyles();
  }, [enabled]);

  if (!enabled) return null;

  const [c1, c2, c3, c4] = AURORA_PALETTE;

  return (
    <div
      className={`absolute inset-[-2px] rounded-[inherit] overflow-hidden pointer-events-none z-10 ${className}`}
      aria-hidden="true"
    >
      {/* Primary rotating chromatic gradient */}
      <div
        className="absolute inset-[-50%] ethereal-chromatic-spin"
        style={{
          background: [
            "conic-gradient(",
            `from 0deg,`,
            `${c1}90 0%,`,
            `${c2}70 25%,`,
            `${c3}90 50%,`,
            `${c4}70 75%,`,
            `${c1}90 100%)`,
          ].join(" "),
          animation: "chromaticShift 12s linear infinite",
        }}
      />

      {/* Secondary counter-rotating gradient for depth */}
      <div
        className="absolute inset-[-50%] ethereal-chromatic-spin"
        style={{
          background: [
            "conic-gradient(",
            `from 180deg,`,
            `${c3}30 0%,`,
            `${c1}20 25%,`,
            `${c4}30 50%,`,
            `${c2}20 75%,`,
            `${c3}30 100%)`,
          ].join(" "),
          animation: "chromaticShift 8s linear infinite reverse",
          mixBlendMode: "screen",
        }}
      />

      {/* Inner mask to reveal only the border */}
      <div
        className="absolute rounded-[inherit]"
        style={{
          inset: "3px",
          background: "var(--card-bg, #0f1420)",
        }}
      />

      {/* Breathing box-shadow inner border */}
      <div
        className="absolute inset-0 rounded-[inherit] ethereal-border-breathe"
        style={
          {
            "--ethereal-c1": c1,
            "--ethereal-c2": c3,
            "--ethereal-c3": c2,
            animation: "chromaticBreathe 6s ease-in-out infinite",
          } as React.CSSProperties
        }
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// 2. RuneCorners
// ---------------------------------------------------------------------------

export interface RuneCornersProps {
  enabled: boolean;
  className?: string;
}

/**
 * Antenna symbol — vertical line with horizontal elements.
 */
function AntennaRune({ color }: { color: string }) {
  return (
    <svg
      width={20}
      height={20}
      viewBox="0 0 20 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      {/* Vertical mast */}
      <line x1={10} y1={2} x2={10} y2={18} stroke={color} strokeWidth={1.2} />
      {/* Top element pair */}
      <line x1={6} y1={5} x2={14} y2={5} stroke={color} strokeWidth={0.8} />
      {/* Mid element pair */}
      <line x1={7} y1={9} x2={13} y2={9} stroke={color} strokeWidth={0.8} />
      {/* Lower element */}
      <line
        x1={8}
        y1={13}
        x2={12}
        y2={13}
        stroke={color}
        strokeWidth={0.6}
        opacity={0.7}
      />
      {/* Radiating nodes */}
      <circle cx={6} cy={5} r={1} fill={color} opacity={0.6} />
      <circle cx={14} cy={5} r={1} fill={color} opacity={0.6} />
    </svg>
  );
}

/**
 * Wave/signal symbol — sine wave pattern.
 */
function WaveRune({ color }: { color: string }) {
  return (
    <svg
      width={20}
      height={20}
      viewBox="0 0 20 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      {/* Sine wave */}
      <path
        d="M2 10C4 6 6 6 8 10C10 14 12 14 14 10C16 6 18 6 18 10"
        stroke={color}
        strokeWidth={1.2}
        strokeLinecap="round"
        fill="none"
      />
      {/* Smaller echo wave */}
      <path
        d="M4 10C5.5 7.5 7 7.5 8.5 10C10 12.5 11.5 12.5 13 10C14.5 7.5 16 7.5 16 10"
        stroke={color}
        strokeWidth={0.6}
        strokeLinecap="round"
        fill="none"
        opacity={0.4}
      />
    </svg>
  );
}

/**
 * Ground symbol — horizontal lines tapering down.
 */
function GroundRune({ color }: { color: string }) {
  return (
    <svg
      width={20}
      height={20}
      viewBox="0 0 20 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      {/* Vertical stub */}
      <line x1={10} y1={3} x2={10} y2={8} stroke={color} strokeWidth={1.2} />
      {/* Ground bars (tapering) */}
      <line x1={4} y1={8} x2={16} y2={8} stroke={color} strokeWidth={1.2} />
      <line x1={6} y1={11} x2={14} y2={11} stroke={color} strokeWidth={1} />
      <line
        x1={7.5}
        y1={14}
        x2={12.5}
        y2={14}
        stroke={color}
        strokeWidth={0.8}
      />
      <line
        x1={9}
        y1={17}
        x2={11}
        y2={17}
        stroke={color}
        strokeWidth={0.6}
        opacity={0.6}
      />
    </svg>
  );
}

/**
 * Key/telegraph symbol — dot-dash (Morse) pattern.
 */
function TelegraphRune({ color }: { color: string }) {
  return (
    <svg
      width={20}
      height={20}
      viewBox="0 0 20 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      {/* Dot */}
      <circle cx={4} cy={6} r={1.5} fill={color} />
      {/* Dash */}
      <line
        x1={8}
        y1={6}
        x2={16}
        y2={6}
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
      />
      {/* Dash */}
      <line
        x1={2}
        y1={11}
        x2={10}
        y2={11}
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
      />
      {/* Dot */}
      <circle cx={14} cy={11} r={1.5} fill={color} />
      {/* Dot */}
      <circle cx={6} cy={16} r={1.5} fill={color} />
      {/* Dot */}
      <circle cx={10} cy={16} r={1.5} fill={color} opacity={0.6} />
    </svg>
  );
}

/** Corner definitions: position classes, SVG component, aurora color index, pulse duration */
const RUNE_CORNERS: {
  className: string;
  scaleX: number;
  scaleY: number;
  Rune: React.ComponentType<{ color: string }>;
  colorIndex: number;
  duration: number;
}[] = [
  {
    className: "top-1.5 left-1.5",
    scaleX: 1,
    scaleY: 1,
    Rune: AntennaRune,
    colorIndex: 0,
    duration: 2.5,
  },
  {
    className: "top-1.5 right-1.5",
    scaleX: -1,
    scaleY: 1,
    Rune: WaveRune,
    colorIndex: 1,
    duration: 3,
  },
  {
    className: "bottom-1.5 left-1.5",
    scaleX: 1,
    scaleY: -1,
    Rune: GroundRune,
    colorIndex: 2,
    duration: 3.5,
  },
  {
    className: "bottom-1.5 right-1.5",
    scaleX: -1,
    scaleY: -1,
    Rune: TelegraphRune,
    colorIndex: 3,
    duration: 4,
  },
];

/**
 * Four abstract geometric corner glyphs inspired by ham radio symbols.
 * Each pulses independently with a different phase offset and cycles
 * through the aurora palette, creating a "living circuit" feel.
 */
export function RuneCorners({ enabled, className = "" }: RuneCornersProps) {
  useEffect(() => {
    if (enabled) ensureStyles();
  }, [enabled]);

  if (!enabled) return null;

  return (
    <div
      className={`absolute inset-0 pointer-events-none z-[2] ${className}`}
      aria-hidden="true"
    >
      {RUNE_CORNERS.map((corner, i) => {
        const color = AURORA_PALETTE[corner.colorIndex];
        return (
          <div
            key={i}
            className={`absolute ${corner.className} ethereal-rune-pulse`}
            style={{
              transform: `scale(${corner.scaleX}, ${corner.scaleY})`,
              animation: `runePulse ${corner.duration}s ease-in-out infinite`,
              animationDelay: `${i * 0.4}s`,
              filter: `drop-shadow(0 0 4px ${color}80)`,
            }}
          >
            <corner.Rune color={color} />
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 3. DimensionalRift
// ---------------------------------------------------------------------------

export interface DimensionalRiftProps {
  enabled: boolean;
  accentHex: string;
  className?: string;
}

/**
 * A dark portal center with chromatic energy bleeding in from the edges.
 * Designed to sit behind the card's art zone content, adding depth.
 */
export function DimensionalRift({
  enabled,
  accentHex,
  className = "",
}: DimensionalRiftProps) {
  useEffect(() => {
    if (enabled) ensureStyles();
  }, [enabled]);

  if (!enabled) return null;

  const [c1, c2, c3, c4] = AURORA_PALETTE;

  return (
    <div
      className={`absolute inset-0 pointer-events-none z-0 ethereal-dimensional-pulse ${className}`}
      aria-hidden="true"
      style={{
        animation: "dimensionalPulse 8s ease-in-out infinite",
      }}
    >
      {/* Dark portal center */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at center, rgba(0,0,0,0.25) 0%, rgba(0,0,0,0.08) 40%, transparent 60%)",
        }}
      />

      {/* Chromatic edge glow — shifts between aurora colors */}
      <div
        className="absolute inset-0 rounded-[inherit]"
        style={{
          boxShadow: [
            `inset 0 0 30px ${c1}20`,
            `inset 0 0 60px ${c3}10`,
            `inset 0 -20px 40px ${c4}08`,
            `inset 0 20px 40px ${c2}08`,
          ].join(", "),
        }}
      />

      {/* Secondary accent energy */}
      <div
        className="absolute inset-0 rounded-[inherit]"
        style={{
          boxShadow: [
            `inset 20px 0 30px ${accentHex}08`,
            `inset -20px 0 30px ${c3}08`,
          ].join(", "),
          opacity: 0.7,
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// 4. LivingSymbols
// ---------------------------------------------------------------------------

export interface LivingSymbolsProps {
  enabled: boolean;
  accentHex: string;
  children?: ReactNode;
  className?: string;
}

/**
 * Adds animated "current flow" to SVG schematic symbols.
 *
 * Wraps children in a container that applies CSS classes for:
 * - Animated stroke-dasharray / stroke-dashoffset on SVG paths
 * - Chromatic aberration via 3 offset color copies at very low opacity
 *
 * Usage: wrap an SVG symbol element with <LivingSymbols> to animate it.
 */
export function LivingSymbols({
  enabled,
  accentHex,
  children,
  className = "",
}: LivingSymbolsProps) {
  useEffect(() => {
    if (enabled) ensureStyles();
  }, [enabled]);

  if (!enabled) {
    return <>{children}</>;
  }

  return (
    <div
      className={`relative pointer-events-none ${className}`}
      aria-hidden="true"
    >
      {/* Primary symbol with living flow animation */}
      <div
        className="ethereal-living-symbol"
        style={{
          ["--living-color" as string]: accentHex,
        }}
      >
        <div
          style={
            {
              // Apply stroke-dasharray animation to all SVG children via CSS
              // The style cascades to inner SVGs
            }
          }
        >
          <style>{`
            .ethereal-living-symbol svg path,
            .ethereal-living-symbol svg line,
            .ethereal-living-symbol svg polyline,
            .ethereal-living-symbol svg circle {
              stroke-dasharray: 8 4;
              animation: livingSymbolFlow 2s linear infinite;
            }
          `}</style>
          {children}
        </div>
      </div>

      {/* Chromatic aberration copies — 3 offset color layers at 5% opacity */}
      <div
        className="absolute inset-0 ethereal-living-symbol-copy"
        style={{
          transform: "translate(1px, 0)",
          opacity: 0.05,
          filter: "hue-rotate(0deg)",
          mixBlendMode: "screen",
        }}
      >
        <div style={{ color: "#FF0000" }}>{children}</div>
      </div>

      <div
        className="absolute inset-0 ethereal-living-symbol-copy"
        style={{
          transform: "translate(-1px, 0.5px)",
          opacity: 0.05,
          filter: "hue-rotate(120deg)",
          mixBlendMode: "screen",
        }}
      >
        <div style={{ color: "#00FF00" }}>{children}</div>
      </div>

      <div
        className="absolute inset-0 ethereal-living-symbol-copy"
        style={{
          transform: "translate(0, -1px)",
          opacity: 0.05,
          filter: "hue-rotate(240deg)",
          mixBlendMode: "screen",
        }}
      >
        <div style={{ color: "#0000FF" }}>{children}</div>
      </div>
    </div>
  );
}
