import { useVisualEffects } from "@/hooks/useVisualEffects";
/**
 * MouseTilt -- Perspective tilt wrapper following mouse position.
 *
 * Adds a subtle "trading card in hand" tilt effect gated by the
 * `enabled` prop (Journeyman+ rank). Uses CSS custom properties set
 * directly on the DOM node for zero React re-renders during mousemove.
 * Respects prefers-reduced-motion and disables on non-hover devices.
 */

import {
  useRef,
  useCallback,
  useEffect,
  useState,
  type ReactNode,
} from "react";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface MouseTiltProps {
  enabled: boolean;
  maxTilt?: number;
  perspective?: number;
  children: ReactNode;
  className?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function MouseTilt({
  enabled,
  maxTilt = 3,
  perspective = 800,
  children,
  className = "",
}: MouseTiltProps) {
  const { motion } = useVisualEffects();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);

  // Track whether tilt should actually be active (reduced-motion + hover check)
  const [effectivelyEnabled, setEffectivelyEnabled] = useState(false);

  useEffect(() => {
    if (!enabled || !motion) {
      setEffectivelyEnabled(false);
      return;
    }
    const hover = window.matchMedia("(hover: hover)");
    const update = () => setEffectivelyEnabled(hover.matches);
    update();
    hover.addEventListener("change", update);
    return () => hover.removeEventListener("change", update);
  }, [enabled, motion]);

  // Mouse move handler — sets CSS custom properties directly on the DOM node
  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const el = wrapperRef.current;
      const inner = innerRef.current;
      if (!el || !inner) return;

      const rect = el.getBoundingClientRect();

      // Offset from center, normalized to [-1, 1]
      const x = ((e.clientX - rect.left) / rect.width - 0.5) * 2;
      const y = ((e.clientY - rect.top) / rect.height - 0.5) * 2;

      // rotateY follows horizontal offset, rotateX follows vertical offset (inverted)
      const tiltX = x * maxTilt;
      const tiltY = -y * maxTilt;

      inner.style.setProperty("--tilt-x", `${tiltX}deg`);
      inner.style.setProperty("--tilt-y", `${tiltY}deg`);
    },
    [maxTilt],
  );

  // Mouse leave handler — reset to flat
  const handleMouseLeave = useCallback(() => {
    const inner = innerRef.current;
    if (!inner) return;
    inner.style.setProperty("--tilt-x", "0deg");
    inner.style.setProperty("--tilt-y", "0deg");
  }, []);

  const active = enabled && motion && effectivelyEnabled;

  // Stable grid wrappers preserve focus and stretch the card to its parent row
  // even when tilt is inactive; plain blocks would leave shorter cards unfilled.
  return (
    <div
      ref={wrapperRef}
      className={`grid min-w-0 ${className}`}
      onMouseMove={active ? handleMouseMove : undefined}
      onMouseLeave={active ? handleMouseLeave : undefined}
      style={{ perspective: active ? `${perspective}px` : undefined }}
    >
      <div
        ref={innerRef}
        className="grid min-w-0"
        style={
          {
            "--tilt-x": "0deg",
            "--tilt-y": "0deg",
            transform: active ? "rotateX(var(--tilt-y)) rotateY(var(--tilt-x))" : "none",
            willChange: active ? "transform" : undefined,
            transition: active ? "transform 150ms ease-out" : "none",
          } as React.CSSProperties
        }
      >
        {children}
      </div>
    </div>
  );
}

export default MouseTilt;
