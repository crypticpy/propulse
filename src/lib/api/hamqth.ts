/**
 * HamQTH API client functions
 * These functions call our API proxy to fetch callsign lookup data
 * from HamQTH.com for amateur radio station information
 */

/**
 * HamQTH lookup result containing station information
 */
export interface HamQTHLookupResult {
  /** The callsign that was looked up */
  callsign: string;
  /** Operator's name */
  name?: string;
  /** Maidenhead grid locator */
  grid?: string;
  /** Location/city name */
  qth?: string;
  /** Country name */
  country?: string;
  /** CQ zone number (1-40) */
  cqzone?: number;
  /** ITU zone number (1-90) */
  ituzone?: number;
  /** Latitude in decimal degrees */
  lat?: number;
  /** Longitude in decimal degrees */
  lon?: number;
  /** Operator bio/about text */
  bio?: string;
  /** Profile picture URL */
  picture?: string;
  /** Personal website URL */
  web?: string;
  /** Data source identifier */
  source: "hamqth";
}

/**
 * HamQTH error response
 */
export interface HamQTHError {
  status?: number;
  /** Error message describing what went wrong */
  error: string;
  /** Provider identifier */
  provider: "hamqth";
}

/**
 * Type guard to check if a result is an error
 */
export function isHamQTHError(
  result: HamQTHLookupResult | HamQTHError,
): result is HamQTHError {
  return "error" in result && "provider" in result;
}

/**
 * Fetch callsign information from HamQTH
 * Never throws - always returns a typed result or error object
 *
 * @param callsign - The amateur radio callsign to look up
 * @param sessionId - Optional session ID for session reuse
 * @returns Promise<HamQTHLookupResult | HamQTHError> - Lookup result or error
 */
export async function fetchHamQTH(
  callsign: string,
  sessionId?: string,
): Promise<HamQTHLookupResult | HamQTHError> {
  const normalizedCallsign = callsign.trim().toUpperCase();

  if (!normalizedCallsign) {
    return {
      error: "Callsign is required",
      provider: "hamqth",
    };
  }

  try {
    const params = new URLSearchParams({ callsign: normalizedCallsign });
    if (sessionId) {
      params.append("sessionId", sessionId);
    }

    const { authHeaders } = await import("@/lib/api/authFetch");
    const url = `/api/callsign/hamqth?${params.toString()}`;
    const response = await fetch(url, {
      headers: await authHeaders(),
    });

    if (!response.ok) {
      // Try to extract error message from response body
      try {
        const errorData = await response.json();
        return {
          error:
            errorData.error ||
            `HTTP error ${response.status}: ${response.statusText}`,
          provider: "hamqth",
          status: response.status,
        };
      } catch {
        return {
          error: `HTTP error ${response.status}: ${response.statusText}`,
          provider: "hamqth",
          status: response.status,
        };
      }
    }

    const data = await response.json();

    // Check if the API returned an error in the response body
    if (data.error) {
      return {
        error: data.error,
        provider: "hamqth",
      };
    }

    // Return successful lookup result
    // Use explicit null/undefined checks to preserve valid zero values
    return {
      callsign: data.callsign || normalizedCallsign,
      name: data.name,
      grid: data.grid,
      qth: data.qth,
      country: data.country,
      cqzone:
        data.cqzone !== undefined && data.cqzone !== null
          ? Number(data.cqzone)
          : undefined,
      ituzone:
        data.ituzone !== undefined && data.ituzone !== null
          ? Number(data.ituzone)
          : undefined,
      lat:
        data.lat !== undefined && data.lat !== null
          ? Number(data.lat)
          : undefined,
      lon:
        data.lon !== undefined && data.lon !== null
          ? Number(data.lon)
          : undefined,
      bio: data.bio,
      picture: data.picture,
      web: data.web,
      source: "hamqth",
    };
  } catch (error) {
    // Network errors, JSON parse errors, etc.
    return {
      error: error instanceof Error ? error.message : "Unknown error occurred",
      provider: "hamqth",
    };
  }
}

/**
 * Creates a debounced version of an async function
 * Useful for input handling to avoid excessive API calls
 *
 * @param fn - The async function to debounce
 * @param ms - Delay in milliseconds (recommended: 300ms)
 * @returns Debounced version of the function
 */
export function debounce<
  T extends (...args: Parameters<T>) => Promise<ReturnType<T>>,
>(fn: T, ms: number): (...args: Parameters<T>) => Promise<ReturnType<T>> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let pendingPromise: Promise<ReturnType<T>> | null = null;
  let resolveRef: ((value: ReturnType<T>) => void) | null = null;
  let rejectRef: ((reason: unknown) => void) | null = null;

  return (...args: Parameters<T>): Promise<ReturnType<T>> => {
    // Clear any existing timeout
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
    }

    // If there's no pending promise, create one
    if (!pendingPromise) {
      pendingPromise = new Promise<ReturnType<T>>((resolve, reject) => {
        resolveRef = resolve;
        rejectRef = reject;
      });
    }

    // Set up new timeout
    timeoutId = setTimeout(async () => {
      const currentResolve = resolveRef;
      const currentReject = rejectRef;

      // Reset state for next call
      pendingPromise = null;
      resolveRef = null;
      rejectRef = null;
      timeoutId = null;

      try {
        const result = await fn(...args);
        currentResolve?.(result);
      } catch (error) {
        currentReject?.(error);
      }
    }, ms);

    return pendingPromise;
  };
}
