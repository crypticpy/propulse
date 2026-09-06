import { useVisualEffects } from "@/hooks/useVisualEffects";
/**
 * StatCountUp -- Animated count-up component for stat values.
 *
 * Parses the numeric prefix from a value string (e.g., "100W" -> 100 + "W")
 * and animates from 0 to the target number using requestAnimationFrame with
 * cubic ease-out timing. Non-numeric values render directly without animation.
 * Unlocked at Expert rank (caller controls via `enabled` prop).
 */

import { useEffect, useRef, useState, useCallback } from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface StatCountUpProps {
  value: string;
  enabled: boolean;
  duration?: number; // ms, default 400
  className?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const NUMERIC_RE = /^([+-]?\d*\.?\d+)(.*)$/;

function parseValue(
  value: string,
): { num: number; suffix: string; decimals: number } | null {
  if (!value) return null;
  const match = value.match(NUMERIC_RE);
  if (!match) return null;
  const numStr = match[1];
  const suffix = match[2];
  const dotIndex = numStr.indexOf(".");
  const decimals = dotIndex === -1 ? 0 : numStr.length - dotIndex - 1;
  return { num: parseFloat(numStr), suffix, decimals };
}

/** Cubic ease-out: 1 - (1 - t)^3 */
function easeOut(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function StatCountUp({
  value,
  enabled,
  duration = 400,
  className = "",
}: StatCountUpProps) {
  const { motion } = useVisualEffects();
  const rafRef = useRef<number | null>(null);
  const startTimeRef = useRef<number | null>(null);
  const [displayValue, setDisplayValue] = useState<string>(value ?? "");

  const cancelAnimation = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    startTimeRef.current = null;
  }, []);

  useEffect(() => {
    const safeValue = value ?? "";
    const parsed = parseValue(safeValue);

    // No numeric prefix or animation disabled or reduced motion: show final value
    if (!parsed || !enabled || !motion) {
      cancelAnimation();
      setDisplayValue(safeValue);
      return;
    }

    const { num: target, suffix, decimals } = parsed;

    // Edge case: target is 0, no animation needed
    if (target === 0) {
      setDisplayValue(value);
      return;
    }

    cancelAnimation();

    const animate = (timestamp: number) => {
      if (startTimeRef.current === null) {
        startTimeRef.current = timestamp;
      }

      const elapsed = timestamp - startTimeRef.current;
      const t = Math.min(elapsed / duration, 1);
      const easedT = easeOut(t);
      const current = target * easedT;

      if (decimals > 0) {
        setDisplayValue(`${current.toFixed(decimals)}${suffix}`);
      } else {
        setDisplayValue(`${Math.round(current)}${suffix}`);
      }

      if (t < 1) {
        rafRef.current = requestAnimationFrame(animate);
      } else {
        // Ensure final value is exact
        setDisplayValue(safeValue);
        rafRef.current = null;
        startTimeRef.current = null;
      }
    };

    rafRef.current = requestAnimationFrame(animate);

    return cancelAnimation;
  }, [value, enabled, motion, duration, cancelAnimation]);

  // Cleanup on unmount
  useEffect(() => {
    return cancelAnimation;
  }, [cancelAnimation]);

  return (
    <span className={className} aria-label={value ?? ""}>
      {enabled && motion ? displayValue : value}
    </span>
  );
}

export default StatCountUp;
