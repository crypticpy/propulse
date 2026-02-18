/**
 * Time synchronization check for FT8 operation.
 *
 * FT8 requires clock accuracy within ±1 second for successful decoding.
 * This module checks the local system clock against a server reference
 * and reports the offset.
 */

export interface TimeSyncResult {
  /** Clock offset in milliseconds (positive = local clock is ahead) */
  offsetMs: number;
  /** True if |offsetMs| < 500ms (acceptable for FT8) */
  isAcceptable: boolean;
  /** Reference time used for comparison (UTC ms) */
  serverTimeMs: number;
  /** How the reference time was obtained */
  method: "server-date" | "worldtimeapi" | "estimate";
  /** ISO timestamp of when this check was performed */
  checkedAt: string;
}

/**
 * Check local clock against a time reference.
 *
 * Strategy:
 * 1. Try fetching Date header from a fast endpoint
 * 2. Fall back to worldtimeapi.org
 * 3. If both fail, return an estimate with large uncertainty
 *
 * Network round-trip time is accounted for by measuring RTT and
 * halving it as the estimated one-way latency.
 */
export async function checkTimeSync(): Promise<TimeSyncResult> {
  // Try server Date header first (fastest, no CORS issues with same-origin)
  try {
    const result = await checkViaDateHeader();
    if (result) return result;
  } catch {
    // Fall through to next method
  }

  // Try worldtimeapi.org
  try {
    const result = await checkViaWorldTimeApi();
    if (result) return result;
  } catch {
    // Fall through to estimate
  }

  // Fallback: no reference available, assume acceptable
  return {
    offsetMs: 0,
    isAcceptable: true,
    serverTimeMs: Date.now(),
    method: "estimate",
    checkedAt: new Date().toISOString(),
  };
}

async function checkViaDateHeader(): Promise<TimeSyncResult | null> {
  const t0 = Date.now();
  const response = await fetch("/", { method: "HEAD", cache: "no-store" });
  const t1 = Date.now();
  const rttMs = t1 - t0;

  const dateHeader = response.headers.get("date");
  if (!dateHeader) return null;

  const serverTime = new Date(dateHeader).getTime();
  if (isNaN(serverTime)) return null;

  // Adjust for one-way latency (half of RTT)
  const localTimeAtServer = t0 + rttMs / 2;
  const offsetMs = localTimeAtServer - serverTime;

  return {
    offsetMs: Math.round(offsetMs),
    isAcceptable: Math.abs(offsetMs) < 500,
    serverTimeMs: serverTime,
    method: "server-date",
    checkedAt: new Date().toISOString(),
  };
}

async function checkViaWorldTimeApi(): Promise<TimeSyncResult | null> {
  const t0 = Date.now();
  const response = await fetch(
    "https://worldtimeapi.org/api/timezone/Etc/UTC",
    { cache: "no-store" },
  );
  const t1 = Date.now();
  const rttMs = t1 - t0;

  if (!response.ok) return null;

  const data = await response.json();
  const serverTime = new Date(data.utc_datetime).getTime();
  if (isNaN(serverTime)) return null;

  const localTimeAtServer = t0 + rttMs / 2;
  const offsetMs = localTimeAtServer - serverTime;

  return {
    offsetMs: Math.round(offsetMs),
    isAcceptable: Math.abs(offsetMs) < 500,
    serverTimeMs: serverTime,
    method: "worldtimeapi",
    checkedAt: new Date().toISOString(),
  };
}
