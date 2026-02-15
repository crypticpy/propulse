/**
 * Vercel Edge Function: QSO Batch Sync
 *
 * Handles batch push/pull of QSO log entries with version-based delta sync
 * and conflict detection.
 *
 * POST /api/sync/qso
 * Request: { entries: QSODelta[], sinceVersion: number, deviceId: string }
 * Response: { entries: QSODelta[], latestVersion: number, conflicts: ConflictEntry[] }
 */

import { createClient } from "@supabase/supabase-js";
import { applyRateLimit } from "../_lib/rateLimit";

export const config = {
  runtime: "edge",
};

// ─── Types ──────────────────────────────────────────────────────────────────

interface QSODelta {
  id: string;
  version: number;
  deviceId: string;
  operation: "upsert" | "delete";
  data: Record<string, unknown>;
  updatedAt: string;
}

interface ConflictEntry {
  entryId: string;
  localVersion: number;
  remoteVersion: number;
  conflictFields: string[];
  localData: Record<string, unknown>;
  remoteData: Record<string, unknown>;
}

interface SyncRequest {
  entries: QSODelta[];
  sinceVersion: number;
  deviceId: string;
}

interface SyncResponse {
  entries: QSODelta[];
  latestVersion: number;
  conflicts: ConflictEntry[];
}

// ─── Allowed fields for upsert (whitelist prevents arbitrary data injection) ─

const ALLOWED_FIELDS = new Set([
  "callsign",
  "frequency",
  "mode",
  "band",
  "date",
  "time_on",
  "time_off",
  "rst_sent",
  "rst_rcvd",
  "grid",
  "name",
  "qth",
  "notes",
  "qsl_sent",
  "qsl_rcvd",
  "lotw",
  "eqsl",
  "station_callsign",
  "operator_callsign",
  "is_guest_entry",
  "guest_session_id",
  "dxcc",
  "country",
  "cq_zone",
  "itu_zone",
  "continent",
  "state",
  "tx_power",
  "my_grid",
  "my_rig",
  "my_antenna",
  "prop_mode",
  "sat_name",
  "sat_mode",
  "my_sig",
  "my_sig_info",
  "sig",
  "sig_info",
  "contest_id",
  "srx",
  "stx",
  "srx_string",
  "stx_string",
  "lotw_qsl_sent",
  "lotw_qsl_rcvd",
  "clublog_status",
  "qrzcom_status",
]);

/** Pick only whitelisted fields from client data */
function sanitizeData(data: Record<string, unknown>): Record<string, unknown> {
  const clean: Record<string, unknown> = {};
  for (const key of Object.keys(data)) {
    if (ALLOWED_FIELDS.has(key)) {
      clean[key] = data[key];
    }
  }
  return clean;
}

// ─── Fields that constitute a real conflict (core QSO data) ─────────────────

const CONFLICT_FIELDS = [
  "callsign",
  "frequency",
  "mode",
  "band",
  "date",
  "time_on",
  "time_off",
  "rst_sent",
  "rst_rcvd",
  "grid",
  "name",
  "qth",
  "notes",
];

// ─── Helpers ────────────────────────────────────────────────────────────────

function getAllowedOrigin(): string {
  return process.env.ALLOWED_ORIGIN || "https://propulse.vercel.app";
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-cache",
      "Access-Control-Allow-Origin": getAllowedOrigin(),
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}

/** Detect conflicting fields between a push entry and the current server state */
function detectConflicts(
  pushData: Record<string, unknown>,
  serverRow: Record<string, unknown>,
): string[] {
  const conflicts: string[] = [];
  for (const field of CONFLICT_FIELDS) {
    const pushVal = pushData[field];
    const serverVal = serverRow[field];
    if (pushVal == null && serverVal == null) continue;
    if (pushVal === serverVal) continue;
    if (String(pushVal) === String(serverVal)) continue;
    conflicts.push(field);
  }
  return conflicts;
}

// ─── Batch size limit ───────────────────────────────────────────────────────

const MAX_BATCH_SIZE = 100;
const PULL_BATCH_SIZE = 100;

// ─── Handler ────────────────────────────────────────────────────────────────

export default async function handler(request: Request): Promise<Response> {
  // Handle CORS preflight
  if (request.method === "OPTIONS") {
    return jsonResponse({}, 204);
  }

  const limited = applyRateLimit(request, "sync/qso", 30, 60);
  if (limited) return limited;

  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  // Validate Authorization
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return jsonResponse(
      { error: "Missing or invalid authorization header" },
      401,
    );
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return jsonResponse({ error: "Server misconfiguration" }, 500);
  }

  try {
    const token = authHeader.replace("Bearer ", "");

    // Verify user with anon key + user's JWT
    const authClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });

    const {
      data: { user },
      error: authError,
    } = await authClient.auth.getUser(token);

    if (authError || !user) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    // Parse request body
    const body = (await request.json()) as SyncRequest;
    const { entries: pushEntries, sinceVersion, deviceId } = body;

    if (typeof sinceVersion !== "number" || sinceVersion < 0) {
      return jsonResponse(
        { error: "sinceVersion must be a non-negative number" },
        400,
      );
    }

    if (!deviceId || typeof deviceId !== "string") {
      return jsonResponse({ error: "deviceId is required" }, 400);
    }

    // Use service role key for writes (bypasses RLS), fall back to anon key
    const dbClient = supabaseServiceKey
      ? createClient(supabaseUrl, supabaseServiceKey)
      : authClient;

    const conflicts: ConflictEntry[] = [];
    const processedIds: string[] = [];

    // ── Phase 1: Push entries ──────────────────────────────────────

    if (Array.isArray(pushEntries) && pushEntries.length > 0) {
      // Enforce batch size limit
      const entriesToProcess = pushEntries.slice(0, MAX_BATCH_SIZE);

      // Separate upserts and deletes
      const upserts = entriesToProcess.filter((e) => e.operation === "upsert");
      const deletes = entriesToProcess.filter((e) => e.operation === "delete");

      // Process upserts: check for conflicts then upsert
      if (upserts.length > 0) {
        const ids = upserts.map((e) => e.id);

        // Fetch current server state for conflict detection
        const { data: serverRows } = await dbClient
          .from("log_entries")
          .select("*")
          .in("id", ids)
          .eq("user_id", user.id);

        const serverMap = new Map<string, Record<string, unknown>>();
        if (serverRows) {
          for (const row of serverRows) {
            serverMap.set(row.id as string, row as Record<string, unknown>);
          }
        }

        const rowsToUpsert: Record<string, unknown>[] = [];

        for (const entry of upserts) {
          const serverRow = serverMap.get(entry.id);

          if (serverRow) {
            const serverVersion = (serverRow.version as number) ?? 1;

            // If server has a newer version from a different device, check for conflicts
            if (
              serverVersion > entry.version &&
              serverRow.device_id !== deviceId
            ) {
              const conflictFields = detectConflicts(entry.data, serverRow);

              if (conflictFields.length > 0) {
                conflicts.push({
                  entryId: entry.id,
                  localVersion: entry.version,
                  remoteVersion: serverVersion,
                  conflictFields,
                  localData: entry.data,
                  remoteData: serverRow,
                });
                continue; // Skip this entry — needs client resolution
              }
            }
          }

          // No conflict or new entry — prepare for upsert (sanitized)
          rowsToUpsert.push({
            ...sanitizeData(entry.data),
            id: entry.id,
            user_id: user.id,
            device_id: deviceId,
            updated_at: new Date().toISOString(),
          });
        }

        // Batch upsert non-conflicting entries
        if (rowsToUpsert.length > 0) {
          const { error: upsertError } = await dbClient
            .from("log_entries")
            .upsert(rowsToUpsert, { onConflict: "id" });

          if (!upsertError) {
            for (const row of rowsToUpsert) {
              processedIds.push(row.id as string);
            }
          }
        }
      }

      // Process deletes as soft deletes
      for (const entry of deletes) {
        const now = new Date().toISOString();
        const { error: deleteError } = await dbClient
          .from("log_entries")
          .update({
            deleted_at: now,
            updated_at: now,
            device_id: deviceId,
          })
          .eq("user_id", user.id)
          .eq("id", entry.id);

        if (!deleteError) {
          processedIds.push(entry.id);
        }
      }
    }

    // ── Phase 2: Pull entries since version ────────────────────────

    const { data: pullRows, error: pullError } = await dbClient
      .from("log_entries")
      .select("*")
      .eq("user_id", user.id)
      .gt("version", sinceVersion)
      .order("version", { ascending: true })
      .limit(PULL_BATCH_SIZE);

    if (pullError) {
      return jsonResponse({ error: `Pull failed: ${pullError.message}` }, 500);
    }

    const pullEntries: QSODelta[] = (pullRows ?? []).map(
      (row: Record<string, unknown>) => ({
        id: row.id as string,
        version: (row.version as number) ?? 1,
        deviceId: (row.device_id as string) ?? "",
        operation: (row.deleted_at ? "delete" : "upsert") as
          | "upsert"
          | "delete",
        data: row,
        updatedAt: row.updated_at as string,
      }),
    );

    // Determine latest version
    let latestVersion = sinceVersion;
    for (const entry of pullEntries) {
      if (entry.version > latestVersion) {
        latestVersion = entry.version;
      }
    }

    const response: SyncResponse = {
      entries: pullEntries,
      latestVersion,
      conflicts,
    };

    return jsonResponse(response, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return jsonResponse({ error: `Sync failed: ${message}` }, 500);
  }
}
