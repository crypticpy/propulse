/**
 * Memoization Utilities
 *
 * Helper functions for creating optimized comparison functions
 * and memoization strategies for React components.
 */

/**
 * Shallow compare two objects
 * Returns true if all keys have the same values (using ===)
 */
export function shallowEqual<T extends Record<string, unknown>>(
  objA: T,
  objB: T,
): boolean {
  if (objA === objB) return true;
  if (!objA || !objB) return false;

  const keysA = Object.keys(objA);
  const keysB = Object.keys(objB);

  if (keysA.length !== keysB.length) return false;

  for (const key of keysA) {
    if (objA[key] !== objB[key]) {
      return false;
    }
  }

  return true;
}

/**
 * Deep compare two values
 * Handles objects, arrays, and primitive values
 */
export function deepEqual<T>(a: T, b: T): boolean {
  if (a === b) return true;

  if (typeof a !== typeof b) return false;
  if (a === null || b === null) return a === b;
  if (typeof a !== "object") return false;

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((item, index) => deepEqual(item, b[index]));
  }

  if (Array.isArray(a) || Array.isArray(b)) return false;

  const keysA = Object.keys(a as Record<string, unknown>);
  const keysB = Object.keys(b as Record<string, unknown>);

  if (keysA.length !== keysB.length) return false;

  return keysA.every((key) =>
    deepEqual(
      (a as Record<string, unknown>)[key],
      (b as Record<string, unknown>)[key],
    ),
  );
}

/**
 * Create a comparison function that only compares specified keys
 */
export function createKeyCompare<T extends Record<string, unknown>>(
  keys: Array<keyof T>,
): (a: T, b: T) => boolean {
  return (a: T, b: T): boolean => {
    for (const key of keys) {
      if (a[key] !== b[key]) {
        return false;
      }
    }
    return true;
  };
}

/**
 * Create a comparison function that excludes specified keys
 */
export function createExcludeKeyCompare<T extends Record<string, unknown>>(
  excludeKeys: Array<keyof T>,
): (a: T, b: T) => boolean {
  const excludeSet = new Set(excludeKeys as string[]);

  return (a: T, b: T): boolean => {
    const keysA = Object.keys(a).filter((k) => !excludeSet.has(k));
    const keysB = Object.keys(b).filter((k) => !excludeSet.has(k));

    if (keysA.length !== keysB.length) return false;

    for (const key of keysA) {
      if (a[key as keyof T] !== b[key as keyof T]) {
        return false;
      }
    }
    return true;
  };
}

/**
 * Create a comparison function with custom comparators for specific keys
 */
export function createCustomCompare<T extends Record<string, unknown>>(
  comparators: Partial<Record<keyof T, (a: unknown, b: unknown) => boolean>>,
): (a: T, b: T) => boolean {
  return (a: T, b: T): boolean => {
    const keys = Object.keys(a);

    for (const key of keys) {
      const comparator = comparators[key as keyof T];
      if (comparator) {
        if (!comparator(a[key as keyof T], b[key as keyof T])) {
          return false;
        }
      } else if (a[key as keyof T] !== b[key as keyof T]) {
        return false;
      }
    }
    return true;
  };
}

/**
 * Compare arrays by reference (useful for array props)
 */
export function arrayRefEqual<T>(a: T[], b: T[]): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  if (a.length !== b.length) return false;

  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/**
 * Compare dates by timestamp
 */
export function dateEqual(
  a: Date | null | undefined,
  b: Date | null | undefined,
): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.getTime() === b.getTime();
}

/**
 * Compare functions by reference (always returns true to ignore function changes)
 * Useful when callbacks are recreated on each render
 */
export function ignoreCallback(): boolean {
  return true;
}

/**
 * Memoize a function with a custom cache
 */
export function memoize<Args extends unknown[], Result>(
  fn: (...args: Args) => Result,
  options: {
    /** Max cache size (LRU eviction) */
    maxSize?: number;
    /** Custom key generator */
    getKey?: (...args: Args) => string;
    /** TTL in milliseconds */
    ttl?: number;
  } = {},
): ((...args: Args) => Result) & {
  cache: Map<string, { value: Result; timestamp: number }>;
} {
  const { maxSize = 100, getKey, ttl } = options;
  const cache = new Map<string, { value: Result; timestamp: number }>();

  const memoized = (...args: Args): Result => {
    const key = getKey ? getKey(...args) : JSON.stringify(args);
    const cached = cache.get(key);

    // Check TTL
    if (cached) {
      if (!ttl || Date.now() - cached.timestamp < ttl) {
        return cached.value;
      }
      cache.delete(key);
    }

    const result = fn(...args);

    // Enforce max size (LRU eviction)
    if (cache.size >= maxSize) {
      const firstKey = cache.keys().next().value;
      if (firstKey) cache.delete(firstKey);
    }

    cache.set(key, { value: result, timestamp: Date.now() });
    return result;
  };

  // Expose cache for debugging/clearing
  memoized.cache = cache;

  return memoized;
}

/**
 * Create a stable callback that doesn't change reference
 * unless dependencies change
 */
export function createStableCallback<T extends (...args: unknown[]) => unknown>(
  callback: T,
  deps: unknown[],
): T {
  const ref = { callback, deps };

  return ((...args: Parameters<T>) => {
    return ref.callback(...args);
  }) as T;
}

/**
 * Debounce a value change
 * Useful for reducing updates in useMemo dependencies
 */
export function debounceValue<T>(
  value: T,
  delay: number,
  previousValue: T | undefined,
  lastChangeTime: number,
): { value: T; lastChangeTime: number } {
  const now = Date.now();

  if (previousValue === undefined || value === previousValue) {
    return { value, lastChangeTime };
  }

  if (now - lastChangeTime < delay) {
    return { value: previousValue, lastChangeTime };
  }

  return { value, lastChangeTime: now };
}

/**
 * Common comparison functions for React.memo
 */
export const MemoComparisons = {
  /**
   * Compare all props shallowly
   */
  shallow: shallowEqual,

  /**
   * Compare all props deeply
   */
  deep: deepEqual,

  /**
   * Always re-render (equivalent to not using memo)
   */
  never: () => false,

  /**
   * Never re-render (use with extreme caution)
   */
  always: () => true,

  /**
   * Compare ignoring callback props
   */
  ignoreCallbacks: <T extends Record<string, unknown>>(a: T, b: T): boolean => {
    const keysA = Object.keys(a);
    for (const key of keysA) {
      const valueA = a[key];
      const valueB = b[key as keyof T];

      // Skip function comparisons
      if (typeof valueA === "function" && typeof valueB === "function") {
        continue;
      }

      if (valueA !== valueB) {
        return false;
      }
    }
    return true;
  },
} as const;

export default {
  shallowEqual,
  deepEqual,
  createKeyCompare,
  createExcludeKeyCompare,
  createCustomCompare,
  arrayRefEqual,
  dateEqual,
  ignoreCallback,
  memoize,
  MemoComparisons,
};
