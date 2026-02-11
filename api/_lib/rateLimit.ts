/**
 * Edge Function Rate Limiter
 *
 * In-memory sliding-window rate limiter for Vercel Edge Functions.
 * Uses a global Map with automatic TTL cleanup.
 *
 * Limitations:
 * - Per-isolate memory (not shared across regions/instances)
 * - Resets on cold start
 * - Good enough for launch; upgrade to Vercel KV for multi-region
 */

// ─── Types ───────────────────────────────────────────────────────────────────

interface RateLimitResult {
  success: boolean;
  remaining: number;
  reset: number; // seconds until window resets
}

// ─── Storage ─────────────────────────────────────────────────────────────────

interface WindowEntry {
  count: number;
  expiresAt: number;
}

const store = new Map<string, WindowEntry>();

// Cleanup stale entries periodically (every 60s)
let lastCleanup = Date.now();
function cleanup() {
  const now = Date.now();
  if (now - lastCleanup < 60_000) return;
  lastCleanup = now;
  for (const [key, entry] of store) {
    if (entry.expiresAt < now) store.delete(key);
  }
}

// ─── Rate Limit Check ────────────────────────────────────────────────────────

/**
 * Check rate limit for a given identifier and endpoint.
 *
 * @param endpoint - Logical name for the endpoint (e.g. "callsign/hamqth")
 * @param identifier - Unique client identifier (usually IP address)
 * @param limit - Maximum requests per window
 * @param windowSeconds - Window duration in seconds
 */
export function checkRateLimit(
  endpoint: string,
  identifier: string,
  limit: number,
  windowSeconds: number,
): RateLimitResult {
  cleanup();

  const now = Date.now();
  const windowMs = windowSeconds * 1000;
  const key = `rl:${endpoint}:${identifier}`;

  const entry = store.get(key);

  if (!entry || entry.expiresAt < now) {
    // New window
    store.set(key, { count: 1, expiresAt: now + windowMs });
    return { success: true, remaining: limit - 1, reset: windowSeconds };
  }

  // Existing window
  entry.count++;
  const reset = Math.ceil((entry.expiresAt - now) / 1000);

  if (entry.count > limit) {
    return { success: false, remaining: 0, reset };
  }

  return { success: true, remaining: limit - entry.count, reset };
}

// ─── Response Helpers ────────────────────────────────────────────────────────

/**
 * Extract client IP from request headers (Vercel Edge).
 */
export function getClientIP(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}

/**
 * Create a 429 Too Many Requests response.
 */
export function rateLimitResponse(origin: string, reset: number): Response {
  return new Response(
    JSON.stringify({
      error: "Too many requests. Please try again later.",
    }),
    {
      status: 429,
      headers: {
        "Content-Type": "application/json",
        "Retry-After": String(reset),
        "Access-Control-Allow-Origin": origin,
      },
    },
  );
}

/**
 * Apply rate limiting to a request. Returns a 429 Response if limited, or null if allowed.
 *
 * Usage at top of handler:
 * ```
 * const limited = applyRateLimit(request, "callsign/hamqth", 30, 60);
 * if (limited) return limited;
 * ```
 */
export function applyRateLimit(
  request: Request,
  endpoint: string,
  limit: number,
  windowSeconds: number,
): Response | null {
  const ip = getClientIP(request);
  const result = checkRateLimit(endpoint, ip, limit, windowSeconds);

  if (!result.success) {
    const origin =
      request.headers.get("origin") ||
      process.env.ALLOWED_ORIGIN ||
      "https://propulse.vercel.app";
    return rateLimitResponse(origin, result.reset);
  }

  return null;
}
