import { timingSafeEqual } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

interface RetentionCounts {
  participants_selected: number;
  outcomes_deleted: number;
  attempts_deleted: number;
  predictions_deleted: number;
}

export interface ResearchRetentionDependencies {
  prune(now: string, limitParticipants: number): Promise<RetentionCounts>;
  now(): Date;
}

const RETENTION_BATCH_SIZE = 1_000;

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function bearerMatches(header: string | null, secret: string): boolean {
  const prefix = "Bearer ";
  const provided = header?.startsWith(prefix) ? header.slice(prefix.length) : "";
  const expectedBytes = Buffer.from(secret);
  const providedBytes = Buffer.from(provided);
  return providedBytes.length === expectedBytes.length &&
    timingSafeEqual(providedBytes, expectedBytes);
}

function defaultDependencies(): ResearchRetentionDependencies | null {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;
  const db = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return {
    async prune(now, limitParticipants) {
      const { data, error } = await db
        .rpc("prune_expired_propagation_research_data", {
          p_now: now,
          p_limit_participants: limitParticipants,
        })
        .single();
      if (error || !data) throw new Error("Research retention prune failed");
      const row = data as RetentionCounts;
      for (const value of Object.values(row)) {
        if (!Number.isSafeInteger(Number(value)) || Number(value) < 0) {
          throw new Error("Research retention returned invalid aggregate counts");
        }
      }
      return row;
    },
    now: () => new Date(),
  };
}

export async function handleResearchRetention(
  request: Request,
  dependencies?: ResearchRetentionDependencies,
): Promise<Response> {
  if (request.method !== "GET") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }
  const cronSecret = process.env.CRON_SECRET ?? "";
  if (cronSecret.length < 32) {
    return jsonResponse({ error: "Server misconfiguration" }, 503);
  }
  if (!bearerMatches(request.headers.get("authorization"), cronSecret)) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }
  const deps = dependencies ?? defaultDependencies();
  if (!deps) return jsonResponse({ error: "Server misconfiguration" }, 503);

  try {
    const result = await deps.prune(
      deps.now().toISOString(),
      RETENTION_BATCH_SIZE,
    );
    return jsonResponse({
      schemaVersion: 1,
      participantsSelected: Number(result.participants_selected),
      rowsDeleted: {
        outcomes: Number(result.outcomes_deleted),
        attempts: Number(result.attempts_deleted),
        predictions: Number(result.predictions_deleted),
      },
    }, 200);
  } catch {
    return jsonResponse({ error: "Research retention unavailable" }, 503);
  }
}

export default async function handler(request: Request): Promise<Response> {
  return handleResearchRetention(request);
}
