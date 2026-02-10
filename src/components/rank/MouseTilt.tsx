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
  const wrapperRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);

  // Track whether tilt should actually be active (reduced-motion + hover check)
  const [effectivelyEnabled, setEffectivelyEnabled] = useState(false);

  useEffect(() => {
    if (!enabled) {
      setEffectivelyEnabled(false);
      return;
    }

    // Check prefers-reduced-motion
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (reducedMotion.matches) {
      setEffectivelyEnabled(false);
      return;
    }

    // Check hover capability (non-hover = touch-only = no tilt)
    const hoverCapable = window.matchMedia("(hover: hover)");
    if (!hoverCapable.matches) {
      setEffectivelyEnabled(false);
      return;
    }

    setEffectivelyEnabled(true);

    // Listen for changes (e.g., connecting a mouse to a tablet)
    const handleReducedMotionChange = (e: MediaQueryListEvent) => {
      if (e.matches) setEffectivelyEnabled(false);
    };
    const handleHoverChange = (e: MediaQueryListEvent) => {
      if (!e.matches) setEffectivelyEnabled(false);
      else if (!reducedMotion.matches) setEffectivelyEnabled(true);
    };

    reducedMotion.addEventListener("change", handleReducedMotionChange);
    hoverCapable.addEventListener("change", handleHoverChange);

    return () => {
      reducedMotion.removeEventListener("change", handleReducedMotionChange);
      hoverCapable.removeEventListener("change", handleHoverChange);
    };
  }, [enabled]);

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

  // When not effectively enabled, render children directly
  if (!effectivelyEnabled) {
    return <>{children}</>;
  }

  return (
    <div
      ref={wrapperRef}
      className={className}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={{ perspective: `${perspective}px` }}
    >
      <div
        ref={innerRef}
        style={
          {
            "--tilt-x": "0deg",
            "--tilt-y": "0deg",
            transform: "rotateX(var(--tilt-y)) rotateY(var(--tilt-x))",
            willChange: "transform",
            transition: "transform 150ms ease-out",
          } as React.CSSProperties
        }
      >
        {children}
      </div>
    </div>
  );
}

export default MouseTilt;
