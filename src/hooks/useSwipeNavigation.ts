import { useCallback, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useIsMobile } from "./useIsMobile";

const MIN_SWIPE_X = 80;
const MAX_SWIPE_Y = 60;
const COOLDOWN_MS = 300;

/**
 * useSwipeNavigation - Detects horizontal swipe gestures to navigate between pages.
 *
 * Only active on mobile viewports. Swipe left → next route, swipe right → previous route.
 * Requires primarily-horizontal gesture (>80px X, <60px Y) to avoid interfering with scroll.
 */
export function useSwipeNavigation(routes: string[]) {
  const navigate = useNavigate();
  const location = useLocation();
  const isMobile = useIsMobile();

  const startRef = useRef<{ x: number; y: number } | null>(null);
  const lastNavRef = useRef(0);
  const containerElRef = useRef<HTMLElement | null>(null);

  const onTouchStart = useCallback(
    (e: TouchEvent) => {
      if (!isMobile) return;
      startRef.current = {
        x: e.touches[0].clientX,
        y: e.touches[0].clientY,
      };
    },
    [isMobile],
  );

  const onTouchEnd = useCallback(
    (e: TouchEvent) => {
      if (!isMobile || !startRef.current) return;

      const endX = e.changedTouches[0].clientX;
      const endY = e.changedTouches[0].clientY;
      const dx = endX - startRef.current.x;
      const dy = Math.abs(endY - startRef.current.y);
      startRef.current = null;

      // Must be primarily horizontal
      if (Math.abs(dx) < MIN_SWIPE_X || dy > MAX_SWIPE_Y) return;

      // Cooldown to prevent double-swipe
      const now = Date.now();
      if (now - lastNavRef.current < COOLDOWN_MS) return;
      lastNavRef.current = now;

      const currentIndex = routes.indexOf(location.pathname);
      if (currentIndex === -1) return;

      if (dx < 0 && currentIndex < routes.length - 1) {
        // Swipe left → next
        navigate(routes[currentIndex + 1]);
      } else if (dx > 0 && currentIndex > 0) {
        // Swipe right → previous
        navigate(routes[currentIndex - 1]);
      }
    },
    [isMobile, location.pathname, navigate, routes],
  );

  const containerRef = useCallback(
    (node: HTMLElement | null) => {
      const prev = containerElRef.current;
      if (prev) {
        prev.removeEventListener("touchstart", onTouchStart);
        prev.removeEventListener("touchend", onTouchEnd);
      }
      containerElRef.current = node;
      if (node) {
        node.addEventListener("touchstart", onTouchStart, { passive: true });
        node.addEventListener("touchend", onTouchEnd, { passive: true });
      }
    },
    [onTouchStart, onTouchEnd],
  );

  return { containerRef };
}
