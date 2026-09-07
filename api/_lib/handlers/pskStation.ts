import { sharedPskStationCache, type PskStationCache } from "../pskStationCache.js";
import { SaxesParser } from "saxes";
import { applyRateLimit } from "../rateLimit.js";
import { spotJsonResponse, spotOptionsResponse } from "../spotResponse.js";
import {
  canonicalPskCallsign,
  type PskStationReport,
  type PskStationSnapshot,
} from "../../../src/lib/hamclock/pskStation.js";

const REFRESH_MS = 300_000;
const WINDOW_MS = 86_400_000;
const ROW_LIMIT = 1_000;
const BYTE_LIMIT = 2 * 1024 * 1024;
const CACHE_LIMIT = 128;
const GRID = /^[A-R]{2}\d{2}(?:[A-X]{2}(?:\d{2})?)?$/;

function locator(value: string | undefined): string | null {
  const grid = value?.toUpperCase();
  return grid && GRID.test(grid) ? grid : null;
}

/** Strict XML parsing, including the entire bounded document after reaching the row cap. */
export function parsePskStationXml(xml: string, callsign: string, now: number) {
  const parser = new SaxesParser({ xmlns: false });
  const reports: PskStationReport[] = [];
  let depth = 0;
  let discarded = 0;
  let matched = 0;
  parser.on("doctype", () => { throw new Error("Unexpected XML doctype"); });
  parser.on("opentag", (tag) => {
    depth++;
    if (depth > 32 || (depth === 1 && tag.name !== "receptionReports") || /error/i.test(tag.name)) {
      throw new Error("Invalid PSK Reporter envelope");
    }
    if (tag.name !== "receptionReport") return;
    if (depth !== 2) throw new Error("Invalid report nesting");
    const a = tag.attributes;
    const senderCallsign = canonicalPskCallsign(a.senderCallsign ?? "");
    const receiverCallsign = canonicalPskCallsign(a.receiverCallsign ?? "");
    const frequencyHz = Number(a.frequency);
    const observedAt = Number(a.flowStartSeconds) * 1_000;
    const mode = a.mode?.trim().toUpperCase();
    if (!senderCallsign || !receiverCallsign ||
        (senderCallsign !== callsign && receiverCallsign !== callsign) ||
        !Number.isSafeInteger(frequencyHz) || frequencyHz <= 0 ||
        !Number.isFinite(observedAt) || observedAt < now - WINDOW_MS || observedAt > now + 5_000 ||
        !mode || mode.length > 24) {
      discarded++;
      return;
    }
    matched++;
    // Keep a bounded newest-first list throughout parsing, not just in the response.
    // Binary insertion preserves upstream order for equal observation times.
    if (reports.length === ROW_LIMIT && observedAt <= reports[ROW_LIMIT - 1].observedAt) return;
    let low = 0;
    let high = reports.length;
    while (low < high) {
      const middle = Math.floor((low + high) / 2);
      if (reports[middle].observedAt >= observedAt) low = middle + 1;
      else high = middle;
    }
    if (reports.length === ROW_LIMIT) reports.pop();
    const snr = a.sNR?.trim() ? Number(a.sNR) : Number.NaN;
    reports.splice(low, 0, { senderCallsign, receiverCallsign,
      senderLocator: locator(a.senderLocator), receiverLocator: locator(a.receiverLocator),
      frequencyHz, mode, snr: Number.isFinite(snr) ? snr : null, observedAt });
  });
  parser.on("closetag", () => { depth--; });
  parser.write(xml).close();
  return { reports, limited: matched >= ROW_LIMIT, discarded };
}

async function readXml(response: Response): Promise<string> {
  if (!response.body) throw new Error("Missing PSK Reporter body");
  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let bytes = 0;
  let text = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > BYTE_LIMIT) throw new Error("PSK Reporter response too large");
      text += decoder.decode(value, { stream: true });
    }
    return text + decoder.decode();
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

interface CacheEntry {
  snapshot?: PskStationSnapshot;
  pending?: Promise<PskStationSnapshot>;
}

/** Per-process cache and single-flight; CDN caching adds a shared layer in cloud hosting. */
export function createPskStationHandler(shared: PskStationCache = sharedPskStationCache) {
  const cache = new Map<string, CacheEntry>();

  function unavailable(callsign: string, previous?: PskStationSnapshot, retryAt = Date.now() + REFRESH_MS): PskStationSnapshot {
    return { callsign, reports: previous?.reports ?? [], status: previous?.fetchedAt != null ? "stale" : "unavailable",
      fetchedAt: previous?.fetchedAt ?? null, checkedAt: Date.now(), retryAt,
      windowMinutes: 1440, limit: ROW_LIMIT, limited: previous?.limited ?? false, discarded: previous?.discarded ?? 0 };
  }

  async function refresh(callsign: string, previous?: PskStationSnapshot): Promise<PskStationSnapshot> {
    try {
      const claim = await shared.claim(callsign);
      const retained = claim.snapshot ?? previous;
      if (!claim.token) {
        return claim.snapshot && claim.snapshot.retryAt > Date.now()
          ? claim.snapshot : unavailable(callsign, retained, claim.retryAt);
      }
      if (Date.now() >= claim.retryAt - REFRESH_MS) return unavailable(callsign, retained, claim.retryAt);
      const result = await retrieve(callsign, retained);
      // A failed publication never permits another provider call: the durable lease survives.
      try { return await shared.finish(callsign, claim.token, result); }
      catch { return { ...result, retryAt: Math.max(result.retryAt, claim.retryAt) }; }
    } catch { return unavailable(callsign, previous); }
  }

  async function retrieve(callsign: string, previous?: PskStationSnapshot): Promise<PskStationSnapshot> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    try {
      const url = new URL("https://retrieve.pskreporter.info/query");
      url.search = new URLSearchParams({ callsign, flowStartSeconds: "-86400",
        rptlimit: String(ROW_LIMIT), rronly: "1", noactive: "1" }).toString();
      const response = await fetch(url, { signal: controller.signal, redirect: "error" });
      if (!response.ok) throw new Error("PSK Reporter request failed");
      const parsed = parsePskStationXml(await readXml(response), callsign, Date.now());
      const checkedAt = Date.now();
      return { callsign, ...parsed, status: "ok", fetchedAt: checkedAt, checkedAt,
        retryAt: checkedAt + REFRESH_MS, windowMinutes: 1440, limit: ROW_LIMIT };
    } catch {
      const checkedAt = Date.now();
      return { callsign, reports: previous?.reports ?? [],
        status: previous?.fetchedAt != null ? "stale" : "unavailable",
        fetchedAt: previous?.fetchedAt ?? null, checkedAt, retryAt: checkedAt + REFRESH_MS,
        windowMinutes: 1440, limit: ROW_LIMIT, limited: previous?.limited ?? false,
        discarded: previous?.discarded ?? 0 };
    } finally {
      clearTimeout(timer);
    }
  }

  return async (req: Request): Promise<Response> => {
    if (req.method === "OPTIONS") return spotOptionsResponse();
    if (req.method !== "GET") return spotJsonResponse({ error: "Method not allowed" }, 405,
      { Allow: "GET, OPTIONS", "Cache-Control": "no-store" });
    const callsign = canonicalPskCallsign(new URL(req.url).searchParams.get("callsign") ?? "");
    if (!callsign) return spotJsonResponse({ error: "A valid callsign is required" }, 400,
      { "Cache-Control": "no-store" });
    const limited = applyRateLimit(req, "spots/psk-station", 30, 60);
    if (limited) return limited;
    const now = Date.now();
    let entry = cache.get(callsign);
    if (!entry?.pending && (!entry?.snapshot || now >= entry.snapshot.retryAt)) {
      // Never evict a fresh entry: doing so would allow another upstream request inside five minutes.
      for (const [key, value] of cache) {
        if (cache.size >= CACHE_LIMIT && key !== callsign && !value.pending && value.snapshot && now >= value.snapshot.retryAt) cache.delete(key);
      }
      if (!entry && cache.size >= CACHE_LIMIT) return spotJsonResponse({ error: "Station feed busy" }, 503,
        { "Cache-Control": "no-store", "Retry-After": "300" });
      entry ??= {};
      cache.set(callsign, entry);
      const current = entry;
      current.pending = refresh(callsign, current.snapshot).then((snapshot) => {
        current.snapshot = snapshot;
        current.pending = undefined;
        return snapshot;
      });
    }
    const snapshot = await (entry!.pending ?? Promise.resolve(entry!.snapshot!));
    const remaining = Math.max(0, Math.ceil((snapshot.retryAt - Date.now()) / 1_000));
    return spotJsonResponse(snapshot, snapshot.status === "unavailable" ? 502 : 200, {
      "Cache-Control": `public, max-age=0, s-maxage=${remaining}`,
      "Retry-After": String(remaining),
    });
  };
}

export const handlePskStation = createPskStationHandler();
