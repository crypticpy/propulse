/**
 * Vercel Edge Function: SOTA API Proxy
 *
 * Proxies requests to the Summits on the Air (SOTA) API to avoid CORS restrictions.
 * Supports summit search and summit details.
 *
 * Cache: 5 minutes with 2 minute stale-while-revalidate
 */

import { applyRateLimit } from "../_lib/rateLimit";

export const config = {
  runtime: "edge",
};

/** Get the allowed CORS origin based on environment */
function getAllowedOrigin(): string {
  return process.env.ALLOWED_ORIGIN || "https://propulse.vercel.app";
}

const SOTA_API_BASE = "https://api2.sota.org.uk/api";

/** Standard headers for SOTA API requests */
const SOTA_HEADERS = {
  Accept: "application/json",
  "User-Agent": "Propulse/1.0 (Ham Radio Propagation Dashboard)",
};

/** Standard CORS response headers */
function corsHeaders(): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": getAllowedOrigin(),
    "Access-Control-Allow-Methods": "GET, OPTIONS",
  };
}

/** Summit record from SOTA API */
interface SOTASummit {
  SummitCode: string;
  SummitName: string;
  AltM: number;
  AltFt: number;
  Points: number;
  BonusPoints: number;
  ValidFrom: string;
  ValidTo: string;
  ActivationCount: number;
  ActivationDate: string;
  ActivationCall: string;
  RegionCode: string;
  RegionName: string;
  AssociationCode: string;
  AssociationName: string;
  Latitude: number;
  Longitude: number;
}

/** Normalized summit for frontend consumption */
interface NormalizedSummit {
  ref: string;
  name: string;
  altitude: number;
  points: number;
  region: string;
}

/** Normalize a SOTA summit record for the frontend */
function normalizeSummit(summit: SOTASummit): NormalizedSummit {
  return {
    ref: summit.SummitCode,
    name: summit.SummitName,
    altitude: summit.AltM,
    points: summit.Points + (summit.BonusPoints || 0),
    region: summit.RegionName || summit.AssociationName || "",
  };
}

export default async function handler(request: Request): Promise<Response> {
  // Handle CORS preflight
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        ...corsHeaders(),
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Max-Age": "86400",
      },
    });
  }

  const limited = applyRateLimit(request, "activation/sota", 60, 60);
  if (limited) return limited;

  const url = new URL(request.url);
  const search = url.searchParams.get("search");
  const ref = url.searchParams.get("ref");

  try {
    // Search summits
    if (search) {
      // SOTA API uses association/region prefix search
      // Try the SOTA associations endpoint for autocomplete-like behavior
      const sotaUrl = `${SOTA_API_BASE}/summits/${encodeURIComponent(search)}`;
      const response = await fetch(sotaUrl, { headers: SOTA_HEADERS });

      if (!response.ok) {
        // If single summit lookup fails, try as association search
        if (response.status === 404) {
          return new Response(JSON.stringify({ summits: [] }), {
            status: 200,
            headers: {
              ...corsHeaders(),
              "Cache-Control": "s-maxage=300, stale-while-revalidate=120",
            },
          });
        }
        return new Response(
          JSON.stringify({ error: `SOTA API returned ${response.status}` }),
          { status: response.status, headers: corsHeaders() },
        );
      }

      const data = await response.json();
      // SOTA API returns either a single summit or an array depending on the query
      let summits: NormalizedSummit[];
      if (Array.isArray(data)) {
        summits = data.slice(0, 10).map(normalizeSummit);
      } else if (data && typeof data === "object" && "SummitCode" in data) {
        summits = [normalizeSummit(data as SOTASummit)];
      } else {
        summits = [];
      }

      return new Response(JSON.stringify({ summits }), {
        status: 200,
        headers: {
          ...corsHeaders(),
          "Cache-Control": "s-maxage=300, stale-while-revalidate=120",
        },
      });
    }

    // Get summit details
    if (ref) {
      const sotaUrl = `${SOTA_API_BASE}/summits/${encodeURIComponent(ref)}`;
      const response = await fetch(sotaUrl, { headers: SOTA_HEADERS });

      if (!response.ok) {
        return new Response(
          JSON.stringify({ error: `SOTA API returned ${response.status}` }),
          { status: response.status, headers: corsHeaders() },
        );
      }

      const data = (await response.json()) as SOTASummit;
      const summit = normalizeSummit(data);

      return new Response(JSON.stringify({ summit }), {
        status: 200,
        headers: {
          ...corsHeaders(),
          "Cache-Control": "s-maxage=300, stale-while-revalidate=120",
        },
      });
    }

    return new Response(
      JSON.stringify({
        error: "Missing query parameter. Use ?search= or ?ref=",
      }),
      { status: 400, headers: corsHeaders() },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";

    return new Response(
      JSON.stringify({ error: `Failed to fetch SOTA data: ${message}` }),
      {
        status: 500,
        headers: { ...corsHeaders(), "Cache-Control": "no-cache" },
      },
    );
  }
}
