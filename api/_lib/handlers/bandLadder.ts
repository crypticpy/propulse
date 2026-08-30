/**
 * Canonical Band Health ladder feed (BH2) — serves verdict_states, the
 * collector-evaluated five-state ladder per scope (global per band,
 * regional per band × continent). This is the scored record (§6); client
 * ladders are UI-only. Rows carry provenance: opened_at, the surprise
 * flag, and the last tick's inputs (obs, reporters, trend, source and
 * mode-class mixes).
 */

import { applyRateLimit } from "../rateLimit.js";
import { spotJsonResponse, spotOptionsResponse } from "../spotResponse.js";
import { configuredStorage, readBoundedJson } from "../spotStore.js";

const READ_TIMEOUT_MS = 5_000;
const RESPONSE_BYTE_LIMIT = 128 * 1024;

const LADDER_STATES = new Set([
  "closed",
  "forecast",
  "stirring",
  "verified",
  "hot",
]);

export interface VerdictScopeRow {
  band: string;
  scope_type: "global" | "regional";
  scope_key: string;
  state: string;
  stable_since: string;
  candidate: string | null;
  candidate_since: string | null;
  surprise: boolean;
  opened_at: string | null;
  inputs: Record<string, unknown>;
  updated_at: string;
}

export function parseVerdictScopeRow(value: unknown): VerdictScopeRow | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (
    typeof row.band !== "string" ||
    row.band.length === 0 ||
    (row.scope_type !== "global" && row.scope_type !== "regional") ||
    typeof row.scope_key !== "string" ||
    typeof row.state !== "string" ||
    !LADDER_STATES.has(row.state) ||
    typeof row.stable_since !== "string" ||
    typeof row.updated_at !== "string"
  ) {
    return null;
  }
  return {
    band: row.band,
    scope_type: row.scope_type,
    scope_key: row.scope_key,
    state: row.state,
    stable_since: row.stable_since,
    candidate: typeof row.candidate === "string" ? row.candidate : null,
    candidate_since:
      typeof row.candidate_since === "string" ? row.candidate_since : null,
    surprise: row.surprise === true,
    opened_at: typeof row.opened_at === "string" ? row.opened_at : null,
    inputs:
      row.inputs && typeof row.inputs === "object" && !Array.isArray(row.inputs)
        ? (row.inputs as Record<string, unknown>)
        : {},
    updated_at: row.updated_at,
  };
}

export async function handleSpotsBandLadder(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") {
    return spotOptionsResponse();
  }
  if (req.method !== "GET") {
    return spotJsonResponse({ error: "Method not allowed", scopes: [] }, 405, {
      Allow: "GET, OPTIONS",
      "Cache-Control": "no-store",
    });
  }

  const limited = applyRateLimit(req, "spots/band-ladder", 30, 60);
  if (limited) return limited;

  const storage = configuredStorage();
  if (!storage) {
    return spotJsonResponse(
      { error: "Spot store not configured", scopes: [] },
      503,
      { "Cache-Control": "s-maxage=15, stale-while-revalidate=60" },
    );
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), READ_TIMEOUT_MS);
    let response: Response;
    try {
      const query = new URLSearchParams({
        select:
          "band,scope_type,scope_key,state,stable_since,candidate,candidate_since,surprise,opened_at,inputs,updated_at",
        order: "scope_type.asc,scope_key.asc,band.asc",
      });
      response = await fetch(
        `${storage.baseUrl}/rest/v1/verdict_states?${query}`,
        {
          headers: {
            Accept: "application/json",
            apikey: storage.anonKey,
            Authorization: `Bearer ${storage.anonKey}`,
          },
          redirect: "error",
          signal: controller.signal,
        },
      );
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      return spotJsonResponse(
        { error: `Spot store returned ${response.status}`, scopes: [] },
        502,
        { "Cache-Control": "s-maxage=15, stale-while-revalidate=60" },
      );
    }

    const payload = await readBoundedJson(response, RESPONSE_BYTE_LIMIT);
    const scopes = Array.isArray(payload)
      ? payload
          .map(parseVerdictScopeRow)
          .filter((row): row is VerdictScopeRow => row !== null)
      : [];

    return spotJsonResponse(
      {
        scopes,
        meta: {
          schemaVersion: 1,
          fetchedAt: new Date().toISOString(),
        },
      },
      200,
      { "Cache-Control": "s-maxage=30, stale-while-revalidate=120" },
    );
  } catch (err) {
    const message =
      err instanceof Error && err.name === "AbortError"
        ? "Spot store timed out"
        : "Spot store unavailable";
    return spotJsonResponse({ error: message, scopes: [] }, 502, {
      "Cache-Control": "s-maxage=15, stale-while-revalidate=60",
    });
  }
}
