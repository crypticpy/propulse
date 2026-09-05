/**
 * Callsign ingestion orchestrator
 *
 * Queries Callook, HamQTH, and QRZ in parallel, then merges results
 * with priority ordering: QRZ > HamQTH > Callook.
 *
 * Gracefully handles missing API keys, 404s, and partial failures.
 */

import { fetchCallook, isCallookError } from "./callook";
import { fetchHamQTH, isHamQTHError } from "./hamqth";
import { fetchQRZ, isQRZError } from "./qrz";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface IngestionResult {
  name?: string;
  grid?: string;
  lat?: number;
  lon?: number;
  country?: string;
  qth?: string;
  licenseClass?: string;
  grantDate?: string;
  expiryDate?: string;
  licenseId?: string;
  bio?: string;
  imageUrl?: string;
  cqzone?: number;
  ituzone?: number;
  /** Which sources contributed data */
  sources: string[];
}

// ─── Callsign normalization ─────────────────────────────────────────────────

/**
 * Strip portable/modifier suffixes from a callsign.
 * Prefer a callsign-shaped segment over suffixes and location prefixes.
 */
export function stripCallsignModifiers(raw: string): string {
  const upper = raw.trim().toUpperCase();
  if (!upper.includes("/")) return upper;

  const segments = upper.split("/").filter(Boolean);
  // Base station calls end in letters after a numeral. This excludes QRP,
  // P, MM, and location-only prefixes such as VP9 even for short K1A calls.
  const candidates = segments.filter(part => /^[A-Z0-9]*[0-9][A-Z]+$/.test(part));
  const parts = candidates.length ? candidates : segments;
  if (parts.length === 0) return upper;
  // Prefer the more specific station call if multiple segments qualify.
  let longest = parts[0];
  for (let i = 1; i < parts.length; i++) {
    if (parts[i].length > longest.length) {
      longest = parts[i];
    }
  }
  return longest;
}

// ─── Orchestrator ───────────────────────────────────────────────────────────

/**
 * Ingest callsign data from all available sources in parallel.
 * Returns merged result with priority: QRZ > HamQTH > Callook.
 * Returns null if all sources fail or return no data.
 */
export async function ingestCallsign(
  rawCallsign: string,
  qrzApiKey?: string,
): Promise<IngestionResult | null> {
  const callsign = stripCallsignModifiers(rawCallsign);
  if (callsign.length < 3) return null;

  // Fire all lookups in parallel
  const promises: Promise<{
    source: string;
    data: Record<string, unknown> | null;
  }>[] = [
    // Callook (US FCC — no auth required)
    fetchCallook(callsign).then((r) => ({
      source: "callook",
      data: isCallookError(r)
        ? null
        : (r as unknown as Record<string, unknown>),
    })),

    // HamQTH (server credentials)
    fetchHamQTH(callsign).then((r) => ({
      source: "hamqth",
      data: isHamQTHError(r) ? null : (r as unknown as Record<string, unknown>),
    })),
  ];

  // QRZ (user's API key — only if provided)
  if (qrzApiKey) {
    promises.push(
      fetchQRZ(callsign, qrzApiKey).then((r) => ({
        source: "qrz",
        data: isQRZError(r) ? null : (r as unknown as Record<string, unknown>),
      })),
    );
  }

  const settled = await Promise.allSettled(promises);

  // Collect successful results keyed by source
  const results: Record<string, Record<string, unknown>> = {};
  const sources: string[] = [];

  for (const entry of settled) {
    if (entry.status === "fulfilled" && entry.value.data) {
      results[entry.value.source] = entry.value.data;
      sources.push(entry.value.source);
    }
  }

  if (sources.length === 0) return null;

  // Merge with priority: QRZ > HamQTH > Callook
  const priority = ["qrz", "hamqth", "callook"];

  function pickString(...keys: string[]): string | undefined {
    for (const src of priority) {
      const d = results[src];
      if (!d) continue;
      for (const k of keys) {
        const val = d[k];
        if (typeof val === "string" && val.length > 0) return val;
      }
    }
    return undefined;
  }

  function pickNumber(...keys: string[]): number | undefined {
    for (const src of priority) {
      const d = results[src];
      if (!d) continue;
      for (const k of keys) {
        const val = d[k];
        if (typeof val === "number" && Number.isFinite(val)) return val;
      }
    }
    return undefined;
  }

  const merged: IngestionResult = {
    name: pickString("name"),
    grid: pickString("grid"),
    lat: pickNumber("lat"),
    lon: pickNumber("lon"),
    country: pickString("country"),
    qth: pickString("qth"),
    licenseClass: pickString("licenseClass"),
    grantDate: pickString("grantDate"),
    expiryDate: pickString("expiryDate"),
    licenseId: pickString("licenseId"),
    bio: pickString("bioText", "bio"),
    imageUrl: pickString("imageUrl", "image", "picture"),
    cqzone: pickNumber("cqzone"),
    ituzone: pickNumber("ituzone"),
    sources,
  };

  // Check if we got any actual data
  const hasData =
    merged.name ||
    merged.grid ||
    merged.country ||
    merged.licenseClass ||
    merged.bio;
  if (!hasData) return null;

  return merged;
}
