/**
 * LegendaryEffects -- Visual effects for Legendary-tier equipment cards.
 *
 * Contains three sub-components:
 *   1. EnergyBorderOverlay  -- Traveling light pulse circuiting the card perimeter
 *   2. FiligreeCorners      -- Art Deco ornamental SVG corner decorations
 *   3. CardSignature        -- Personalized motto text at card footer
 *
 * These replace lower-tier elements: filigree corners replace the standard
 * corner brackets; energy border overlays the static border glow.
 *
 * CSS-only animations. No Canvas, no WebGL. Uses the ensureStyles pattern
 * for keyframe injection shared with the other rank effect components.
 */

import { useEffect } from "react";

// ---------------------------------------------------------------------------
// Style injection (ensureStyles pattern)
// ---------------------------------------------------------------------------

const STYLE_ID = "legendary-effects-styles";

function ensureStyles() {
  if (typeof document === "undefined") return;
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
@keyframes energyCircuit {
  from { transform: rotate(0deg); }
  to   { transform: rotate(360deg); }
}
@keyframes filigreePulse {
  0%, 100% { opacity: 0.6; }
  50%      { opacity: 1; }
}
@media (prefers-reduced-motion: reduce) {
  .legendary-energy-spin {
    animation: none !important;
  }
  .legendary-filigree-pulse {
    animation: none !important;
    opacity: 0.8 !important;
  }
}`;
  document.head.appendChild(style);
}

// ---------------------------------------------------------------------------
// 1. EnergyBorderOverlay
// ---------------------------------------------------------------------------

export interface EnergyBorderOverlayProps {
  enabled: boolean;
  accentHex: string;
  className?: string;
}

/**
 * A traveling light pulse that circuits the card perimeter every 3 seconds.
 *
 * Implementation: an absolutely positioned wrapper whose child div carries
 * a conic-gradient that rotates continuously. A solid inner mask removes
 * the interior so only the border-width region of the gradient is visible.
 */
export function EnergyBorderOverlay({
  enabled,
  accentHex,
  className = "",
}: EnergyBorderOverlayProps) {
  useEffect(() => {
    if (enabled) ensureStyles();
  }, [enabled]);

  if (!enabled) return null;

  // Blend the accent with gold for a warm energy tint
  const energyColor = accentHex;
  const goldTint = "#FFD700";

  return (
    <div
      className={`absolute inset-[-2px] rounded-[inherit] overflow-hidden pointer-events-none z-[1] ${className}`}
      aria-hidden="true"
    >
      {/* Rotating conic gradient — the visible energy pulse */}
      <div
        className="absolute inset-[-50%] legendary-energy-spin"
        style={{
          background: [
            `conic-gradient(`,
            `from 0deg,`,
            `transparent 0%,`,
            `transparent 5%,`,
            `${goldTint}40 8%,`,
            `${energyColor}80 10%,`,
            `${goldTint}60 12%,`,
            `transparent 18%,`,
            `transparent 100%)`,
          ].join(" "),
          animation: "energyCircuit 3s linear infinite",
        }}
      />

      {/* Inner mask — cuts out the interior so only the border edge shows */}
      <div
        className="absolute rounded-[inherit]"
        style={{
          inset: "3px",
          background: "var(--card-bg, #0f1420)",
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// 2. FiligreeCorners
// ---------------------------------------------------------------------------

export interface FiligreeCornersProps {
  enabled: boolean;
  accentHex: string;
  className?: string;
}

/**
 * Art Deco corner ornament — a single SVG path mirrored into 4 corners.
 * Replaces the standard corner brackets at Legendary rank.
 */
function FiligreeCornerSVG({ color }: { color: string }) {
  return (
    <svg
      width={24}
      height={24}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      {/* Art Deco scrollwork corner ornament */}
      <path
        d="M2 22V12C2 6.48 6.48 2 12 2h10"
        stroke={color}
        strokeWidth={1.2}
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M2 18V14C2 9.58 5.58 6 10 6h8"
        stroke={color}
        strokeWidth={0.8}
        strokeLinecap="round"
        fill="none"
        opacity={0.7}
      />
      {/* Decorative dot at the curve apex */}
      <circle cx={6} cy={6} r={1.2} fill={color} opacity={0.8} />
      {/* Inner scroll detail */}
      <path
        d="M4 16C4 11.58 7.58 8 12 8"
        stroke={color}
        strokeWidth={0.5}
        strokeLinecap="round"
        fill="none"
        opacity={0.4}
      />
      {/* Radial accent line */}
      <path
        d="M2 22L6 18"
        stroke={color}
        strokeWidth={0.6}
        strokeLinecap="round"
        opacity={0.5}
      />
      {/* Terminal diamond */}
      <path d="M3 21l1-1.5L5 21l-1 1.5z" fill={color} opacity={0.6} />
    </svg>
  );
}

const CORNER_POSITIONS: {
  className: string;
  scaleX: number;
  scaleY: number;
}[] = [
  { className: "top-1 left-1", scaleX: 1, scaleY: 1 },
  { className: "top-1 right-1", scaleX: -1, scaleY: 1 },
  { className: "bottom-1 left-1", scaleX: 1, scaleY: -1 },
  { className: "bottom-1 right-1", scaleX: -1, scaleY: -1 },
];

/**
 * Four ornate Art Deco corner SVGs with a breathing pulse animation
 * and a warm golden drop-shadow.
 */
export function FiligreeCorners({
  enabled,
  accentHex,
  className = "",
}: FiligreeCornersProps) {
  useEffect(() => {
    if (enabled) ensureStyles();
  }, [enabled]);

  if (!enabled) return null;

  // Blend accent with gold for a warm filigree color
  const filigreeColor = "#FFD700";

  return (
    <div
      className={`absolute inset-0 pointer-events-none z-[2] ${className}`}
      aria-hidden="true"
    >
      {CORNER_POSITIONS.map((pos, i) => (
        <div
          key={i}
          className={`absolute ${pos.className} legendary-filigree-pulse`}
          style={{
            transform: `scale(${pos.scaleX}, ${pos.scaleY})`,
            animation: "filigreePulse 4s ease-in-out infinite",
            filter: `drop-shadow(0 0 3px ${filigreeColor}60)`,
            color: accentHex,
          }}
        >
          <FiligreeCornerSVG color={filigreeColor} />
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 3. CardSignature
// ---------------------------------------------------------------------------

export interface CardSignatureProps {
  signature: string | undefined;
  enabled: boolean;
  className?: string;
}

/**
 * Personalized motto text at the card footer for Legendary+ operators.
 * Max 40 chars enforced at the store level; this component just renders.
 */
export function CardSignature({
  signature,
  enabled,
  className = "",
}: CardSignatureProps) {
  if (!enabled || !signature || signature.trim().length === 0) return null;

  return (
    <div
      className={`relative text-center pointer-events-none ${className}`}
      aria-hidden="true"
    >
      <p
        className="text-[9px] italic text-gray-500 leading-tight"
        style={{ fontVariantLigatures: "common-ligatures" }}
      >
        {signature}
      </p>
      {/* Golden underline */}
      <div
        className="mx-auto mt-0.5"
        style={{
          width: "60%",
          maxWidth: "120px",
          height: "1px",
          background:
            "linear-gradient(90deg, transparent, #FFD70050, transparent)",
        }}
      />
    </div>
  );
}
