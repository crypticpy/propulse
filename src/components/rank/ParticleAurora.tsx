import { useVisualEffects } from "@/hooks/useVisualEffects";
/**
 * ParticleAurora -- CSS-only particle system for equipment card art zones.
 *
 * Renders floating particles that drift upward with horizontal wobble.
 * Unlocked at Expert rank. Higher ranks get more particles, richer colors,
 * and more dynamic behavior. Ethereal rank adds a constellation-net overlay.
 *
 * CSS-only: no Canvas, no WebGL. Each particle is an absolutely positioned
 * div with a CSS keyframe animation driven by custom properties.
 */

import { useMemo } from "react";
import type { RankTier } from "@/types/rank";
import { isRankAtLeast } from "@/lib/data/rankConstants";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ParticleData {
  id: number;
  x: number; // % from left
  y: number; // % from top (bottom-half start)
  size: number; // px
  color: string;
  opacity: number;
  wobble: number; // px horizontal drift
  duration: number; // seconds
  delay: number; // seconds
}

interface ConstellationLine {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface ParticleAuroraProps {
  enabled: boolean;
  rank: RankTier;
  accentHex: string;
  className?: string;
}

// ---------------------------------------------------------------------------
// Style injection (ensureStyles pattern)
// ---------------------------------------------------------------------------

const PARTICLE_STYLE_ID = "particle-aurora-styles";

function ensureStyles() {
  if (typeof document === "undefined") return;
  if (document.getElementById(PARTICLE_STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = PARTICLE_STYLE_ID;
  style.textContent = `
@keyframes particleDrift {
  0% {
    transform: translateY(0) translateX(0);
    opacity: var(--p-opacity);
  }
  50% {
    transform: translateY(-50%) translateX(var(--p-wobble));
    opacity: calc(var(--p-opacity) * 1.2);
  }
  100% {
    transform: translateY(-100%) translateX(0);
    opacity: 0;
  }
}
@media (prefers-reduced-motion: reduce) {
  .particle-drift {
    animation: none !important;
    opacity: var(--p-opacity) !important;
  }
}`;
  document.head.appendChild(style);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Seeded-ish random based on index for deterministic layout across renders */
function pseudoRandom(seed: number): number {
  const x = Math.sin(seed * 9301 + 49297) * 233280;
  return x - Math.floor(x);
}

function getParticleConfig(rank: RankTier, isMobile: boolean) {
  const configs: Record<
    string,
    {
      count: number;
      sizeMin: number;
      sizeMax: number;
      colors: (accent: string) => string[];
    }
  > = {
    expert: {
      count: 10,
      sizeMin: 2,
      sizeMax: 6,
      colors: (accent) => [accent],
    },
    master: {
      count: 15,
      sizeMin: 3,
      sizeMax: 7,
      colors: (accent) => [accent, "#FFD700"],
    },
    legendary: {
      count: 25,
      sizeMin: 3,
      sizeMax: 8,
      colors: (accent) => ["#FFD700", "#FFD700", "#FFD700", accent],
    },
    ethereal: {
      count: 30,
      sizeMin: 3,
      sizeMax: 8,
      colors: () => ["#38BDF8", "#A78BFA", "#F472B6"],
    },
  };

  // Fall back to expert config for any rank >= expert not listed
  const cfg = configs[rank] ?? configs.expert;
  const reducedMotion =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  let count = cfg.count;
  if (reducedMotion) {
    count = Math.min(count, 5);
  } else if (isMobile) {
    count = Math.ceil(count / 2);
  }

  return { ...cfg, count };
}

function generateParticles(
  rank: RankTier,
  accentHex: string,
  isMobile: boolean,
): ParticleData[] {
  const cfg = getParticleConfig(rank, isMobile);
  const colors = cfg.colors(accentHex);
  const particles: ParticleData[] = [];

  for (let i = 0; i < cfg.count; i++) {
    const r = (s: number) => pseudoRandom(i * 7 + s);

    particles.push({
      id: i,
      x: r(1) * 100, // 0-100%
      y: 50 + r(2) * 50, // 50-100% (bottom half)
      size: cfg.sizeMin + r(3) * (cfg.sizeMax - cfg.sizeMin),
      color: colors[Math.floor(r(4) * colors.length)],
      opacity: 0.3 + r(5) * 0.4, // 0.3-0.7
      wobble: (r(6) - 0.5) * 30, // -15px to +15px
      duration: 4 + r(7) * 4, // 4-8s
      delay: r(8) * 5, // 0-5s
    });
  }

  return particles;
}

function generateConstellationLines(): ConstellationLine[] {
  // Static diagonal lines as a "constellation net" decoration
  return [
    { x1: 10, y1: 80, x2: 35, y2: 40 },
    { x1: 35, y1: 40, x2: 65, y2: 55 },
    { x1: 65, y1: 55, x2: 90, y2: 30 },
    { x1: 20, y1: 60, x2: 75, y2: 70 },
  ];
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ParticleAurora({
  enabled,
  rank,
  accentHex,
  className = "",
}: ParticleAuroraProps) {
  const effects = useVisualEffects();
  const active = enabled && effects.particles;
  ensureStyles();

  const isMobile = useMemo(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia("(max-width: 768px)").matches;
  }, []);

  const particles = useMemo(() => {
    if (!active || !isRankAtLeast(rank, "expert")) return [];
    return generateParticles(rank, accentHex, isMobile);
  }, [active, rank, accentHex, isMobile]);

  const constellationLines = useMemo(() => {
    if (!active || rank !== "ethereal") return [];
    return generateConstellationLines();
  }, [active, rank]);

  if (!active || !isRankAtLeast(rank, "expert") || particles.length === 0) {
    return null;
  }

  return (
    <div
      className={`absolute inset-0 overflow-hidden pointer-events-none ${className}`}
      aria-hidden="true"
    >
      {/* Ethereal constellation net */}
      {constellationLines.length > 0 && (
        <svg
          className="absolute inset-0 w-full h-full"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          style={{ opacity: 0.05 }}
        >
          {constellationLines.map((line, i) => (
            <line
              key={i}
              x1={line.x1}
              y1={line.y1}
              x2={line.x2}
              y2={line.y2}
              stroke="#A78BFA"
              strokeWidth="0.3"
            />
          ))}
        </svg>
      )}

      {/* Particles */}
      {particles.map((p) => (
        <div
          key={p.id}
          className="absolute rounded-full particle-drift"
          style={
            {
              left: `${p.x}%`,
              top: `${p.y}%`,
              width: `${p.size}px`,
              height: `${p.size}px`,
              backgroundColor: p.color,
              "--p-opacity": p.opacity,
              "--p-wobble": `${p.wobble}px`,
              animation: `particleDrift ${p.duration}s ease-in-out ${p.delay}s infinite`,
              opacity: p.opacity,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}

export default ParticleAurora;
