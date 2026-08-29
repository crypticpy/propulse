/**
 * Display Wall handlers (E3) — portable by construction (dev plan §0).
 *
 * Pure (Request) => Response functions with no Vercel-isms; the files under
 * api/displays/ are 3-line wrappers, and Shack Server (E5) can mount these
 * directly. Uses Web Crypto only (edge- and Node-compatible).
 *
 * Device identity: at registration the device receives a bearer token once;
 * only its sha256 hex lands in displays.device_token_hash. The device never
 * talks to PostgREST — both endpoints here run under the service role, and
 * owner management happens client-side under RLS.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { verifyAuth } from "../auth";
import { applyRateLimit } from "../rateLimit";

/** Unambiguous pairing-code alphabet (no 0/O/1/I) */
export const PAIRING_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const PAIRING_CODE_LENGTH = 6;
const PAIRING_CODE_TTL_MS = 10 * 60 * 1000;
const MAX_NAME_LENGTH = 60;

export function generatePairingCode(): string {
  const bytes = new Uint8Array(PAIRING_CODE_LENGTH);
  crypto.getRandomValues(bytes);
  let code = "";
  for (const byte of bytes) {
    code += PAIRING_CODE_ALPHABET[byte % PAIRING_CODE_ALPHABET.length];
  }
  return code;
}

/** Uppercase and strip separators/ambiguous glyphs users may type */
export function normalizePairingCode(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/[\s-]/g, "")
    .replace(/0/g, "O")
    .replace(/1/g, "I");
}

export function isValidPairingCode(code: string): boolean {
  if (code.length !== PAIRING_CODE_LENGTH) return false;
  for (const ch of code) {
    if (!PAIRING_CODE_ALPHABET.includes(ch)) return false;
  }
  return true;
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function generateDeviceToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ─── Response helpers ───────────────────────────────────────────────────────

function getAllowedOrigin(): string {
  return process.env.ALLOWED_ORIGIN || "https://propulse.vercel.app";
}

function corsHeaders(methods: string): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": getAllowedOrigin(),
    "Access-Control-Allow-Methods": methods,
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}

function jsonResponse(
  body: unknown,
  status: number,
  methods: string,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-cache",
      ...corsHeaders(methods),
    },
  });
}

function serviceClient(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;
  return createClient(url, serviceKey);
}

// ─── POST /api/displays/pair ────────────────────────────────────────────────

interface RegisterBody {
  action: "register";
}

interface ClaimBody {
  action: "claim";
  code: string;
  name?: string;
}

type PairBody = RegisterBody | ClaimBody;

/**
 * action "register" (anon, device): mint a display row + device token +
 * short-lived pairing code. The token is returned exactly once.
 *
 * action "claim" (authenticated owner): burn an unexpired code, take
 * ownership of its display, optionally name it.
 */
export async function handleDisplayPair(request: Request): Promise<Response> {
  const METHODS = "POST, OPTIONS";
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(METHODS) });
  }
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405, METHODS);
  }

  let body: PairBody;
  try {
    body = (await request.json()) as PairBody;
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400, METHODS);
  }

  const db = serviceClient();
  if (!db) {
    return jsonResponse({ error: "Display Wall not configured" }, 503, METHODS);
  }

  if (body.action === "register") {
    const limited = applyRateLimit(request, "displays:register", 6, 600);
    if (limited) return limited;

    const deviceToken = generateDeviceToken();
    const tokenHash = await sha256Hex(deviceToken);

    const { data: display, error: insertError } = await db
      .from("displays")
      .insert({ device_token_hash: tokenHash })
      .select("id")
      .single();
    if (insertError || !display) {
      return jsonResponse({ error: "Failed to register display" }, 500, METHODS);
    }

    // Codes are random over 32^6 (~1e9); retry a couple of times in the
    // astronomically unlikely event of a live collision.
    const expiresAt = new Date(Date.now() + PAIRING_CODE_TTL_MS).toISOString();
    let code: string | null = null;
    for (let attempt = 0; attempt < 3 && !code; attempt++) {
      const candidate = generatePairingCode();
      const { error: codeError } = await db
        .from("display_pairing_codes")
        .insert({ code: candidate, display_id: display.id, expires_at: expiresAt });
      if (!codeError) code = candidate;
    }
    if (!code) {
      return jsonResponse({ error: "Failed to mint pairing code" }, 500, METHODS);
    }

    return jsonResponse(
      { displayId: display.id, deviceToken, code, expiresAt },
      201,
      METHODS,
    );
  }

  if (body.action === "claim") {
    const limited = applyRateLimit(request, "displays:claim", 12, 600);
    if (limited) return limited;

    const auth = await verifyAuth(request);
    if (auth instanceof Response) return auth;

    const code = normalizePairingCode(String(body.code ?? ""));
    if (!isValidPairingCode(code)) {
      return jsonResponse({ error: "Invalid pairing code" }, 400, METHODS);
    }

    // Burn the code atomically: only an unclaimed, unexpired row updates.
    const { data: burned, error: burnError } = await db
      .from("display_pairing_codes")
      .update({ claimed_at: new Date().toISOString() })
      .eq("code", code)
      .is("claimed_at", null)
      .gt("expires_at", new Date().toISOString())
      .select("display_id");
    if (burnError || !burned || burned.length === 0) {
      return jsonResponse({ error: "Code not found or expired" }, 404, METHODS);
    }
    const displayId = burned[0].display_id as string;

    const update: Record<string, unknown> = { owner: auth.user.id };
    if (typeof body.name === "string" && body.name.trim()) {
      update.name = body.name.trim().slice(0, MAX_NAME_LENGTH);
    }
    const { data: claimed, error: claimError } = await db
      .from("displays")
      .update(update)
      .eq("id", displayId)
      .is("owner", null)
      .select("id, name");
    if (claimError || !claimed || claimed.length === 0) {
      return jsonResponse({ error: "Display already claimed" }, 409, METHODS);
    }

    return jsonResponse(
      { displayId: claimed[0].id, name: claimed[0].name },
      200,
      METHODS,
    );
  }

  return jsonResponse({ error: "Unknown action" }, 400, METHODS);
}

// ─── GET /api/displays/state ────────────────────────────────────────────────

/**
 * Device poll: GET ?id=<uuid> with the device token as a Bearer token in
 * the Authorization header (never in the query string — proxies log URLs).
 * Verifies the token hash, bumps last_seen_at (which does NOT touch
 * updated_at — see the migration trigger), and returns pairing status +
 * assigned scene config.
 */
export async function handleDisplayState(request: Request): Promise<Response> {
  const METHODS = "GET, OPTIONS";
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(METHODS) });
  }
  if (request.method !== "GET") {
    return jsonResponse({ error: "Method not allowed" }, 405, METHODS);
  }

  const limited = applyRateLimit(request, "displays:state", 30, 60);
  if (limited) return limited;

  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length)
    : null;
  if (!id || !token) {
    return jsonResponse(
      { error: "id query param and Bearer token are required" },
      400,
      METHODS,
    );
  }

  const db = serviceClient();
  if (!db) {
    return jsonResponse({ error: "Display Wall not configured" }, 503, METHODS);
  }

  const { data: display, error } = await db
    .from("displays")
    .select("id, owner, name, scene_config, device_token_hash, updated_at")
    .eq("id", id)
    .maybeSingle();
  if (error) {
    return jsonResponse({ error: "Lookup failed" }, 500, METHODS);
  }

  const tokenHash = await sha256Hex(token);
  if (!display || display.device_token_hash !== tokenHash) {
    // Same answer for missing row and bad token: no oracle.
    return jsonResponse({ error: "Unknown display" }, 404, METHODS);
  }

  await db
    .from("displays")
    .update({ last_seen_at: new Date().toISOString() })
    .eq("id", id);

  return jsonResponse(
    {
      paired: display.owner !== null,
      name: display.name,
      sceneConfig: display.scene_config,
      updatedAt: display.updated_at,
    },
    200,
    METHODS,
  );
}
