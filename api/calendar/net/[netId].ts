/**
 * Vercel Edge Function: Per-Net ICS Calendar Feed
 *
 * Public endpoint that returns an ICS calendar file for a single net.
 * Calendar apps (Google Calendar, Apple Calendar, Outlook) can subscribe
 * to this URL for automatic updates.
 *
 * GET /api/calendar/net/<netId>.ics
 */

import { createClient } from "@supabase/supabase-js";
import { applyRateLimit } from "../../_lib/rateLimit";
import { generateNetIcs, sanitizeFilename } from "../../_lib/icsGenerator";
import type { NetRow } from "../../_lib/icsGenerator";

export const config = {
  runtime: "edge",
};

export default async function handler(request: Request): Promise<Response> {
  // Only allow GET requests
  if (request.method !== "GET") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Rate limit: 60 req/min/IP
  const limited = applyRateLimit(request, "calendar/net", 60, 60);
  if (limited) return limited;

  // Parse netId from URL path, stripping .ics extension
  const url = new URL(request.url);
  const pathSegments = url.pathname.split("/");
  const lastSegment = pathSegments[pathSegments.length - 1] || "";
  const netId = lastSegment.replace(/\.ics$/i, "");

  if (!netId) {
    return new Response(JSON.stringify({ error: "Missing net ID" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return new Response(JSON.stringify({ error: "Server misconfiguration" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    // Use anon key — RLS enforces public/unlisted visibility
    const supabase = createClient(supabaseUrl, supabaseAnonKey);

    const { data: net, error } = await supabase
      .from("nets")
      .select("*")
      .eq("id", netId)
      .single();

    if (error || !net) {
      return new Response(JSON.stringify({ error: "Net not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    const ics = generateNetIcs(net as NetRow);
    const filename = sanitizeFilename(net.name) + ".ics";

    return new Response(ics, {
      status: 200,
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=1800",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: `Failed to generate calendar: ${message}` }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}
