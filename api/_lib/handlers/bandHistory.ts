import { applyRateLimit } from "../rateLimit.js";
import { spotJsonResponse, spotOptionsResponse } from "../spotResponse.js";
import { configuredStorage, readBoundedJson } from "../spotStore.js";
import { parseStoredBandHistory } from "../../../src/lib/hamclock/bandHistory.js";

const HOUR = 3_600_000;
const LIMIT = 100;

/** Narrow read of existing public aggregates; never a collector or model write. */
export async function handleSpotsBandHistory(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return spotOptionsResponse();
  if (req.method !== "GET")
    return spotJsonResponse({ error: "Method not allowed" }, 405, {
      Allow: "GET, OPTIONS",
      "Cache-Control": "no-store",
    });
  const limited = applyRateLimit(req, "spots/band-history", 30, 60);
  if (limited) return limited;
  if ([...new URL(req.url).searchParams].length) {
    return spotJsonResponse(
      { error: "History supports the global six-hour window only" },
      400,
      { "Cache-Control": "no-store" },
    );
  }
  const storage = configuredStorage();
  if (!storage)
    return spotJsonResponse({ error: "Spot store not configured" }, 503, {
      "Cache-Control": "no-store",
    });
  const end = Math.floor(Date.now() / HOUR) * HOUR;
  const windowStart = new Date(end - 6 * HOUR).toISOString();
  const windowEnd = new Date(end).toISOString();
  const url = new URL(`${storage.baseUrl}/rest/v1/band_hourly_stats`);
  url.searchParams.set(
    "select",
    "hour_utc,band,spot_count,source_counts,mode_counts",
  );
  url.searchParams.set("hour_utc", `gte.${windowStart}`);
  url.searchParams.append("hour_utc", `lt.${windowEnd}`);
  url.searchParams.set("order", "hour_utc.asc,band.asc");
  url.searchParams.set("limit", String(LIMIT));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        apikey: storage.anonKey,
        Authorization: `Bearer ${storage.anonKey}`,
      },
    });
    if (!response.ok) throw new Error("Upstream failure");
    const payload = await readBoundedJson(response, 128 * 1024);
    if (!Array.isArray(payload) || payload.length >= LIMIT)
      throw new Error("Invalid or truncated history");
    const rows = payload.map(parseStoredBandHistory);
    const keys = new Set<string>();
    for (const row of rows) {
      if (
        !row ||
        row.hour < windowStart ||
        row.hour >= windowEnd ||
        keys.has(`${row.hour}/${row.band}`)
      )
        throw new Error("Invalid history row");
      keys.add(`${row.hour}/${row.band}`);
    }
    return spotJsonResponse(
      {
        rows,
        scope: "global",
        windowStart,
        windowEnd,
        fetchedAt: new Date().toISOString(),
      },
      200,
      { "Cache-Control": "s-maxage=60, stale-while-revalidate=120" },
    );
  } catch {
    return spotJsonResponse(
      {
        error: controller.signal.aborted
          ? "Band history timed out"
          : "Band history unavailable",
      },
      502,
      { "Cache-Control": "no-store" },
    );
  } finally {
    clearTimeout(timer);
  }
}
