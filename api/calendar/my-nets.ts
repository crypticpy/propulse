/**
 * Vercel Edge Function: My Nets ICS Calendar Bundle
 *
 * Authenticated endpoint that returns an ICS calendar file containing
 * all nets a user has subscribed to. Uses a calendar token (not JWT)
 * for auth since calendar apps cannot send Bearer headers.
 *
 * GET /api/calendar/my-nets.ics?token=<64-char-hex>
 */

import { createClient } from "@supabase/supabase-js";
import { checkRateLimit, rateLimitResponse } from "../_lib/rateLimit";
import { generateBundleIcs, generateEmptyCalendar } from "../_lib/icsGenerator";
import type { NetRow } from "../_lib/icsGenerator";

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

  // Extract token from query param
  const url = new URL(request.url);
  const token = url.searchParams.get("token");

  if (!token || token.length < 32) {
    return new Response(JSON.stringify({ error: "Missing or invalid token" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Rate limit: 30 req/min per token (use first 8 chars as identifier)
  const tokenPrefix = token.slice(0, 8);
  const rlResult = checkRateLimit("calendar/my-nets", tokenPrefix, 30, 60);
  if (!rlResult.success) {
    return rateLimitResponse("*", rlResult.reset);
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceRoleKey) {
    return new Response(JSON.stringify({ error: "Server misconfiguration" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    // Use service role key to bypass RLS for token lookup
    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

    // Look up the calendar token
    const { data: tokenRow, error: tokenError } = await supabase
      .from("calendar_tokens")
      .select("user_id")
      .eq("token", token)
      .single();

    if (tokenError || !tokenRow) {
      return new Response(
        JSON.stringify({ error: "Invalid or expired token" }),
        {
          status: 401,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    const userId = tokenRow.user_id;

    // Fire-and-forget: update last_used_at on the token row
    supabase
      .from("calendar_tokens")
      .update({ last_used_at: new Date().toISOString() })
      .eq("token", token)
      .then(() => {
        // intentionally ignored — fire and forget
      });

    // Fetch the user's net subscriptions
    const { data: subscriptions, error: subError } = await supabase
      .from("net_subscriptions")
      .select("net_id")
      .eq("user_id", userId);

    if (subError) {
      return new Response(
        JSON.stringify({ error: "Failed to fetch subscriptions" }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    // If no subscriptions, return empty calendar
    if (!subscriptions || subscriptions.length === 0) {
      const ics = generateEmptyCalendar();
      return new Response(ics, {
        status: 200,
        headers: {
          "Content-Type": "text/calendar; charset=utf-8",
          "Content-Disposition": 'attachment; filename="my-nets.ics"',
          "Cache-Control": "private, no-cache, no-store, must-revalidate",
        },
      });
    }

    // Fetch all subscribed nets
    const netIds = subscriptions.map((s) => s.net_id);
    const { data: nets, error: netsError } = await supabase
      .from("nets")
      .select("*")
      .in("id", netIds);

    if (netsError || !nets) {
      return new Response(
        JSON.stringify({ error: "Failed to fetch net details" }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    const ics = generateBundleIcs(nets as NetRow[], "My Nets \u2014 Propulse");

    return new Response(ics, {
      status: 200,
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": 'attachment; filename="my-nets.ics"',
        "Cache-Control": "private, no-cache, no-store, must-revalidate",
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
