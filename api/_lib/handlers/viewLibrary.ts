import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "../../../src/types/supabase";
import { verifyStationOwner } from "../stationAuth";
import { applyRateLimit } from "../rateLimit";
import { sha256Hex } from "./displays";
import { contractIdSchema } from "../../../src/lib/views/spotContracts";
import { displayAssignmentResponseSchema, commitResultSchema, libraryKindSchema, libraryOperationSchema, libraryRecordSchema, validateCommitResult } from "../../../src/lib/views/persistence/schema";

const BODY_LIMIT = 600 * 1024;
function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}
const unavailable = () => json({ status: "unavailable", message: "View library service is unavailable" }, 503);
function serviceClient(): SupabaseClient<Database> | null {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key ? createClient<Database>(url, key, { auth: { persistSession: false, autoRefreshToken: false } }) : null;
}

async function bodyJson(request: Request): Promise<unknown> {
  const reader = request.body?.getReader();
  if (!reader) throw new Error("Missing body");
  let size = 0;
  let body = "";
  const decoder = new TextDecoder();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > BODY_LIMIT) throw new Error("Body limit");
      body += decoder.decode(value, { stream: true });
    }
    return JSON.parse(body + decoder.decode());
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

const cursorSchema = z.object({ kind: libraryKindSchema, id: contractIdSchema }).strict();
const rowSchema = z.object({ owner_id: z.string(), kind: libraryKindSchema, id: contractIdSchema,
  revision: z.number(), value: z.unknown() });

/** Authority is a verified Supabase user, never the body's ownerId or a local-dev bypass. */
export async function handleViewLibrary(request: Request): Promise<Response> {
  if (request.method !== "POST" && request.method !== "GET") return json({ error: "Method not allowed" }, 405);
  const limited = applyRateLimit(request, "views:library", 60, 60);
  if (limited) return limited;
  const owner = await verifyStationOwner(request);
  if (owner instanceof Response) return owner;
  try {
    const db = serviceClient();
    if (!db) return unavailable();
    if (request.method === "POST") {
      let raw: unknown;
      try { raw = await bodyJson(request); } catch { return json({ status: "invalid", message: "Invalid or oversized request" }, 400); }
      const parsed = libraryOperationSchema.safeParse(raw);
      if (!parsed.success) return json({ status: "invalid", message: "Invalid library operation" }, 400);
      const operation = parsed.data;
      if (operation.ownerId !== owner.ownerId) return json({ status: "forbidden", message: "Owner mismatch" }, 403);
      if (operation.kind === "display" && !z.string().uuid().safeParse(operation.id).success) {
        return json({ status: "invalid", message: "Invalid display identity" }, 400);
      }
      const { data, error } = await db.rpc("commit_view_library", { actor: owner.ownerId, op: operation });
      if (error) return unavailable();
      const checked = commitResultSchema.safeParse(data);
      if (!checked.success) return unavailable();
      const result = validateCommitResult(operation, checked.data);
      // Malformed acknowledgements cannot turn an uncertain server commit into a rejected draft.
      if (result.status === "invalid" && (checked.data.status !== "invalid" || result.message !== checked.data.message)) return unavailable();
      return json(result, result.status === "saved" ? 200 : result.status === "conflict" ? 409
        : result.status === "invalid" ? 400 : result.status === "forbidden" ? 403 : 503);
    }
    const after = new URL(request.url).searchParams.get("after");
    let cursor: z.infer<typeof cursorSchema> | null = null;
    if (after) {
      try { cursor = cursorSchema.parse(JSON.parse(after)); } catch { return json({ error: "Invalid cursor" }, 400); }
    }
    let query = db.from("view_library_records").select("owner_id,kind,id,revision,value")
      .eq("owner_id", owner.ownerId).order("kind").order("id").limit(11);
    if (cursor) query = query.or(`kind.gt.${cursor.kind},and(kind.eq.${cursor.kind},id.gt.${cursor.id})`);
    const { data, error } = await query;
    if (error || !Array.isArray(data)) return unavailable();
    const records = [];
    let bytes = 64;
    for (const raw of data) {
      const row = rowSchema.parse(raw);
      if (row.owner_id !== owner.ownerId) return unavailable();
      const record = libraryRecordSchema.parse({ ownerId: row.owner_id, kind: row.kind, id: row.id, revision: row.revision, value: row.value });
      const length = new TextEncoder().encode(JSON.stringify(record)).byteLength + 1;
      if (records.length >= 10 || bytes + length > BODY_LIMIT - 512) break;
      records.push(record); bytes += length;
    }
    if (data.length && !records.length) return unavailable();
    const last = records[records.length - 1];
    return json({ records, nextCursor: records.length < data.length && last ? { kind: last.kind, id: last.id } : null });
  } catch { return unavailable(); }
}

/** Token-bound v1 read; publication also updates the existing scene_config delivery column. */
export async function handleViewDisplayAssignment(request: Request): Promise<Response> {
  if (request.method !== "GET") return json({ error: "Method not allowed" }, 405);
  const limited = applyRateLimit(request, "views:display", 30, 60);
  if (limited) return limited;
  const id = z.string().uuid().safeParse(new URL(request.url).searchParams.get("id"));
  const token = request.headers.get("authorization")?.match(/^Bearer ([a-f0-9]{64})$/i)?.[1];
  if (!id.success || !token) return json({ error: "Invalid display credentials" }, 400);
  try {
    const db = serviceClient();
    if (!db) return unavailable();
    const { data, error } = await db.rpc("read_view_display_assignment", { display_uuid: id.data, token_hash: await sha256Hex(token) });
    if (error) return unavailable();
    if (data === null) return json({ error: "Unknown display" }, 404);
    const result = displayAssignmentResponseSchema.parse(data);
    return json(result);
  } catch { return unavailable(); }
}
