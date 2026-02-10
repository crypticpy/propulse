/**
 * RankUpCelebration -- Full-screen celebration overlay for rank-up events.
 *
 * Triggers when an operator reaches a new rank tier. Renders a portal-based
 * overlay with particle burst, animated badge entrance, and auto-dismiss.
 * Follows the same portal / scroll-lock / escape / ensureStyles patterns
 * used by EquipmentHeroCard.
 */

import { useEffect, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";

import type { RankTier } from "@/types/rank";
import {
  RANK_COLORS,
  RANK_LABELS,
  RANK_TITLES,
  RANK_ICONS,
} from "@/lib/data/rankConstants";
import { RankBadge } from "@/components/rank/RankBadge";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface RankUpCelebrationProps {
  fromRank: RankTier;
  toRank: RankTier;
  onDismiss: () => void;
}

// ---------------------------------------------------------------------------
// CSS Keyframes (injected once)
// ---------------------------------------------------------------------------

const CELEBRATION_STYLE_ID = "rank-celebration-styles";

const CELEBRATION_KEYFRAMES = `
@keyframes celebrationEntrance {
  0% { transform: scale(0.3); opacity: 0; }
  50% { transform: scale(1.1); }
  100% { transform: scale(1); opacity: 1; }
}
@keyframes celebrationBurst {
  0% { transform: translate(0, 0) scale(1); opacity: 1; }
  100% { transform: translate(var(--burst-x), var(--burst-y)) scale(0); opacity: 0; }
}
@keyframes celebrationGlow {
  0%, 100% { opacity: 0.3; }
  50% { opacity: 0.6; }
}
@keyframes celebrationFadeIn {
  0% { opacity: 0; transform: translateY(10px); }
  100% { opacity: 1; transform: translateY(0); }
}
@media (prefers-reduced-motion: reduce) {
  .celebration-entrance { animation-name: celebrationFadeIn !important; animation-duration: 200ms !important; }
  .celebration-burst { display: none !important; }
  .celebration-glow { animation: none !important; opacity: 0.4 !important; }
}
`;

function ensureStyles() {
  if (typeof document === "undefined") return;
  if (document.getElementById(CELEBRATION_STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = CELEBRATION_STYLE_ID;
  style.textContent = CELEBRATION_KEYFRAMES;
  document.head.appendChild(style);
}

// ---------------------------------------------------------------------------
// Particle generation
// ---------------------------------------------------------------------------

interface Particle {
  id: number;
  size: number;
  burstX: string;
  burstY: string;
  duration: number;
  delay: number;
}

function generateParticles(count: number): Particle[] {
  const particles: Particle[] = [];
  for (let i = 0; i < count; i++) {
    const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.5;
    const distance = 120 + Math.random() * 80; // 120-200px
    const burstX = `${Math.cos(angle) * distance}px`;
    const burstY = `${Math.sin(angle) * distance}px`;
    const size = 4 + Math.random() * 4; // 4-8px
    const duration = 1 + Math.random(); // 1-2s
    const delay = Math.random() * 0.3; // 0-0.3s staggered

    particles.push({ id: i, size, burstX, burstY, duration, delay });
  }
  return particles;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function RankUpCelebration({
  fromRank: _fromRank,
  toRank,
  onDismiss,
}: RankUpCelebrationProps) {
  const rankColor = RANK_COLORS[toRank];
  const rankLabel = RANK_LABELS[toRank];
  const rankTitle = RANK_TITLES[toRank];
  const rankIcon = RANK_ICONS[toRank];

  // Generate particles once (stable across re-renders)
  const particles = useMemo(() => generateParticles(20), []);

  // -- Inject keyframe styles ------------------------------------------------
  useEffect(() => {
    ensureStyles();
  }, []);

  // -- Escape key ------------------------------------------------------------
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onDismiss();
    },
    [onDismiss],
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  // -- Body scroll lock ------------------------------------------------------
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // -- Auto-dismiss timer (4 seconds) ----------------------------------------
  useEffect(() => {
    const timer = setTimeout(onDismiss, 4000);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  // -- SSR guard -------------------------------------------------------------
  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[600] flex items-center justify-center"
      role="dialog"
      aria-label="Rank up celebration"
      onClick={onDismiss}
    >
      {/* -- Backdrop -- */}
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" />

      {/* -- Radial gradient burst -- */}
      <div
        className="absolute inset-0 pointer-events-none celebration-glow"
        style={{
          background: `radial-gradient(circle at 50% 50%, ${rankColor}33 0%, ${rankColor}0D 40%, transparent 70%)`,
          animation: "celebrationGlow 2s ease-in-out infinite",
        }}
      />

      {/* -- Center content -- */}
      <div className="relative z-10 flex flex-col items-center gap-3 pointer-events-none">
        {/* Particle burst */}
        {particles.map((p) => (
          <div
            key={p.id}
            className="celebration-burst absolute rounded-full pointer-events-none"
            style={
              {
                width: p.size,
                height: p.size,
                backgroundColor: rankColor,
                "--burst-x": p.burstX,
                "--burst-y": p.burstY,
                animation: `celebrationBurst ${p.duration}s ease-out ${p.delay}s both`,
              } as React.CSSProperties
            }
          />
        ))}

        {/* Rank icon -- large, entrance animation */}
        <div
          className="celebration-entrance text-[24px] leading-none"
          style={{
            animation:
              "celebrationEntrance 600ms cubic-bezier(0.34, 1.56, 0.64, 1) both",
            color: rankColor,
            filter: `drop-shadow(0 0 12px ${rankColor}80)`,
          }}
        >
          {rankIcon}
        </div>

        {/* Rank name -- Orbitron font */}
        <div
          className="celebration-entrance"
          style={{
            animation: "celebrationFadeIn 400ms ease-out 200ms both",
          }}
        >
          <h2
            className="text-2xl sm:text-4xl font-bold font-orbitron text-center"
            style={{
              color: rankColor,
              textShadow: `0 0 20px ${rankColor}60`,
            }}
          >
            {rankLabel}
          </h2>
        </div>

        {/* Subtitle -- rank title */}
        <p
          className="text-sm text-gray-400 text-center"
          style={{
            animation: "celebrationFadeIn 400ms ease-out 350ms both",
          }}
        >
          {rankTitle}
        </p>

        {/* RankBadge */}
        <div
          style={{
            animation: "celebrationFadeIn 400ms ease-out 500ms both",
          }}
        >
          <RankBadge rank={toRank} size="lg" />
        </div>

        {/* "Rank Up!" text */}
        <span
          className="text-xs text-gray-500 uppercase tracking-widest"
          style={{
            animation: "celebrationFadeIn 400ms ease-out 650ms both",
          }}
        >
          Rank Up!
        </span>
      </div>
    </div>,
    document.body,
  );
}

export default RankUpCelebration;
