/**
 * Performance Monitoring Hook
 *
 * Optional hook to measure render times in development mode.
 * Tracks component mount/update times and logs warnings for slow renders (>16ms).
 *
 * Usage:
 * ```tsx
 * function MyComponent() {
 *   usePerformanceMonitor('MyComponent');
 *   // ... component code
 * }
 * ```
 */

import { useEffect, useRef, useCallback } from "react";

// Performance thresholds (in milliseconds)
const SLOW_RENDER_THRESHOLD = 16; // Target 60fps = 16.67ms per frame
const VERY_SLOW_RENDER_THRESHOLD = 50;
const CRITICAL_RENDER_THRESHOLD = 100;

// Whether to enable performance monitoring (disabled in production)
const IS_DEV = import.meta.env.DEV;
const ENABLE_MONITORING = IS_DEV && typeof window !== "undefined";

// Store for aggregated performance data
interface PerformanceEntry {
  componentName: string;
  renderCount: number;
  totalTime: number;
  avgTime: number;
  maxTime: number;
  slowRenders: number;
}

const performanceStore = new Map<string, PerformanceEntry>();

/**
 * Get aggregated performance data for all monitored components
 */
export function getPerformanceReport(): PerformanceEntry[] {
  return Array.from(performanceStore.values()).sort(
    (a, b) => b.avgTime - a.avgTime,
  );
}

/**
 * Clear all performance data
 */
export function clearPerformanceData(): void {
  performanceStore.clear();
}

/**
 * Log a performance summary to the console
 */
export function logPerformanceSummary(): void {
  if (!ENABLE_MONITORING) {
    return;
  }

  const report = getPerformanceReport();

  if (report.length === 0) {
    console.log("[Performance] No data collected yet");
    return;
  }

  console.group("[Performance] Summary");
  console.table(
    report.map((entry) => ({
      Component: entry.componentName,
      "Render Count": entry.renderCount,
      "Avg Time (ms)": entry.avgTime.toFixed(2),
      "Max Time (ms)": entry.maxTime.toFixed(2),
      "Slow Renders": entry.slowRenders,
    })),
  );
  console.groupEnd();
}

// Expose to window for debugging
if (ENABLE_MONITORING && typeof window !== "undefined") {
  (window as Window & { __perf?: unknown }).__perf = {
    getReport: getPerformanceReport,
    logSummary: logPerformanceSummary,
    clear: clearPerformanceData,
  };
}

/**
 * Performance monitoring hook
 *
 * Tracks render times for a component and logs warnings when renders
 * exceed performance thresholds. Only active in development mode.
 *
 * @param componentName - Name of the component being monitored
 * @param options - Optional configuration
 */
export function usePerformanceMonitor(
  componentName: string,
  options: {
    /** Whether to log every render (default: false, only logs slow renders) */
    verbose?: boolean;
    /** Custom threshold in ms (default: 16ms) */
    threshold?: number;
    /** Whether to track this component (default: true) */
    enabled?: boolean;
  } = {},
): void {
  const {
    verbose = false,
    threshold = SLOW_RENDER_THRESHOLD,
    enabled = true,
  } = options;

  const renderStartRef = useRef<number>(0);
  const renderCountRef = useRef<number>(0);

  // Mark render start (called during render phase)
  if (ENABLE_MONITORING && enabled) {
    renderStartRef.current = performance.now();
    renderCountRef.current += 1;
  }

  useEffect(() => {
    if (!ENABLE_MONITORING || !enabled) {
      return;
    }

    const renderEnd = performance.now();
    const renderTime = renderEnd - renderStartRef.current;
    const renderCount = renderCountRef.current;

    // Update performance store
    const existing = performanceStore.get(componentName);
    if (existing) {
      existing.renderCount += 1;
      existing.totalTime += renderTime;
      existing.avgTime = existing.totalTime / existing.renderCount;
      existing.maxTime = Math.max(existing.maxTime, renderTime);
      if (renderTime > threshold) {
        existing.slowRenders += 1;
      }
    } else {
      performanceStore.set(componentName, {
        componentName,
        renderCount: 1,
        totalTime: renderTime,
        avgTime: renderTime,
        maxTime: renderTime,
        slowRenders: renderTime > threshold ? 1 : 0,
      });
    }

    // Log warnings for slow renders
    if (renderTime > CRITICAL_RENDER_THRESHOLD) {
      console.error(
        `[Performance] CRITICAL: ${componentName} took ${renderTime.toFixed(2)}ms (render #${renderCount})`,
      );
    } else if (renderTime > VERY_SLOW_RENDER_THRESHOLD) {
      console.warn(
        `[Performance] SLOW: ${componentName} took ${renderTime.toFixed(2)}ms (render #${renderCount})`,
      );
    } else if (renderTime > threshold && verbose) {
      console.log(
        `[Performance] ${componentName} took ${renderTime.toFixed(2)}ms (render #${renderCount})`,
      );
    } else if (verbose) {
      console.debug(
        `[Performance] ${componentName}: ${renderTime.toFixed(2)}ms (render #${renderCount})`,
      );
    }
  });
}

/**
 * Hook to measure a specific operation's performance
 *
 * @returns Object with measure function and results
 */
export function usePerformanceMeasure(operationName: string) {
  const measureRef = useRef<{ start: number; measurements: number[] }>({
    start: 0,
    measurements: [],
  });

  const start = useCallback(() => {
    if (!ENABLE_MONITORING) {
      return;
    }
    measureRef.current.start = performance.now();
  }, []);

  const end = useCallback(() => {
    if (!ENABLE_MONITORING) {
      return 0;
    }
    const duration = performance.now() - measureRef.current.start;
    measureRef.current.measurements.push(duration);

    // Keep last 100 measurements
    if (measureRef.current.measurements.length > 100) {
      measureRef.current.measurements.shift();
    }

    if (duration > SLOW_RENDER_THRESHOLD) {
      console.warn(
        `[Performance] ${operationName} took ${duration.toFixed(2)}ms`,
      );
    }

    return duration;
  }, [operationName]);

  const getStats = useCallback(() => {
    const {measurements} = measureRef.current;
    if (measurements.length === 0) {
      return { avg: 0, min: 0, max: 0, count: 0 };
    }

    const sum = measurements.reduce((a, b) => a + b, 0);
    return {
      avg: sum / measurements.length,
      min: Math.min(...measurements),
      max: Math.max(...measurements),
      count: measurements.length,
    };
  }, []);

  return { start, end, getStats };
}

/**
 * Decorator to wrap a function with performance timing
 */
export function withPerformanceTracking<
  T extends (...args: unknown[]) => unknown,
>(fn: T, name: string): T {
  if (!ENABLE_MONITORING) {
    return fn;
  }

  return ((...args: Parameters<T>) => {
    const start = performance.now();
    const result = fn(...args);

    // Handle async functions
    if (result instanceof Promise) {
      return result.finally(() => {
        const duration = performance.now() - start;
        if (duration > SLOW_RENDER_THRESHOLD) {
          console.warn(`[Performance] ${name} took ${duration.toFixed(2)}ms`);
        }
      });
    }

    const duration = performance.now() - start;
    if (duration > SLOW_RENDER_THRESHOLD) {
      console.warn(`[Performance] ${name} took ${duration.toFixed(2)}ms`);
    }

    return result;
  }) as T;
}

export default usePerformanceMonitor;
