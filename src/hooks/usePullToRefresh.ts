import { useRef, useCallback, useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

const PULL_THRESHOLD = 80;
const MAX_PULL = 120;

export interface PullToRefreshResult {
  /** 0-1 progress toward threshold; 1 = threshold reached */
  pullProgress: number;
  /** True while the refresh query invalidation is in flight */
  isRefreshing: boolean;
  /** Attach to the scrollable container element */
  containerRef: React.RefCallback<HTMLElement>;
}

/**
 * usePullToRefresh - detects a pull-down touch gesture and triggers
 * queryClient.invalidateQueries() when the user pulls past the threshold.
 *
 * Only activates when the scroll container is at the top (scrollTop === 0).
 */
export function usePullToRefresh(): PullToRefreshResult {
  const queryClient = useQueryClient();
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const containerElRef = useRef<HTMLElement | null>(null);
  const startYRef = useRef<number | null>(null);
  const isPullingRef = useRef(false);
  const pullDistanceRef = useRef(0);

  // Keep ref in sync with state so event handlers can read latest value
  useEffect(() => {
    pullDistanceRef.current = pullDistance;
  }, [pullDistance]);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await queryClient.invalidateQueries();
    } finally {
      // Keep spinner visible briefly so user sees feedback
      setTimeout(() => {
        setIsRefreshing(false);
        setPullDistance(0);
      }, 600);
    }
  }, [queryClient]);

  // Store handleRefresh in a ref so the event handlers don't need to re-register
  const handleRefreshRef = useRef(handleRefresh);
  useEffect(() => {
    handleRefreshRef.current = handleRefresh;
  }, [handleRefresh]);

  // Stable event handlers that read from refs
  const onTouchStart = useCallback((e: TouchEvent) => {
    const el = containerElRef.current;
    if (!el || el.scrollTop > 0) return;
    startYRef.current = e.touches[0].clientY;
    isPullingRef.current = false;
  }, []);

  const onTouchMove = useCallback((e: TouchEvent) => {
    if (startYRef.current === null) return;
    const el = containerElRef.current;
    if (!el) return;

    // Only pull when scrolled to the top
    if (el.scrollTop > 0) {
      startYRef.current = null;
      isPullingRef.current = false;
      setPullDistance(0);
      return;
    }

    const currentY = e.touches[0].clientY;
    const diff = currentY - startYRef.current;

    if (diff > 0) {
      isPullingRef.current = true;
      // Prevent native scroll while pulling down from top
      e.preventDefault();
      // Apply diminishing returns so it feels elastic
      const clamped = Math.min(diff * 0.5, MAX_PULL);
      setPullDistance(clamped);
    } else {
      isPullingRef.current = false;
      setPullDistance(0);
    }
  }, []);

  const onTouchEnd = useCallback(() => {
    if (isPullingRef.current && pullDistanceRef.current >= PULL_THRESHOLD) {
      handleRefreshRef.current();
    } else {
      setPullDistance(0);
    }
    startYRef.current = null;
    isPullingRef.current = false;
  }, []);

  const containerRef = useCallback(
    (node: HTMLElement | null) => {
      // Clean up old listeners
      const prev = containerElRef.current;
      if (prev) {
        prev.removeEventListener("touchstart", onTouchStart);
        prev.removeEventListener("touchmove", onTouchMove);
        prev.removeEventListener("touchend", onTouchEnd);
      }
      containerElRef.current = node;
      if (node) {
        node.addEventListener("touchstart", onTouchStart, { passive: true });
        node.addEventListener("touchmove", onTouchMove, { passive: false });
        node.addEventListener("touchend", onTouchEnd);
      }
    },
    [onTouchStart, onTouchMove, onTouchEnd],
  );

  // Clean up listeners on unmount
  useEffect(() => {
    return () => {
      const el = containerElRef.current;
      if (el) {
        el.removeEventListener("touchstart", onTouchStart);
        el.removeEventListener("touchmove", onTouchMove);
        el.removeEventListener("touchend", onTouchEnd);
      }
    };
  }, [onTouchStart, onTouchMove, onTouchEnd]);

  const pullProgress = Math.min(pullDistance / PULL_THRESHOLD, 1);

  return {
    pullProgress,
    isRefreshing,
    containerRef,
  };
}
