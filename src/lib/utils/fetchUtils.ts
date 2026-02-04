/**
 * Fetch Utilities
 *
 * Provides request deduplication, caching, and stale-while-revalidate
 * patterns for data fetching optimization.
 */

// In-flight request tracking for deduplication
const inFlightRequests = new Map<string, Promise<unknown>>();

// Cache for stale-while-revalidate
interface CacheEntry<T> {
  data: T;
  timestamp: number;
  staleTime: number;
  maxAge: number;
}

const responseCache = new Map<string, CacheEntry<unknown>>();

/**
 * Default cache configuration
 */
const DEFAULT_STALE_TIME = 5 * 60 * 1000; // 5 minutes
const DEFAULT_MAX_AGE = 30 * 60 * 1000; // 30 minutes
const CLEANUP_INTERVAL = 60 * 1000; // 1 minute

/**
 * Cleanup expired cache entries periodically
 */
let cleanupScheduled = false;
function scheduleCleanup() {
  if (cleanupScheduled) {
    return;
  }
  cleanupScheduled = true;

  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of responseCache.entries()) {
      if (now - entry.timestamp > entry.maxAge) {
        responseCache.delete(key);
      }
    }
  }, CLEANUP_INTERVAL);
}

/**
 * Generate a cache key from URL and options
 */
function getCacheKey(url: string, options?: RequestInit): string {
  const method = options?.method || "GET";
  const body = options?.body ? JSON.stringify(options.body) : "";
  return `${method}:${url}:${body}`;
}

/**
 * Check if cached data is still fresh
 */
function isFresh<T>(entry: CacheEntry<T>): boolean {
  return Date.now() - entry.timestamp < entry.staleTime;
}

/**
 * Check if cached data is still valid (not expired)
 */
function isValid<T>(entry: CacheEntry<T>): boolean {
  return Date.now() - entry.timestamp < entry.maxAge;
}

export interface DedupeFetchOptions extends RequestInit {
  /** Time in ms before data is considered stale (default: 5 min) */
  staleTime?: number;
  /** Maximum time in ms to keep data in cache (default: 30 min) */
  maxAge?: number;
  /** Skip cache and always fetch fresh data */
  forceRefresh?: boolean;
  /** Use stale-while-revalidate pattern */
  staleWhileRevalidate?: boolean;
}

/**
 * Fetch with request deduplication
 *
 * Multiple simultaneous requests to the same URL will share a single
 * network request, reducing server load and bandwidth.
 *
 * @param url - URL to fetch
 * @param options - Fetch options plus caching configuration
 * @returns Promise resolving to the fetched data
 */
export async function dedupeFetch<T>(
  url: string,
  options: DedupeFetchOptions = {},
): Promise<T> {
  const {
    staleTime = DEFAULT_STALE_TIME,
    maxAge = DEFAULT_MAX_AGE,
    forceRefresh = false,
    staleWhileRevalidate = true,
    ...fetchOptions
  } = options;

  const cacheKey = getCacheKey(url, fetchOptions);

  // Schedule cleanup on first use
  scheduleCleanup();

  // Check cache first (unless force refresh)
  if (!forceRefresh) {
    const cached = responseCache.get(cacheKey) as CacheEntry<T> | undefined;

    if (cached && isValid(cached)) {
      // If fresh, return immediately
      if (isFresh(cached)) {
        return cached.data;
      }

      // If stale but valid and staleWhileRevalidate is enabled,
      // return stale data and revalidate in background
      if (staleWhileRevalidate) {
        // Trigger background revalidation
        revalidateInBackground(url, fetchOptions, cacheKey, staleTime, maxAge);
        return cached.data;
      }
    }
  }

  // Check for in-flight request (deduplication)
  const inFlight = inFlightRequests.get(cacheKey) as Promise<T> | undefined;
  if (inFlight) {
    return inFlight;
  }

  // Create new request
  const request = (async () => {
    try {
      const response = await fetch(url, fetchOptions);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data: T = await response.json();

      // Cache the response
      responseCache.set(cacheKey, {
        data,
        timestamp: Date.now(),
        staleTime,
        maxAge,
      });

      return data;
    } finally {
      // Remove from in-flight requests
      inFlightRequests.delete(cacheKey);
    }
  })();

  // Track in-flight request
  inFlightRequests.set(cacheKey, request);

  return request;
}

/**
 * Revalidate cached data in the background
 */
async function revalidateInBackground(
  url: string,
  fetchOptions: RequestInit,
  cacheKey: string,
  staleTime: number,
  maxAge: number,
): Promise<void> {
  // Don't revalidate if already in flight
  if (inFlightRequests.has(cacheKey)) {
    return;
  }

  // Mark as revalidating
  const revalidateKey = `revalidate:${cacheKey}`;
  if (inFlightRequests.has(revalidateKey)) {
    return;
  }

  const request = (async () => {
    try {
      const response = await fetch(url, fetchOptions);

      if (!response.ok) {
        console.warn(
          `Background revalidation failed for ${url}: ${response.status}`,
        );
        return;
      }

      const data = await response.json();

      // Update cache
      responseCache.set(cacheKey, {
        data,
        timestamp: Date.now(),
        staleTime,
        maxAge,
      });
    } catch (error) {
      console.warn(`Background revalidation error for ${url}:`, error);
    } finally {
      inFlightRequests.delete(revalidateKey);
    }
  })();

  inFlightRequests.set(revalidateKey, request);
}

/**
 * Prefetch and cache data for later use
 *
 * @param url - URL to prefetch
 * @param options - Fetch options
 */
export async function prefetch<T>(
  url: string,
  options: DedupeFetchOptions = {},
): Promise<void> {
  try {
    await dedupeFetch<T>(url, options);
  } catch (error) {
    // Prefetch errors are non-critical
    console.debug(`Prefetch failed for ${url}:`, error);
  }
}

/**
 * Invalidate cached data for a URL
 *
 * @param url - URL to invalidate
 * @param options - Fetch options used to generate cache key
 */
export function invalidateCache(url: string, options?: RequestInit): void {
  const cacheKey = getCacheKey(url, options);
  responseCache.delete(cacheKey);
}

/**
 * Clear all cached data
 */
export function clearCache(): void {
  responseCache.clear();
}

/**
 * Get cache statistics
 */
export function getCacheStats(): {
  size: number;
  entries: Array<{ key: string; age: number; stale: boolean }>;
} {
  const now = Date.now();
  const entries = Array.from(responseCache.entries()).map(([key, entry]) => ({
    key,
    age: now - entry.timestamp,
    stale: !isFresh(entry),
  }));

  return {
    size: responseCache.size,
    entries,
  };
}

/**
 * Create a cached fetch function for a specific endpoint
 *
 * Useful for creating type-safe fetchers with pre-configured caching.
 *
 * @param baseUrl - Base URL for the endpoint
 * @param defaultOptions - Default fetch options
 * @returns Typed fetch function
 */
export function createCachedFetcher<T>(
  baseUrl: string,
  defaultOptions: DedupeFetchOptions = {},
) {
  return async (
    path: string = "",
    options: DedupeFetchOptions = {},
  ): Promise<T> => {
    const url = path ? `${baseUrl}${path}` : baseUrl;
    return dedupeFetch<T>(url, { ...defaultOptions, ...options });
  };
}

/**
 * Batch multiple fetch requests with deduplication
 *
 * @param requests - Array of URL and options pairs
 * @returns Promise resolving to array of results
 */
export async function batchFetch<T>(
  requests: Array<{ url: string; options?: DedupeFetchOptions }>,
): Promise<Array<{ data: T | null; error: Error | null }>> {
  const results = await Promise.allSettled(
    requests.map(({ url, options }) => dedupeFetch<T>(url, options)),
  );

  return results.map((result) => {
    if (result.status === "fulfilled") {
      return { data: result.value, error: null };
    }
    return { data: null, error: result.reason as Error };
  });
}

// Export for testing and debugging
export const __internal = {
  inFlightRequests,
  responseCache,
  getCacheKey,
  isFresh,
  isValid,
};
