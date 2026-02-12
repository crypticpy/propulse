/**
 * Vercel Edge Function: Cross-Net Recommendations
 *
 * Returns nets that share the most participants with the given net.
 * "Operators who check into this net also check into..."
 *
 * GET /api/nets/recommendations/<netId>
 *
 * Response: { recommendations: [{ netId, name, frequency, overlapCount }] }
 */

import { createClient } from "@supabase/supabase-js";
import { applyRateLimit } from "../../_lib/rateLimit";

export const config = {
  runtime: "edge",
};

function getAllowedOrigin(): string {
  return process.env.ALLOWED_ORIGIN || "https://propulse.vercel.app";
}

function jsonResponse(
  body: unknown,
  status: number,
  cacheControl?: string,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": cacheControl ?? "no-cache",
      "Access-Control-Allow-Origin": getAllowedOrigin(),
      "Access-Control-Allow-Methods": "GET, OPTIONS",
    },
  });
}

export default async function handler(request: Request): Promise<Response> {
  // CORS preflight
  if (request.method === "OPTIONS") {
    return jsonResponse({}, 204);
  }

  if (request.method !== "GET") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  // Rate limit: 30 req/min/IP
  const limited = applyRateLimit(request, "nets/recommendations", 30, 60);
  if (limited) return limited;

  // Parse netId from URL path (last segment)
  const url = new URL(request.url);
  const pathSegments = url.pathname.split("/");
  const netId = pathSegments[pathSegments.length - 1] || "";

  if (!netId) {
    return jsonResponse({ error: "Missing net ID" }, 400);
  }

  // Validate UUID format to prevent injection
  const UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!UUID_RE.test(netId)) {
    return jsonResponse({ error: "Invalid net ID format" }, 400);
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    return jsonResponse({ error: "Server misconfiguration" }, 500);
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Step 1: Get completed session IDs for this net
    const { data: sessions, error: sessionErr } = await supabase
      .from("net_sessions")
      .select("id")
      .eq("net_id", netId)
      .eq("status", "completed")
      .limit(100);

    if (sessionErr) throw sessionErr;

    const sessionIds: string[] = (sessions ?? []).map(
      (s: { id: string }) => s.id,
    );

    if (sessionIds.length === 0) {
      return jsonResponse(
        { recommendations: [] },
        200,
        "public, s-maxage=86400, stale-while-revalidate=3600",
      );
    }

    // Step 2: Find top 20 callsigns that check into this net
    const { data: checkins, error: checkinErr } = await supabase
      .from("net_checkins")
      .select("callsign")
      .in("session_id", sessionIds)
      .limit(5000);

    if (checkinErr) throw checkinErr;

    const callCountMap = new Map<string, number>();
    for (const row of (checkins ?? []) as { callsign: string }[]) {
      if (row.callsign) {
        callCountMap.set(
          row.callsign,
          (callCountMap.get(row.callsign) ?? 0) + 1,
        );
      }
    }

    const topCallsigns = [...callCountMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([cs]) => cs);

    if (topCallsigns.length === 0) {
      return jsonResponse(
        { recommendations: [] },
        200,
        "public, s-maxage=86400, stale-while-revalidate=3600",
      );
    }

    // Step 3: Find all checkins by those callsigns across ALL nets
    const { data: allCheckins, error: allErr } = await supabase
      .from("net_checkins")
      .select("callsign, session_id")
      .in("callsign", topCallsigns)
      .limit(5000);

    if (allErr) throw allErr;

    // Step 4: Gather unique session IDs from those checkins
    const allSessionIds = [
      ...new Set(
        ((allCheckins ?? []) as { session_id: string }[]).map(
          (c) => c.session_id,
        ),
      ),
    ];

    if (allSessionIds.length === 0) {
      return jsonResponse(
        { recommendations: [] },
        200,
        "public, s-maxage=86400, stale-while-revalidate=3600",
      );
    }

    // Step 5: Map session IDs to net IDs (completed only)
    const { data: allSessions, error: allSessErr } = await supabase
      .from("net_sessions")
      .select("id, net_id")
      .in("id", allSessionIds)
      .eq("status", "completed");

    if (allSessErr) throw allSessErr;

    const sessToNet = new Map<string, string>();
    for (const s of (allSessions ?? []) as {
      id: string;
      net_id: string;
    }[]) {
      sessToNet.set(s.id, s.net_id);
    }

    // Step 6: Count how many top participants check into each other net
    // Use a set per net to count unique callsigns, not total checkins
    const netCallsignSets = new Map<string, Set<string>>();
    for (const row of (allCheckins ?? []) as {
      callsign: string;
      session_id: string;
    }[]) {
      const otherNetId = sessToNet.get(row.session_id);
      if (!otherNetId || otherNetId === netId) continue;

      if (!netCallsignSets.has(otherNetId)) {
        netCallsignSets.set(otherNetId, new Set());
      }
      netCallsignSets.get(otherNetId)!.add(row.callsign);
    }

    // Step 7: Sort by overlap count (unique callsigns), take top 5
    const topNetIds = [...netCallsignSets.entries()]
      .sort((a, b) => b[1].size - a[1].size)
      .slice(0, 5);

    if (topNetIds.length === 0) {
      return jsonResponse(
        { recommendations: [] },
        200,
        "public, s-maxage=86400, stale-while-revalidate=3600",
      );
    }

    // Step 8: Fetch net metadata for the recommended nets
    const recommendedNetIds = topNetIds.map(([id]) => id);
    const { data: nets, error: netErr } = await supabase
      .from("nets")
      .select("id, name, frequency")
      .in("id", recommendedNetIds);

    if (netErr) throw netErr;

    const netMap = new Map(
      ((nets ?? []) as { id: string; name: string; frequency: string }[]).map(
        (n) => [n.id, { name: n.name, frequency: n.frequency }],
      ),
    );

    const recommendations = topNetIds
      .map(([id, callsignSet]) => {
        const net = netMap.get(id);
        if (!net) return null;
        return {
          netId: id,
          name: net.name,
          frequency: net.frequency ?? "",
          overlapCount: callsignSet.size,
        };
      })
      .filter(Boolean);

    return jsonResponse(
      { recommendations },
      200,
      "public, s-maxage=86400, stale-while-revalidate=3600",
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return jsonResponse(
      { error: `Failed to compute recommendations: ${message}` },
      500,
    );
  }
}
