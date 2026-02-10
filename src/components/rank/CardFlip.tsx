/**
 * CardFlip -- 3D CSS flip wrapper for equipment cards.
 *
 * Adds a front/back card flip capability gated by the `enabled` prop
 * (Apprentice+ rank). Trigger via double-click or a small flip icon
 * button in the top-right corner. Uses CSS perspective + rotateY for
 * the 3D effect, with prefers-reduced-motion support.
 */

import { useState, useCallback, useEffect, type ReactNode } from "react";

// ---------------------------------------------------------------------------
// Inject flip keyframes once (follows EquipmentCard ensureCardStyles pattern)
// ---------------------------------------------------------------------------

const STYLE_ID = "card-flip-styles";

function ensureStyles() {
  if (typeof document === "undefined") return;
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
.card-flip-scene {
  perspective: 800px;
}
.card-flip-inner {
  position: relative;
  width: 100%;
  height: 100%;
  transform-style: preserve-3d;
  transition: transform 500ms cubic-bezier(0.4, 0.0, 0.2, 1);
}
.card-flip-inner--flipped {
  transform: rotateY(180deg);
}
.card-flip-face {
  position: absolute;
  inset: 0;
  backface-visibility: hidden;
  -webkit-backface-visibility: hidden;
}
.card-flip-face--back {
  transform: rotateY(180deg);
}
@media (prefers-reduced-motion: reduce) {
  .card-flip-inner {
    transition: none !important;
  }
}`;
  document.head.appendChild(style);
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface CardFlipProps {
  enabled: boolean;
  backContent: ReactNode;
  children: ReactNode;
  className?: string;
}

// ---------------------------------------------------------------------------
// Flip Icon SVG (two overlapping rectangles with a curved arrow)
// ---------------------------------------------------------------------------

function FlipIcon() {
  return (
    <svg
      width={14}
      height={14}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {/* Front card outline */}
      <rect x={1} y={3} width={8} height={10} rx={1} opacity={0.4} />
      {/* Back card outline */}
      <rect x={7} y={3} width={8} height={10} rx={1} />
      {/* Curved arrow */}
      <path d="M5 1.5c3.5-0.5 6 1 7 3" />
      <path d="M12 4.5l-0.5-2.5L9.5 3.5" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CardFlip({
  enabled,
  backContent,
  children,
  className = "",
}: CardFlipProps) {
  const [isFlipped, setIsFlipped] = useState(false);

  // Inject styles on mount when enabled
  useEffect(() => {
    if (enabled) ensureStyles();
  }, [enabled]);

  // Double-click / double-tap handler
  const handleDoubleClick = useCallback(() => {
    if (enabled) setIsFlipped((prev) => !prev);
  }, [enabled]);

  // Flip button click handler (stops propagation to avoid triggering card onClick)
  const handleFlipClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      if (enabled) setIsFlipped((prev) => !prev);
    },
    [enabled],
  );

  // When disabled, render children directly with no wrapper overhead
  if (!enabled) {
    return <>{children}</>;
  }

  return (
    <div
      className={`card-flip-scene ${className}`}
      onDoubleClick={handleDoubleClick}
      style={{ position: "relative" }}
    >
      <div
        className={`card-flip-inner ${isFlipped ? "card-flip-inner--flipped" : ""}`}
      >
        {/* ---- Front face ---- */}
        <div className="card-flip-face" style={{ position: "relative" }}>
          {children}

          {/* Flip icon button (top-right corner) */}
          <button
            type="button"
            onClick={handleFlipClick}
            className="absolute top-2 right-2 z-20 p-1 rounded-md bg-white/5 hover:bg-white/15 text-gray-400 hover:text-white transition-colors min-h-[24px] min-w-[24px] flex items-center justify-center"
            aria-label="Flip card"
            title="Flip card"
          >
            <FlipIcon />
          </button>
        </div>

        {/* ---- Back face ---- */}
        <div
          className="card-flip-face card-flip-face--back bg-[#0f1420] rounded-xl border border-white/10 overflow-hidden"
          style={{ position: "relative" }}
        >
          {backContent}

          {/* Flip-back button (top-right corner) */}
          <button
            type="button"
            onClick={handleFlipClick}
            className="absolute top-2 right-2 z-20 p-1 rounded-md bg-white/5 hover:bg-white/15 text-gray-400 hover:text-white transition-colors min-h-[24px] min-w-[24px] flex items-center justify-center"
            aria-label="Flip back"
            title="Flip back"
          >
            <FlipIcon />
          </button>
        </div>
      </div>
    </div>
  );
}

export default CardFlip;
